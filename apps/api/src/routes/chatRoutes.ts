import { Router } from "express";
import {
  getRetellChatCompletion,
  createRetellOutboundCall,
} from "../services/retellService";
import { prisma } from "../lib/prisma";
import { buildHistorySummary } from "../services/historySummaryService";
import { normalizePhone } from "../utils/phone";

const router = Router();

function extractHost(value?: string) {
  if (!value) return "";
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return "";
  }
}

function isAllowedDomain(allowedDomains: string[] | null | undefined, host: string) {
  if (!allowedDomains || allowedDomains.length === 0) return true;
  return allowedDomains.map((d) => d.toLowerCase()).includes(host);
}

// Contact phone lookup for widget UX
router.get("/chat/contact-phone", async (req, res) => {
  try {
    const interactionId = (req.query.interactionId as string) || "";
    if (!interactionId) {
      return res.json({ contactPhoneE164: null });
    }

    const interaction = await prisma.interaction.findUnique({
      where: { id: interactionId },
      select: { contactPhoneE164: true },
    });

    return res.json({
      contactPhoneE164: interaction?.contactPhoneE164 || null,
    });
  } catch (err) {
    console.error("contact-phone lookup error:", err);
    return res.status(500).json({ contactPhoneE164: null });
  }
});

async function triggerOutboundCallFromChat({
  phone,
  subscriberId,
  subscriberSlug,
}: {
  phone: string;
  subscriberId: string;
  subscriberSlug: string;
}) {
  const toNumber = normalizePhone(phone);
  if (!toNumber.startsWith("+") || !/^\+\d{11,15}$/.test(toNumber)) {
    throw new Error(`Invalid phone number format after normalization: ${toNumber}`);
  }

  const voiceChannel = await prisma.subscriberChannel.findFirst({
    where: {
      channel: "VOICE",
      enabled: true,
      subscriberId,
    },
    select: {
      transportProvider: true,
      aiProvider: true,
      providerNumberE164: true,
      providerAgentIdOutbound: true,
    },
  });

  if (!voiceChannel) {
    throw new Error("Call channel unavailable");
  }

  if (voiceChannel.aiProvider !== "RETELL") {
    console.warn(
      "[chat] aiProvider is not RETELL for outbound call; defaulting to Retell for now",
      {
        subscriberSlug,
        aiProvider: voiceChannel.aiProvider,
      }
    );
    // TODO: route to the correct AI provider when multiple are supported.
  }

  if (!voiceChannel.providerNumberE164) {
    throw new Error("Missing providerNumberE164 for subscriber");
  }

  if (!voiceChannel.providerAgentIdOutbound) {
    throw new Error("Missing providerAgentIdOutbound for subscriber");
  }

  if (
    voiceChannel.transportProvider !== "RETELL" &&
    voiceChannel.transportProvider !== "TWILIO"
  ) {
    console.warn("[chat] Unexpected transportProvider for VOICE", {
      subscriberSlug,
      transportProvider: voiceChannel.transportProvider,
    });
  }

  await createRetellOutboundCall({
    fromNumber: voiceChannel.providerNumberE164,
    toNumber,
    agentId: voiceChannel.providerAgentIdOutbound,
    dynamicVariables: {
      call_type: "outbound",
    },
  });
}

// Simple Rocket Agent web chat endpoint
router.post("/chat", async (req, res) => {
  try {
    const { message, chatId, subscriber, interactionId, routingSubscriber, transferPreselect } =
      req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Missing or invalid 'message' field" });
    }

    const subscriberSlug = (subscriber || "").toLowerCase().trim();
    const routingSlug = (routingSubscriber || subscriber || "").toLowerCase().trim();
    if (!subscriberSlug || !routingSlug) {
      return res.status(404).json({ error: "Chat channel unavailable" });
    }

    const chatChannel = await prisma.subscriberChannel.findFirst({
      where: {
        channel: "CHAT",
        enabled: true,
        subscriber: { slug: routingSlug },
      },
      select: {
        subscriberId: true,
        aiProvider: true,
        providerInboxId: true,
        subscriber: {
          select: {
            allowedDomains: true,
          },
        },
      },
    });

    if (!chatChannel) {
      return res.status(404).json({ error: "Chat channel unavailable" });
    }

    // Domain allowlist: use Origin or Referer, log and allow if missing.
    const originHost = extractHost(req.headers.origin as string | undefined);
    const refererHost = extractHost(req.headers.referer as string | undefined);
    const host = originHost || refererHost;
    if (!host) {
      console.warn("[chat] Missing Origin/Referer", { subscriberSlug, routingSlug });
    } else if (!isAllowedDomain(chatChannel.subscriber.allowedDomains, host)) {
      console.warn("[chat] Origin not allowed", { subscriberSlug, routingSlug, host });
      return res.status(404).json({ error: "Chat channel unavailable" });
    }

    if (chatChannel.aiProvider !== "RETELL") {
      console.warn(
        "[chat] aiProvider is not RETELL; defaulting to Retell for now",
        {
          subscriberSlug,
          aiProvider: chatChannel.aiProvider,
        }
      );
      // TODO: route to the correct AI provider when multiple are supported.
    }

    if (!chatChannel.providerInboxId) {
      console.error("[chat] Missing providerInboxId for subscriber", {
        subscriberSlug,
      });
      return res.status(500).json({ error: "Chat channel unavailable" });
    }

    // Prefer chatId for continuity; fall back to interactionId for phone lookup only.
    const existingInteraction = chatId
      ? await prisma.interaction.findFirst({
          where: {
            subscriberId: chatChannel.subscriberId,
            channel: "CHAT",
            providerConversationId: chatId,
          },
          select: {
            id: true,
            providerConversationId: true,
            contactPhoneE164: true,
          },
        })
      : interactionId
      ? await prisma.interaction.findFirst({
          where: {
            id: interactionId,
            subscriberId: chatChannel.subscriberId,
            channel: "CHAT",
          },
          select: {
            id: true,
            providerConversationId: true,
            contactPhoneE164: true,
          },
        })
      : null;

    const interaction =
      existingInteraction ||
      (await prisma.interaction.create({
        data: {
          subscriberId: chatChannel.subscriberId,
          channel: "CHAT",
          direction: "INBOUND",
          status: "STARTED",
          provider: "RETELL",
          providerConversationId: chatId || null,
        },
        select: {
          id: true,
          providerConversationId: true,
          contactPhoneE164: true,
        },
      }));

    // Use stored contact phone (set via Retell function) for history lookups.
    const phoneForHistory = interaction.contactPhoneE164;
    let historySummary: string | null = null;

    // Build history summary only for new chats (no existing Retell chat_id yet).
    if (phoneForHistory && !interaction.providerConversationId) {
      historySummary = await buildHistorySummary({
        subscriberId: chatChannel.subscriberId,
        phoneNumber: phoneForHistory,
        channels: ["VOICE", "SMS", "CHAT"],
        maxInteractions: 3,
        lookbackMonths: 6,
      });
    }

    // Pass dynamic context on new chat creation only.
    const dynamicVariables =
      !interaction.providerConversationId
        ? {
            interaction_id: interaction.id,
            ...(phoneForHistory ? { contact_phone_e164: phoneForHistory } : {}),
            ...(historySummary ? { history_summary: historySummary } : {}),
            ...(transferPreselect ? { transfer_preselect: transferPreselect } : {}),
          }
        : undefined;

    await prisma.interactionMessage.create({
      data: {
        interactionId: interaction.id,
        role: "USER",
        content: message,
      },
    });

    // 1) Get completion from Retell
    const { chatId: newChatId, fullReply } = await getRetellChatCompletion(
      message,
      interaction.providerConversationId || undefined,
      chatChannel.providerInboxId,
      historySummary || undefined,
      dynamicVariables
    );
    // Temporary: log raw reply for debugging Retell responses.
    console.log("[chat] retell reply", { chatId: newChatId, fullReply });

    if (interaction.providerConversationId !== newChatId) {
      await prisma.interaction.update({
        where: { id: interaction.id },
        data: {
          providerConversationId: newChatId,
          ...(historySummary ? { summary: historySummary } : {}),
        },
      });
    }

    // 2) Look for CALL_REQUEST marker in the reply
    let phoneForCall: string | null = null;

    const lines = fullReply.split(/\r?\n/);
    const cleanedLines: string[] = [];

    for (const line of lines) {
      const match = line.match(/^CALL_REQUEST:\s*(.+)$/i);
      if (match) {
        phoneForCall = match[1].trim();
      } else {
        cleanedLines.push(line);
      }
    }

    const reply = cleanedLines.join("\n").trim();

    // 3) If there was a CALL_REQUEST, trigger the outbound call in the background
    if (phoneForCall) {
      console.log("CALL_REQUEST detected from chat. Number:", phoneForCall);
      triggerOutboundCallFromChat({
        phone: phoneForCall,
        subscriberId: chatChannel.subscriberId,
        subscriberSlug,
      }).catch((err) => {
        console.error(
          "Failed to trigger Retell call from chat:",
          err?.response?.data || err.message
        );
      });
    }

    await prisma.interactionMessage.create({
      data: {
        interactionId: interaction.id,
        role: "AGENT",
        content: reply,
      },
    });

    return res.json({
      chatId: newChatId,
      reply,
      interactionId: interaction.id,
    });
  } catch (err: any) {
    console.error(
      "Error in /chat:",
      err?.response?.status,
      err?.response?.statusText,
      err?.response?.data || err.message
    );
    // Temporary: log full Retell error payload for debugging end-of-chat behavior.
    if (err?.response) {
      console.error("[chat] retell error payload", {
        status: err.response.status,
        statusText: err.response.statusText,
        data: err.response.data,
      });
    }
    return res.status(500).json({ error: "Failed to get chat response" });
  }
});

export default router;
