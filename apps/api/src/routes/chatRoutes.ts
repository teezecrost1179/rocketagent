import { Router } from "express";
import {
  getRetellChatCompletion,
  createRetellOutboundCall,
} from "../services/retellService";
import { prisma } from "../lib/prisma";
import { normalizePhone } from "../utils/phone";

const router = Router();

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
    const { message, chatId, subscriber } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Missing or invalid 'message' field" });
    }

    const subscriberSlug = (subscriber || "").toLowerCase().trim();
    if (!subscriberSlug) {
      return res.status(404).json({ error: "Chat channel unavailable" });
    }

    const chatChannel = await prisma.subscriberChannel.findFirst({
      where: {
        channel: "CHAT",
        enabled: true,
        subscriber: { slug: subscriberSlug },
      },
      select: {
        subscriberId: true,
        aiProvider: true,
        providerInboxId: true,
      },
    });

    if (!chatChannel) {
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
          },
        })
      : null;

    const interaction = existingInteraction
      ? existingInteraction
      : await prisma.interaction.create({
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
          },
        });

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
      chatChannel.providerInboxId
    );

    if (interaction.providerConversationId !== newChatId) {
      await prisma.interaction.update({
        where: { id: interaction.id },
        data: { providerConversationId: newChatId },
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
    });
  } catch (err: any) {
    console.error(
      "Error in /chat:",
      err?.response?.status,
      err?.response?.statusText,
      err?.response?.data || err.message
    );
    return res.status(500).json({ error: "Failed to get chat response" });
  }
});

export default router;
