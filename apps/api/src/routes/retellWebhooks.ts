import { Router } from "express";
import { prisma } from "../lib/prisma";

const router = Router();

type RetellCallPayload = {
  event?: string;
  call?: {
    call_id?: string;
    call_type?: string;
    agent_id?: string;
    call_status?: string;
    start_timestamp?: number;
    end_timestamp?: number;
    duration_ms?: number;
    transcript?: string;
    from_number?: string;
    to_number?: string;
    direction?: string;
    call_analysis?: {
      call_summary?: string;
    };
  };
};

function mapDirection(direction?: string): "INBOUND" | "OUTBOUND" {
  return direction?.toLowerCase() === "outbound" ? "OUTBOUND" : "INBOUND";
}

function mapStatus(callStatus?: string): "IN_PROGRESS" | "COMPLETED" {
  return callStatus === "ongoing" ? "IN_PROGRESS" : "COMPLETED";
}

// Retell voice webhook endpoint (persists call lifecycle + transcript data)
router.post("/retell/voice-webhook", async (req, res) => {
  try {
    const payload = req.body as RetellCallPayload;
    const event = payload.event;
    const call = payload.call;

    if (!call?.call_id || !call.agent_id) {
      console.warn("[Retell voice webhook] Missing call_id or agent_id", {
        event,
      });
      return res.status(200).json({ ok: true });
    }

    const direction = mapDirection(call.direction);

    const channelMatchWhere =
      call.direction && call.direction.toLowerCase() === "outbound"
        ? { providerAgentIdOutbound: call.agent_id }
        : call.direction && call.direction.toLowerCase() === "inbound"
        ? { providerAgentIdInbound: call.agent_id }
        : {
            OR: [
              { providerAgentIdOutbound: call.agent_id },
              { providerAgentIdInbound: call.agent_id },
            ],
          };

    const matchingChannels = await prisma.subscriberChannel.findMany({
      where: {
        channel: "VOICE",
        enabled: true,
        ...channelMatchWhere,
      },
      select: {
        id: true,
        subscriberId: true,
      },
    });

    if (matchingChannels.length === 0) {
      console.warn("[Retell voice webhook] No matching VOICE channel", {
        event,
        callId: call.call_id,
        agentId: call.agent_id,
      });
      return res.status(200).json({ ok: true });
    }

    if (matchingChannels.length > 1) {
      console.error("[Retell voice webhook] Multiple VOICE channels matched", {
        event,
        callId: call.call_id,
        agentId: call.agent_id,
        matches: matchingChannels.map((m) => m.id),
      });
      return res.status(200).json({ ok: true });
    }

    const channel = matchingChannels[0];

    const existing = await prisma.interaction.findFirst({
      where: {
        channel: "VOICE",
        provider: "RETELL",
        providerCallId: call.call_id,
      },
      select: { id: true },
    });

    let interactionId = existing?.id || null;

    if (!existing) {
      const created = await prisma.interaction.create({
        data: {
          subscriberId: channel.subscriberId,
          channel: "VOICE",
          direction,
          status: mapStatus(call.call_status),
          provider: "RETELL",
          providerCallId: call.call_id,
          fromNumberE164: call.from_number || null,
          toNumberE164: call.to_number || null,
          startedAt: call.start_timestamp
            ? new Date(call.start_timestamp)
            : undefined,
          endedAt: call.end_timestamp ? new Date(call.end_timestamp) : undefined,
          durationSec: call.duration_ms ? Math.round(call.duration_ms / 1000) : undefined,
        },
        select: { id: true },
      });
      interactionId = created.id;
    }

    if (interactionId) {
      if (event === "call_ended" || event === "call_analyzed") {
        await prisma.interaction.update({
          where: { id: interactionId },
          data: {
            status: mapStatus(call.call_status),
            endedAt: call.end_timestamp ? new Date(call.end_timestamp) : undefined,
            durationSec: call.duration_ms ? Math.round(call.duration_ms / 1000) : undefined,
          },
        });
      } else if (event === "call_started") {
        await prisma.interaction.update({
          where: { id: interactionId },
          data: {
            status: mapStatus(call.call_status),
            fromNumberE164: call.from_number || null,
            toNumberE164: call.to_number || null,
            startedAt: call.start_timestamp
              ? new Date(call.start_timestamp)
              : undefined,
          },
        });
      }
    }

    if (interactionId && call.transcript) {
      const transcriptExists = await prisma.interactionMessage.findFirst({
        where: {
          interactionId,
          role: "SYSTEM",
          content: call.transcript,
        },
        select: { id: true },
      });

      if (!transcriptExists) {
        await prisma.interactionMessage.create({
          data: {
            interactionId,
            role: "SYSTEM",
            content: call.transcript,
          },
        });
      }
    }

    if (interactionId && event === "call_analyzed" && call.call_analysis?.call_summary) {
      await prisma.interaction.update({
        where: { id: interactionId },
        data: { summary: call.call_analysis.call_summary },
      });
    }

    console.log("[Retell voice webhook] handled", {
      event,
      callId: call.call_id,
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[Retell voice webhook] error", err);
    return res.status(500).json({ ok: false });
  }
});

export default router;
