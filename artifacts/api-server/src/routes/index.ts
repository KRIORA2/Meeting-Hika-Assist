import { Router, type IRouter } from "express";
import healthRouter from "./health";
import sessionRouter from "./sessions";
import openaiRouter from "./openai";
import documentsRouter from "./documents";
import insightsRouter from "./insights";
import authRouter from "./auth";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(requireAuth, sessionRouter);
router.use(requireAuth, insightsRouter);
router.use(requireAuth, openaiRouter);
router.use(requireAuth, documentsRouter);

export default router;