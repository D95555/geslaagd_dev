import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

/** Curriculum design, source review and all study-content generation. */
export const STRONG_MODEL = "claude-sonnet-4-6";
/** Triage, source scoring, grading and StudyHandler chat. */
export const FAST_MODEL = "gpt-5.6-luna";

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
}): Promise<unknown> {
  const response = await anthropic.messages.create({
    model: STRONG_MODEL,
    max_tokens: input.maxTokens ?? 16_000,
    system: input.system,
    messages: [{ role: "user", content: input.user }],
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
  const text = completion.choices[0]?.message.content ?? "";
  if (!text.trim()) throw new Error("Fast model returned an empty response.");
  return extractJson(text);
}

export async function callFastText(input: {
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  maxTokens?: number;
}): Promise<string> {
  const completion = await openai.chat.completions.create({
    model: FAST_MODEL,
    ...(input.maxTokens ? { max_completion_tokens: input.maxTokens } : {}),
    messages: [{ role: "system", content: input.system }, ...input.messages],
  });
  const text = completion.choices[0]?.message.content ?? "";
  if (!text.trim()) throw new Error("Fast model returned an empty response.");
  return text;
}
