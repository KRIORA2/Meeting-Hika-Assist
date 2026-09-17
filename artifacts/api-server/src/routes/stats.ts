import { Router } from "express";
import { getUserStats } from "../lib/store";

const router = Router();

router.get("/stats", async (req, res) => {
  try {
    return res.json(await getUserStats(req.authUser!.id));
  } catch (err) {
    req.log.error({ err }, "GET /stats failed");
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
