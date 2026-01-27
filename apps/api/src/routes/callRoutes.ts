import { Router } from "express";
import { prisma } from "../lib/prisma";
import { createRetellOutboundCall } from "../services/retellService";
import { buildHistorySummary } from "../services/historySummaryService";
import { normalizePhone } from "../utils/phone";

const router = Router();

// Endpoint to trigger an outbound call from the form
router.post("/call", async (req, res) => {
  try {
    const { phone, name, subscriber } = req.body;

    if (!phone || typeof phone !== "string") {
      return res.status(400).json({ error: "Missing or invalid phone number" });
    }

    const subscriberSlug = (subscriber || "").toLowerCase().trim();
    if (!subscriberSlug) {
      return res.status(404).json({ error: "Call channel unavailable" });
    }

    const toNumber = normalizePhone(phone);
    if (!toNumber.startsWith("+") || !/^\+\d{11,15}$/.test(toNumber)) {
      return res.status(400).json({
        error: `Invalid phone number format after normalization: ${toNumber}`,
      });
    }

    const voiceChannel = await prisma.subscriberChannel.findFirst({
      where: {
        channel: "VOICE",
        enabled: true,
        subscriber: { slug: subscriberSlug },
      },
      select: {
        subscriberId: true,
        transportProvider: true,
        aiProvider: true,
        providerNumberE164: true,
        providerAgentIdOutbound: true,
      },
    });

    if (!voiceChannel) {
      return res.status(404).json({ error: "Call channel unavailable" });
    }

    if (voiceChannel.aiProvider !== "RETELL") {
      console.warn(
        "[call] aiProvider is not RETELL; defaulting to Retell for now",
        {
          subscriberSlug,
          aiProvider: voiceChannel.aiProvider,
        }
      );
      // TODO: route to the correct AI provider when multiple are supported.
    }

    if (!voiceChannel.providerNumberE164) {
      console.error("[call] Missing providerNumberE164 for subscriber", {
        subscriberSlug,
      });
      return res.status(500).json({ error: "Call channel unavailable" });
    }

    if (!voiceChannel.providerAgentIdOutbound) {
      console.error("[call] Missing providerAgentIdOutbound for subscriber", {
        subscriberSlug,
      });
      return res.status(500).json({ error: "Call channel unavailable" });
    }

    if (voiceChannel.transportProvider !== "RETELL" && voiceChannel.transportProvider !== "TWILIO") {
      console.warn("[call] Unexpected transportProvider for VOICE", {
        subscriberSlug,
        transportProvider: voiceChannel.transportProvider,
      });
    }

    const historySummary = await buildHistorySummary({
      subscriberId: voiceChannel.subscriberId,
      phoneNumber: toNumber,
      channel: "VOICE",
      maxInteractions: 3,
      lookbackMonths: 6,
    });

    const data = await createRetellOutboundCall({
      fromNumber: voiceChannel.providerNumberE164,
      toNumber,
      agentId: voiceChannel.providerAgentIdOutbound,
      dynamicVariables: {
        call_type: "outbound",
        ...(historySummary ? { history_summary: historySummary } : {}),
      },
    });

    const providerCallId =
      data?.call_id || data?.callId || data?.call?.call_id || null;

    if (providerCallId) {
      const existing = await prisma.interaction.findFirst({
        where: {
          channel: "VOICE",
          provider: "RETELL",
          providerCallId,
        },
        select: { id: true },
      });

      if (!existing) {
        await prisma.interaction.create({
          data: {
            subscriberId: voiceChannel.subscriberId,
            channel: "VOICE",
            direction: "OUTBOUND",
            status: "STARTED",
            provider: "RETELL",
            providerCallId,
            fromNumberE164: voiceChannel.providerNumberE164,
            toNumberE164: toNumber,
            summary: historySummary || null,
          },
        });
      }
    } else {
      console.warn("[call] Retell response missing call_id", {
        subscriberSlug,
      });
    }

    return res.json({ success: true, data });
  } catch (err: any) {
    console.error("Error in /call:", err?.response?.data || err.message);

    if (err.message && err.message.startsWith("Invalid phone number format")) {
      return res.status(400).json({ error: err.message });
    }

    return res.status(500).json({ error: "Failed to trigger call" });
  }
});

export default router;
