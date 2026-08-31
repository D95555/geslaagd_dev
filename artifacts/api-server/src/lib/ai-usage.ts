import type { AiUsage } from "./ai";
import { logger } from "./logger";
import { restService } from "./supabase";

/**
 * Records one AI call's token usage against a subject, mirroring
 * firecrawl_usage so admins get a full cost picture. Token counts only --
 * no fabricated dollar amount, since real per-token pricing for the
 * configured models isn't something to guess at here.
 */
export async function recordAiUsage(
  subjectId: string | null,
  taskType: string,
  usage: AiUsage,
): Promise<void> {
  try {
    await restService("ai_usage", {
      method: "POST",
      body: JSON.stringify({
        subject_id: subjectId,
        task_type: taskType,
        model: usage.model,
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens,
      }),
    });
  } catch (error) {
    logger.warn({ error, subjectId, taskType }, "Could not record AI usage");
  }
}

/** Convenience: an onUsage callback bound to a subject + task type. */
export function aiUsageRecorder(subjectId: string | null, taskType: string): (usage: AiUsage) => void {
  return (usage) => {
    void recordAiUsage(subjectId, taskType, usage);
  };
}
