import { Router, type IRouter } from "express";
import healthRouter from "./health";
import sessionsRouter from "./sessions";
import insightsRouter from "./insights";
import statsRouter from "./stats";
import openaiRouter from "./openai";

const router: IRouter = Router();

router.use(healthRouter);
router.use(sessionsRouter);
router.use(insightsRouter);
router.use(statsRouter);
router.use(openaiRouter);

export default router;
