/**
 * Exercises the student-side logic against real generated content.
 *
 * Only multiple-choice questions are graded here, so this makes no AI calls
 * and costs nothing to run. Open questions go through the model and are
 * covered by clicking through the UI instead.
 *
 *   npx tsx --env-file=../../.env.local verify-student-logic.ts
 */
import { gradeSubmission } from "./src/lib/grading";
import { computeChapterProgress, computeSubjectProgress } from "./src/lib/progress";
import {
  pointsToGrade,
  questionBankSchema,
  shuffleForStudent,
  toPublicQuestion,
} from "./src/lib/study-content";
import { restService } from "./src/lib/supabase";

type Row = Record<string, unknown>;

let failures = 0;
function check(label: string, condition: boolean, detail = ""): void {
  console.log(`  ${condition ? "OK  " : "FOUT"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures += 1;
}

async function main(): Promise<void> {
  console.log("\n1. Cijferschaal (Nederlands 1,0–10,0)");
  check("0 punten geeft een 1,0", pointsToGrade(0, 50) === 1);
  check("alles goed geeft een 10,0", pointsToGrade(50, 50) === 10);
  check("de helft geeft een 5,5", pointsToGrade(25, 50) === 5.5);
  check("meer dan max blijft 10,0", pointsToGrade(80, 50) === 10);
  check("geen punten mogelijk geeft 1,0", pointsToGrade(5, 0) === 1);

  console.log("\n2. Voortgangsweging");
  const withExam = computeChapterProgress({
    summaryRead: true,
    exerciseBestScore: 10,
    examBestScore: 10,
    hasExam: true,
  });
  check("gelezen + twee tienen met tentamen = 100%", withExam === 100, `${withExam}%`);
  const withoutExam = computeChapterProgress({
    summaryRead: true,
    exerciseBestScore: 10,
    examBestScore: null,
    hasExam: false,
  });
  check("gelezen + tien zonder tentamen = 100%", withoutExam === 100, `${withoutExam}%`);
  const readOnly = computeChapterProgress({
    summaryRead: true,
    exerciseBestScore: null,
    examBestScore: null,
    hasExam: true,
  });
  check("alleen gelezen met tentamen = 20%", readOnly === 20, `${readOnly}%`);
  const nothing = computeChapterProgress({
    summaryRead: false,
    exerciseBestScore: null,
    examBestScore: null,
    hasExam: true,
  });
  check("niets gedaan = 0%", nothing === 0, `${nothing}%`);
  check(
    "vakvoortgang is het gemiddelde",
    computeSubjectProgress([{ progress: 100 }, { progress: 0 }]) === 50,
  );

  console.log("\n3. Echte vragenset uit de database");
  const rows = await restService<Row[]>(
    "study_content?content_type=eq.exercise_bank&status=eq.ready&select=id,chapter_id,content&limit=1",
  );
  const row = rows[0];
  if (!row) {
    console.log("  OVERGESLAGEN — geen oefenset gevonden");
    return;
  }
  const parsed = questionBankSchema.safeParse(row.content);
  check("opgeslagen oefenset voldoet aan het schema", parsed.success);
  if (!parsed.success) {
    console.log("   ", parsed.error.issues.slice(0, 3));
    return;
  }
  const bank = parsed.data;
  const mc = bank.questions.filter((question) => question.type === "mc");
  console.log(`  (${bank.questions.length} vragen, waarvan ${mc.length} meerkeuze)`);
  check("elke vraag heeft een onderwerp", bank.questions.every((q) => q.topicTag.length > 0));
  check("elke mc-vraag heeft 4 opties", mc.every((q) => (q.options?.length ?? 0) === 4));
  check("elke mc-vraag heeft een juist antwoord", mc.every((q) => Boolean(q.correctKey)));
  check(
    "het juiste antwoord staat tussen de opties",
    mc.every((q) => q.options?.some((o) => o.key.toUpperCase() === q.correctKey?.toUpperCase())),
  );
  check(
    "open vragen hebben een antwoordmodel",
    bank.questions.filter((q) => q.type === "open").every((q) => Boolean(q.rubric?.modelAnswer)),
  );

  console.log("\n4. Wat de student te zien krijgt");
  const publicQuestions = bank.questions.map(toPublicQuestion);
  const leaked = JSON.stringify(publicQuestions);
  check("het juiste antwoord lekt niet", !leaked.includes("correctKey"));
  check("het antwoordmodel lekt niet", !leaked.includes("modelAnswer"));

  console.log("\n5. Volgorde per student");
  const a1 = shuffleForStudent(bank.questions, "student-a", "hoofdstuk-1").map((q) => q.index);
  const a2 = shuffleForStudent(bank.questions, "student-a", "hoofdstuk-1").map((q) => q.index);
  const b1 = shuffleForStudent(bank.questions, "student-b", "hoofdstuk-1").map((q) => q.index);
  check("dezelfde student krijgt dezelfde volgorde", JSON.stringify(a1) === JSON.stringify(a2));
  check("een andere student krijgt een andere volgorde", JSON.stringify(a1) !== JSON.stringify(b1));
  check("er raakt geen vraag zoek", new Set(a1).size === bank.questions.length);

  console.log("\n6. Nakijken van meerkeuze (zonder AI)");
  const allRight = await gradeSubmission(
    mc,
    mc.map((q) => ({ questionIndex: q.index, answer: q.correctKey! })),
  );
  check("alles goed geeft een 10,0", allRight.grade === 10, `cijfer ${allRight.grade}`);
  check("alles goed is voldoende", allRight.passed);

  const allWrong = await gradeSubmission(
    mc,
    mc.map((q) => ({
      questionIndex: q.index,
      answer: q.options!.find((o) => o.key.toUpperCase() !== q.correctKey!.toUpperCase())!.key,
    })),
  );
  check("alles fout geeft een 1,0", allWrong.grade === 1, `cijfer ${allWrong.grade}`);
  check("alles fout is onvoldoende", !allWrong.passed);
  check(
    "bij een fout antwoord volgt het juiste antwoord",
    allWrong.perQuestion.every((r) => Boolean(r.correctAnswer)),
  );

  const blank = await gradeSubmission(
    mc,
    mc.map((q) => ({ questionIndex: q.index, answer: "" })),
  );
  check("niets invullen geeft een 1,0", blank.grade === 1, `cijfer ${blank.grade}`);

  console.log(
    `\n${failures === 0 ? "Alles geslaagd." : `${failures} controle(s) MISLUKT.`}\n`,
  );
  if (failures > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
