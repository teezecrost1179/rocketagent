import { Router } from "express";

const router = Router();

// Retell voice webhook endpoint (capture payload shape for later persistence)
router.post("/retell/voice-webhook", async (req, res) => {
  try {
    console.log("[Retell voice webhook]", req.body);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[Retell voice webhook] error", err);
    return res.status(500).json({ ok: false });
  }
});

export default router;
