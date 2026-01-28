import { Router } from "express";
import { prisma } from "../lib/prisma";
import { buildHistorySummary } from "../services/historySummaryService";

const router = Router();

// Retell inbound voice webhook (capture payload shape for routing/context)
router.post("/retell/voice-inbound", async (req, res) => {
  try {
    const payload = req.body || {};
    console.log("[Retell inbound voice webhook]", payload);

    const callInbound = payload.call_inbound || {};
    const fromNumber = callInbound.from_number;
    const toNumber = callInbound.to_number;

    if (!fromNumber || !toNumber) {
      return res.status(200).json({ dynamic_variables: {} });
    }

    const channel = await prisma.subscriberChannel.findFirst({
      where: {
        channel: "VOICE",
        enabled: true,
        providerNumberE164: toNumber,
      },
      select: {
        subscriberId: true,
      },
    });

    if (!channel) {
      return res.status(200).json({ dynamic_variables: {} });
    }

    const historySummary = await buildHistorySummary({
      subscriberId: channel.subscriberId,
      phoneNumber: fromNumber,
      channel: "VOICE",
      maxInteractions: 3,
      lookbackMonths: 6,
    });

    return res.status(200).json({
      dynamic_variables: historySummary ? { history_summary: historySummary } : {},
    });
  } catch (err) {
    console.error("[Retell inbound voice webhook] error", err);
    return res.status(500).json({ ok: false });
  }
});

export default router;
