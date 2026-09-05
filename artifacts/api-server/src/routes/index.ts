import { Router, type IRouter } from "express";
import healthRouter from "./health";
import sessionsRouter from "./sessions";
import adminAccountsRouter from "./admin-accounts";
import adminSessionsRouter from "./admin-sessions";
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
import notificationsRouter from "./notifications";
import changelogRouter from "./changelog";
import announcementsRouter from "./announcements";
import profilesRouter from "./profiles";
import blocksRouter from "./blocks";
import conversationsRouter from "./conversations";
import messagesRouter from "./messages";

const router: IRouter = Router();

router.use(healthRouter);
router.use(sessionsRouter);
router.use(adminAccountsRouter);
router.use(adminSessionsRouter);
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
router.use(notificationsRouter);
router.use(changelogRouter);
router.use(announcementsRouter);
router.use(profilesRouter);
router.use(blocksRouter);
router.use(conversationsRouter);
router.use(messagesRouter);

export default router;
