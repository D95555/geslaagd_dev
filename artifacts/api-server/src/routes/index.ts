import { Router, type IRouter } from "express";
import healthRouter from "./health";
import sessionsRouter from "./sessions";
import adminRouter from "./admin";
import studyRouter from "./study";
import eventsRouter from "./events";
import crawlRouter from "./crawl";
import sourcesRouter from "./sources";
import subjectsRouter from "./subjects";
import studyChatRouter from "./study-chat";
import studyExercisesRouter from "./study-exercises";
import studyProgressRouter from "./study-progress";
import adminPipelineRouter from "./admin-pipeline";
import adminVerkennerRouter from "./admin-verkenner";
import supportRouter from "./support";
import billingRouter from "./billing";

const router: IRouter = Router();

router.use(healthRouter);
router.use(sessionsRouter);
router.use(adminRouter);
router.use(studyRouter);
router.use(eventsRouter);
router.use(crawlRouter);
router.use(sourcesRouter);
// Study Module — more specific chapter routes are registered before the
// broader /subjects routes so they are matched first.
router.use(studyExercisesRouter);
router.use(studyProgressRouter);
router.use(studyChatRouter);
router.use(subjectsRouter);
router.use(adminPipelineRouter);
router.use(adminVerkennerRouter);
router.use(supportRouter);
router.use(billingRouter);

export default router;
