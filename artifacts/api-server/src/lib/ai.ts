import OpenAI from "openai";
import { logger } from "./logger";

/** Deep reasoning: curriculum structure, the summaries students read, exams. */
export const STRONG_MODEL = "gpt-5.6-sol";
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
  contradiction_check: "fast",
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

export const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

/**
 * Wraps a chat completion with exponential backoff on transient throttling
 * (429) and brief server errors (500/503). Free-token/quota throttling under a
 * heavy build shows up as intermittent 429s; retrying with a short wait rides
 * them out instead of failing the whole pipeline task. Honours a Retry-After
 * header when present.
 */
async function createChatWithRetry(
  body: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
  attempts = 6,
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await openai.chat.completions.create(body);
    } catch (error) {
      lastError = error;
      const status = (error as { status?: number }).status;
      if (status !== 429 && status !== 500 && status !== 503) throw error;
      if (attempt === attempts - 1) break;
      const retryAfter = Number((error as { headers?: Record<string, string> }).headers?.["retry-after"]);
      const delayMs =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : Math.min(1000 * 2 ** attempt, 30_000) + Math.floor(Math.random() * 500);
      logger.warn({ status, attempt: attempt + 1, delayMs, model: body.model }, "OpenAI call throttled; backing off");
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

/**
 * Some models on this integration wrap JSON in markdown fences or add a short
 * preamble despite instructions, so the object is extracted from the reply
 * rather than trusted verbatim.
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
  const completion = await createChatWithRetry({
    model: STRONG_MODEL,
    response_format: { type: "json_object" },
    ...(input.maxTokens ? { max_completion_tokens: input.maxTokens } : {}),
    messages: [
      { role: "system", content: input.system },
      { role: "user", content: input.user },
    ],
  });
  if (completion.usage) {
    input.onUsage?.({
      model: STRONG_MODEL,
      inputTokens: completion.usage.prompt_tokens,
      outputTokens: completion.usage.completion_tokens,
    });
  }
  const text = completion.choices[0]?.message.content ?? "";
  if (!text.trim()) throw new Error("Strong model returned an empty response.");
  return extractJson(text);
}

export async function callFastJson(input: {
  system: string;
  user: string;
  maxTokens?: number;
  onUsage?: (usage: AiUsage) => void;
}): Promise<unknown> {
  const completion = await createChatWithRetry({
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
 * Sent as an inline base64 `file` content part per the OpenAI chat
 * completions format; the caller already treats any failure here as
 * non-fatal (falls back to the snippet already on hand).
 */
export async function callStrongTextWithDocument(input: {
  system: string;
  user: string;
  documentBase64: string;
  maxTokens?: number;
  onUsage?: (usage: AiUsage) => void;
}): Promise<string> {
  const completion = await createChatWithRetry({
    model: STRONG_MODEL,
    max_completion_tokens: input.maxTokens ?? 8_000,
    messages: [
      { role: "system", content: input.system },
      {
        role: "user",
        content: [
          {
            type: "file",
            file: {
              filename: "document.pdf",
              file_data: `data:application/pdf;base64,${input.documentBase64}`,
            },
          },
          { type: "text", text: input.user },
        ],
      },
    ],
  });
  if (completion.usage) {
    input.onUsage?.({
      model: STRONG_MODEL,
      inputTokens: completion.usage.prompt_tokens,
      outputTokens: completion.usage.completion_tokens,
    });
  }
  const text = completion.choices[0]?.message.content ?? "";
  if (!text.trim()) throw new Error("Document extraction returned an empty response.");
  return text;
}

export async function callFastText(input: {
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  maxTokens?: number;
  onUsage?: (usage: AiUsage) => void;
}): Promise<string> {
  const completion = await createChatWithRetry({
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
