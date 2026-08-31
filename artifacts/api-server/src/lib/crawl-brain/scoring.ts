import { z } from "zod";
import { FAST_MODEL, openai } from "../ai";
import { recordAiUsage } from "../ai-usage";
import { getDomainReputation } from "../domain-reputation";
import { logger } from "../logger";

export type CrawlSubject = {
  id: string;
  name: string;
  yearLevel: string;
  description?: string | null;
  emphasis?: string | null;
  preferredSourceTypes?: string | null;
};

export type FirecrawlResult = {
  url: string;
  title?: string;
  description?: string;
  markdown?: string;
};

const scoredSourceSchema = z.object({
  url: z.string().url(),
  title: z.string(),
  type: z.enum(["article", "book", "pdf", "video", "website"]),
  language: z.string().length(2),
  quality_score: z.number().int().min(1).max(5),
  confidence: z.number().min(0).max(1),
  ai_summary: z.string(),
  decline_reason: z.string().nullable(),
});
const batchResponseSchema = z.array(scoredSourceSchema);
export type ScoredSource = z.infer<typeof scoredSourceSchema>;

const SYSTEM_PROMPT = [
  "You are a source quality evaluator for Dutch high school (VWO) and first-year bachelor study material.",
  "",
  "For each source provided, evaluate and return a JSON array with one object per source containing:",
  "- url: the source URL (copy exactly)",
  "- title: cleaned title",
  "- type: one of 'article' | 'book' | 'pdf' | 'video' | 'website'",
  "- language: ISO 639-1 code ('nl' or 'en' for most cases)",
  "- quality_score: integer 1-5 where:",
  "    5 = Authoritative: official textbook, university publication, peer-reviewed, national educational platform (e.g. Khan Academy, Kennisnet, university.nl)",
  "    4 = Reliable: reputable educational site, well-sourced explainer, recognized publisher",
  "    3 = Useful: decent blog, educational YouTube, reasonably accurate but not authoritative",
  "    2 = Marginal: personal blog, unverified, partially relevant, outdated",
  "    1 = Poor: spam, irrelevant, broken, misleading",
  "- confidence: float 0.0-1.0 (your certainty in the quality_score)",
  "- ai_summary: 2-3 sentence summary of what this source covers and why it is or isn't useful for studying this subject. Written in Dutch.",
  "- decline_reason: null if score >= 3, otherwise a brief Dutch explanation of why this source is unsuitable",
  "",
  "Some sources come with a domain history: how often a source from that domain",
  "was accepted or declined in past crawls. Weigh it by your own judgment, not a",
  "fixed rule -- a domain with a strong track record may deserve a higher score",
  "or confidence even from a single prior observation if it looks convincing;",
  "a domain with many past declines deserves extra scrutiny.",
  "",
  "Return ONLY a valid JSON array. No markdown. No explanation.",
].join("\n");

async function describeDomainHistory(url: string): Promise<string | null> {
  const reputation = await getDomainReputation(url);
  if (!reputation || reputation.acceptedCount + reputation.declinedCount === 0) return null;
  return `Domeingeschiedenis: eerder ${reputation.acceptedCount}x geaccepteerd, ${reputation.declinedCount}x afgewezen.`;
}

/** Scores a batch of candidate sources, factoring in each domain's track record. */
export async function scoreBatch(
  subject: CrawlSubject,
  results: FirecrawlResult[],
): Promise<ScoredSource[]> {
  const domainHistories = await Promise.all(results.map((source) => describeDomainHistory(source.url)));

  const userMessage = [
    `Subject being studied: ${subject.name} (${subject.yearLevel})`,
    "",
    "Sources to evaluate:",
    ...results.map((source, index) => {
      const history = domainHistories[index];
      return (
        `\n[${index + 1}]\nURL: ${source.url}\nTitle: ${source.title ?? ""}\n` +
        (history ? `${history}\n` : "") +
        `Content preview: ${source.markdown?.slice(0, 800) ?? source.description ?? "(no content available)"}`
      );
    }),
  ].join("\n");

  const completion = await openai.chat.completions.create({
    model: FAST_MODEL,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `${userMessage}\n\nRespond with a JSON object of the form {"sources": [...]}.`,
      },
    ],
  });

  if (completion.usage) {
    void recordAiUsage(subject.id, "source_scoring", {
      model: FAST_MODEL,
      inputTokens: completion.usage.prompt_tokens,
      outputTokens: completion.usage.completion_tokens,
    });
  }

  const raw = JSON.parse(completion.choices[0]?.message.content ?? "{}") as unknown;
  const sourcesRaw = (raw as { sources?: unknown }).sources ?? raw;
  const parsed = batchResponseSchema.safeParse(sourcesRaw);
  if (!parsed.success) {
    logger.warn({ issues: parsed.error.issues }, "Crawl brain batch scoring returned invalid JSON");
    return results.map((source) => ({
      url: source.url,
      title: source.title ?? source.url,
      type: "website",
      language: "nl",
      quality_score: 1,
      confidence: 0,
      ai_summary: "",
      decline_reason: "Scoring failed — awaiting manual review",
    }));
  }
  return parsed.data;
}

export function determineAcceptance(
  score: number,
  confidence: number,
  totalAcceptedSoFar: number,
): "accepted" | "declined" | "pending" {
  if (score === 1) return "declined";
  if (confidence < 0.65) return "pending";
  if (totalAcceptedSoFar < 8 && score >= 3) return "accepted";
  if (score >= 4) return "accepted";
  return "declined";
}
