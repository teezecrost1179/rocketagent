import { Router } from "express";

const router = Router();

// Retell inbound voice webhook (capture payload shape for routing/context)
router.post("/retell/voice-inbound", async (req, res) => {
  try {
    console.log("[Retell inbound voice webhook]", req.body);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[Retell inbound voice webhook] error", err);
    return res.status(500).json({ ok: false });
  }
});

export default router;
