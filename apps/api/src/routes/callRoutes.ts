import { Router } from "express";
import { OutboundCallError, startOutboundCall } from "../services/outboundCallService";

const router = Router();

// Endpoint to trigger an outbound call from the form
router.post("/call", async (req, res) => {
  try {
    const { phone, subscriber, transferPreselect } = req.body;
    const { data } = await startOutboundCall({
      phone,
      subscriberSlug: subscriber,
      transferPreselect,
    });

    return res.json({ success: true, data });
  } catch (err: any) {
    console.error("Error in /call:", err?.response?.data || err.message);

    if (err instanceof OutboundCallError) {
      return res.status(err.status).json({ error: err.message });
    }

    return res.status(500).json({ error: "Failed to trigger call" });
  }
});

export default router;
