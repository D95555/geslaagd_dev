import { Router, type IRouter } from "express";
import healthRouter from "./health";
import sessionsRouter from "./sessions";
import adminRouter from "./admin";
import studyRouter from "./study";
import eventsRouter from "./events";

const router: IRouter = Router();

router.use(healthRouter);
router.use(sessionsRouter);
router.use(adminRouter);
router.use(studyRouter);
router.use(eventsRouter);

export default router;
