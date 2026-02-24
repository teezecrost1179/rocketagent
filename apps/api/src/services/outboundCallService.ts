import { prisma } from "../lib/prisma";
import { buildHistorySignals } from "./historySummaryService";
import { createRetellOutboundCall } from "./retellService";
import { normalizePhone } from "../utils/phone";

type StartOutboundCallInput = {
  phone: string;
  subscriberSlug: string;
  transferPreselect?: string;
};

export class OutboundCallError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function startOutboundCall({
  phone,
  subscriberSlug,
  transferPreselect,
}: StartOutboundCallInput) {
  if (!phone || typeof phone !== "string") {
    throw new OutboundCallError(400, "Missing or invalid phone number");
  }

  const normalizedSubscriberSlug = (subscriberSlug || "").toLowerCase().trim();
  if (!normalizedSubscriberSlug) {
    throw new OutboundCallError(404, "Call channel unavailable");
  }

  const toNumber = normalizePhone(phone);
  if (!toNumber.startsWith("+") || !/^\+\d{11,15}$/.test(toNumber)) {
    throw new OutboundCallError(
      400,
      `Invalid phone number format after normalization: ${toNumber}`
    );
  }

  const voiceChannel = await prisma.subscriberChannel.findFirst({
    where: {
      channel: "VOICE",
      enabled: true,
      subscriber: { slug: normalizedSubscriberSlug },
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
    throw new OutboundCallError(404, "Call channel unavailable");
  }

  if (voiceChannel.aiProvider !== "RETELL") {
    console.warn("[call] aiProvider is not RETELL; defaulting to Retell for now", {
      subscriberSlug: normalizedSubscriberSlug,
      aiProvider: voiceChannel.aiProvider,
    });
    // TODO: route to the correct AI provider when multiple are supported.
  }

  if (!voiceChannel.providerNumberE164) {
    console.error("[call] Missing providerNumberE164 for subscriber", {
      subscriberSlug: normalizedSubscriberSlug,
    });
    throw new OutboundCallError(500, "Call channel unavailable");
  }

  if (!voiceChannel.providerAgentIdOutbound) {
    console.error("[call] Missing providerAgentIdOutbound for subscriber", {
      subscriberSlug: normalizedSubscriberSlug,
    });
    throw new OutboundCallError(500, "Call channel unavailable");
  }

  if (
    voiceChannel.transportProvider !== "RETELL" &&
    voiceChannel.transportProvider !== "TWILIO"
  ) {
    console.warn("[call] Unexpected transportProvider for VOICE", {
      subscriberSlug: normalizedSubscriberSlug,
      transportProvider: voiceChannel.transportProvider,
    });
  }

  const historySummary = await buildHistorySignals({
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
      subscriber_slug: normalizedSubscriberSlug,
      phone_number: toNumber,
      ...(historySummary ? { history_summary: historySummary } : {}),
      ...(transferPreselect ? { transfer_preselect: transferPreselect } : {}),
    },
  });

  const providerCallId = data?.call_id || data?.callId || data?.call?.call_id || null;

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
      subscriberSlug: normalizedSubscriberSlug,
    });
  }

  return { data };
}
