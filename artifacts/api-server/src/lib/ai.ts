import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

/** Deep reasoning: curriculum structure, the summaries students read, exams. */
export const STRONG_MODEL = "claude-sonnet-4-6";
/** Everything high-volume or derivative — an order of magnitude cheaper. */
export const FAST_MODEL = "gpt-5.6-luna";

/**
 * Which tier each pipeline step runs on, in one place so the balance between
 * cost and quality can be shifted per task without touching handler code.
 *
 * The strong model is reserved for the one decision the rest cannot recover
 * from: the chapter plan and its topic tags, which fix what every summary,
 * exercise and exam for the subject will be about. Everything downstream works
 * from that plan and from summaries already written against it.
 */
export type ModelTier = "strong" | "fast";

export const MODEL_BY_TASK = {
  triage: "fast",
  // Sets the chapter breakdown and the topic tags per chapter — one call per
  // subject, and everything downstream is shaped by it.
  curriculum_design: "strong",
  source_gathering: "fast",
  source_review: "fast",
  summary_generation: "fast",
  key_notes_generation: "fast",
  exercise_generation: "fast",
  exam_generation: "fast",
  questionnaire_generation: "fast",
  grading: "fast",
  chat: "fast",
} as const satisfies Record<string, ModelTier>;

export function modelNameFor(tier: ModelTier): string {
  return tier === "strong" ? STRONG_MODEL : FAST_MODEL;
}

export type AiUsage = { model: string; inputTokens: number; outputTokens: number };

/** Runs a JSON prompt on whichever tier the task is configured for. */
export async function callJsonForTask(
  task: keyof typeof MODEL_BY_TASK,
  input: { system: string; user: string; maxTokens?: number; onUsage?: (usage: AiUsage) => void },
): Promise<unknown> {
  return MODEL_BY_TASK[task] === "strong" ? callStrongJson(input) : callFastJson(input);
}

// Identity-linked Anthropic keys must name the workspace they act on; regular
// keys ignore the header, so it is only sent when configured.
const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID;
export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  ...(workspaceId ? { defaultHeaders: { "anthropic-workspace-id": workspaceId } } : {}),
});
export const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

/**
 * Claude has no JSON response mode, so the model is asked for JSON and the
 * object is extracted from the reply — tolerating markdown fences and any
 * short preamble the model adds despite instructions.
 */
export function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced?.[1] ?? raw).trim();

  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.search(/[[{]/);
    const end = Math.max(candidate.lastIndexOf("}"), candidate.lastIndexOf("]"));
    if (start === -1 || end <= start) {
      throw new Error("Model response contained no JSON object.");
    }
    return JSON.parse(candidate.slice(start, end + 1));
  }
}

export async function callStrongJson(input: {
  system: string;
  user: string;
  maxTokens?: number;
  onUsage?: (usage: AiUsage) => void;
}): Promise<unknown> {
  const response = await anthropic.messages.create({
    model: STRONG_MODEL,
    max_tokens: input.maxTokens ?? 16_000,
    system: input.system,
    messages: [{ role: "user", content: input.user }],
  });
  input.onUsage?.({
    model: STRONG_MODEL,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  });
  const block = response.content.find((item) => item.type === "text");
  const text = block && "text" in block ? block.text : "";
  if (!text.trim()) throw new Error("Strong model returned an empty response.");
  return extractJson(text);
}

export async function callFastJson(input: {
  system: string;
  user: string;
  maxTokens?: number;
  onUsage?: (usage: AiUsage) => void;
}): Promise<unknown> {
  const completion = await openai.chat.completions.create({
    model: FAST_MODEL,
    response_format: { type: "json_object" },
    ...(input.maxTokens ? { max_completion_tokens: input.maxTokens } : {}),
    messages: [
      { role: "system", content: input.system },
      { role: "user", content: input.user },
    ],
  });
  if (completion.usage) {
    input.onUsage?.({
      model: FAST_MODEL,
      inputTokens: completion.usage.prompt_tokens,
      outputTokens: completion.usage.completion_tokens,
    });
  }
  const text = completion.choices[0]?.message.content ?? "";
  if (!text.trim()) throw new Error("Fast model returned an empty response.");
  return extractJson(text);
}

/**
 * Reads a PDF as native document input instead of a Firecrawl scrape — free
 * (no Firecrawl credits), used for PDFs that already passed source scoring.
 * This SDK version (0.32.1) only exposes PDF document blocks through the
 * beta Messages namespace, hence `anthropic.beta.messages.create`.
 */
export async function callStrongTextWithDocument(input: {
  system: string;
  user: string;
  documentBase64: string;
  maxTokens?: number;
  onUsage?: (usage: AiUsage) => void;
}): Promise<string> {
  const response = await anthropic.beta.messages.create({
    model: STRONG_MODEL,
    betas: ["pdfs-2024-09-25"],
    max_tokens: input.maxTokens ?? 8_000,
    system: input.system,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: input.documentBase64 },
          },
          { type: "text", text: input.user },
        ],
      },
    ],
  });
  input.onUsage?.({
    model: STRONG_MODEL,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  });
  const block = response.content.find((item) => item.type === "text");
  const text = block && "text" in block ? block.text : "";
  if (!text.trim()) throw new Error("Document extraction returned an empty response.");
  return text;
}

export async function callFastText(input: {
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  maxTokens?: number;
  onUsage?: (usage: AiUsage) => void;
}): Promise<string> {
  const completion = await openai.chat.completions.create({
    model: FAST_MODEL,
    ...(input.maxTokens ? { max_completion_tokens: input.maxTokens } : {}),
    messages: [{ role: "system", content: input.system }, ...input.messages],
  });
  if (completion.usage) {
    input.onUsage?.({
      model: FAST_MODEL,
      inputTokens: completion.usage.prompt_tokens,
      outputTokens: completion.usage.completion_tokens,
    });
  }
  const text = completion.choices[0]?.message.content ?? "";
  if (!text.trim()) throw new Error("Fast model returned an empty response.");
  return text;
}
