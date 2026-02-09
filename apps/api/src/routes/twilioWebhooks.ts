import { Router } from "express";
import { RETELL_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } from "../config/env";
import { prisma } from "../lib/prisma"; // <-- adjust path if needed
import { buildHistorySummary } from "../services/historySummaryService";
import { updateRetellChatDynamicVariables } from "../services/retellService";
import Twilio from "twilio";


const router = Router();

// Build a compact SMS-friendly conversation context from ***DB history***.
// Only used when we have to recover from an ended Retell chat.
async function buildRecoveryContext({
  interactionId,
  maxMessages = 10,
  maxChars = 1400,
}: {
  interactionId: string;
  maxMessages?: number;
  maxChars?: number;
}) {
  const msgs = await prisma.interactionMessage.findMany({
    where: { interactionId },
    orderBy: { createdAt: "asc" },
    select: { role: true, content: true },
  });

  // Use only the last N messages to keep context tight
  const tail = msgs.slice(-maxMessages);

  const lines = tail.map((m) => {
    const who = m.role === "USER" ? "User" : "Agent";
    const text = (m.content || "").replace(/\s+/g, " ").trim();
    return `${who}: ${text}`;
  });

  let context = lines.join("\n");

  // Hard cap to avoid huge prompts
  if (context.length > maxChars) {
    context = context.slice(context.length - maxChars);
  }

  return context;
}
//END DB context history function buildRecoveryContext

//BUILD THE SEND SMS AND PERSIST chunk as a function
async function sendSmsAndPersist({
  toUserNumber,
  fromTwilioNumber,
  body,
  interactionId,
  rid,
}: {
  toUserNumber: string;
  fromTwilioNumber: string;
  body: string;
  interactionId: string;
  rid: string;
}) {
  const twilioClient = Twilio(TWILIO_ACCOUNT_SID!, TWILIO_AUTH_TOKEN!);

  const outboundMessage = await twilioClient.messages.create({
    from: fromTwilioNumber,
    to: toUserNumber,
    body,
  });

  console.log(`[${rid}] Sent SMS reply`, { messageSid: outboundMessage.sid });

  await prisma.interactionMessage.create({
    data: {
      interactionId,
      role: "AGENT",
      content: body,
      providerMessageId: outboundMessage.sid,
    },
  });

  return outboundMessage.sid;
}
//END  SEND SMS AND PERSIST  function, sendSmsAndPersist

//reBuild outbody body with SMS LIMIT POLICY
function applySmsPolicy({
  agentReply,
  remainingOut,
  rid,
  outboundCount,
}: {
  agentReply: string | null | undefined;
  remainingOut: number;
  rid: string;
  outboundCount: number;
}) {
  let body = agentReply || "Okay — how can I help?";

  if (remainingOut <= 3) {
    const remainingAfterThis = Math.max(remainingOut - 1, 0);
    body += `\nFYI, I can only respond ${remainingAfterThis} more times this session.`;
    console.log(`[${rid}] [SMS limit] outboundCount=${outboundCount} remainingOut=${remainingOut}`);
  }

  return body;
}
//end applySmsPolicy function


// *** big function to get the retell reply with recovery *** ***********
// *** big function to get the retell reply with recovery *** ***********
async function getRetellReplyWithRecovery({
  interactionId,
  existingChatId,
  retellApiKey,
  retellChatAgentId,
  inboundText,
  subscriberId,
  from,
  to,
  historySummary,
}: {
  interactionId: string;
  existingChatId: string | null;
  retellApiKey: string;
  retellChatAgentId: string;
  inboundText: string;
  subscriberId: string;
  from: string;
  to: string;
  historySummary?: string | null;
}): Promise<{ chatId: string; lastAgentMsg: string | null; usedRecovery: boolean }> {
  // 0) Start with whatever we already have stored on the Interaction
  let chatId = existingChatId;
  const subscriberSlug =
    (await prisma.subscriber.findUnique({
      where: { id: subscriberId },
      select: { slug: true },
    }))?.slug || null;

  const baseDynamicVars: Record<string, string> = {
    interaction_id: interactionId,
    phone_number: from,
  };
  if (subscriberSlug) {
    baseDynamicVars.subscriber_slug = subscriberSlug;
  }
  if (historySummary) {
    baseDynamicVars.history_summary = historySummary;
  }


  // 1) If we don't have a valid Retell chat_id, create a new one
  if (!chatId ) {
    const createChatResp = await fetch("https://api.retellai.com/create-chat", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${retellApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        agent_id: retellChatAgentId,
        metadata: { subscriberId, from, to, interactionId },
        retell_llm_dynamic_variables: baseDynamicVars,
      }),
    });

    if (!createChatResp.ok) {
      const text = await createChatResp.text();
      throw new Error(`Retell create-chat failed (${createChatResp.status}): ${text}`);
    }

    const created = await createChatResp.json();
    chatId = created.chat_id as string;

    // Persist the new chat_id onto the SAME Interaction so future SMS messages keep context
    await prisma.interaction.update({
      where: { id: interactionId },
      data: { providerConversationId: chatId },
    });
  }
  else {
    // Ensure dynamic variables are available for function calls on existing chats.
    await updateRetellChatDynamicVariables({
      chatId,
      dynamicVariables: baseDynamicVars,
    });
  }

  // 2) Attempt a normal completion
  const completionResp = await fetch("https://api.retellai.com/create-chat-completion", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${retellApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId!,
      content: inboundText,
    }),
  });

  if (completionResp.ok) {
    const completion = await completionResp.json();
    const lastAgentMsg =
      [...(completion.messages || [])].reverse().find((m: any) => m.role === "agent")?.content ?? null;

    return { chatId, lastAgentMsg, usedRecovery: false };
  }

  // 3) If completion failed, check if it's the "chat already ended" case
  const errorText = await completionResp.text();
  const isChatEnded =
    completionResp.status === 400 && errorText.toLowerCase().includes("chat already ended");

  if (!isChatEnded) {
    throw new Error(`Retell create-chat-completion failed (${completionResp.status}): ${errorText}`);
  }

  // 4) Recovery path: create a new chat, store it, then retry completion with DB history context
  const createChatResp2 = await fetch("https://api.retellai.com/create-chat", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${retellApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      agent_id: retellChatAgentId,
      metadata: { subscriberId, from, to, interactionId, reason: "recovered_from_chat_ended" },
      retell_llm_dynamic_variables: baseDynamicVars,
    }),
  });

  if (!createChatResp2.ok) {
    const text2 = await createChatResp2.text();
    throw new Error(`Retell create-chat (recovery) failed (${createChatResp2.status}): ${text2}`);
  }

  const created2 = await createChatResp2.json();
  const newChatId = created2.chat_id as string;

  // Update the SAME Interaction to point at the new chat_id
  await prisma.interaction.update({
    where: { id: interactionId },
    data: { providerConversationId: newChatId },
  });

  // Build a short history context from DB so the new chat_id isn't "fresh"
  const history = await buildRecoveryContext({ interactionId });

  const recoveryPrompt =
    `Context (most recent messages):\n${history}\n\n` +
    `Instruction: Do not repeat the context. Reply naturally and briefly to the latest user message.\n\n` +
    `Latest user message: ${inboundText.trim()}`;

  const retryResp = await fetch("https://api.retellai.com/create-chat-completion", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${retellApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: newChatId,
      content: recoveryPrompt,
    }),
  });

  if (!retryResp.ok) {
    const text3 = await retryResp.text();
    throw new Error(`Retell retry create-chat-completion failed (${retryResp.status}): ${text3}`);
  }

  const completion2 = await retryResp.json();
  const lastAgentMsg2 =
    [...(completion2.messages || [])].reverse().find((m: any) => m.role === "agent")?.content ?? null;

  return { chatId: newChatId, lastAgentMsg: lastAgentMsg2, usedRecovery: true };
}
// *** END big function to get the retell reply with recovery getRetellReplyWithRecovery*** ***********
// *** END big function to get the retell reply with recovery getRetellReplyWithRecovery*** ***********


/**
 * Twilio sends inbound SMS as application/x-www-form-urlencoded by default.
 * This route just ACKs receipt (no auto-reply), and logs payload for now.
 */
router.post(
  "/sms",
  // Parse Twilio form-encoded body
  require("express").urlencoded({ extended: false }),
  async (req, res) => {
    const {
      MessageSid,
      From,
      To,
      Body,
      NumMedia,
      SmsStatus,
      AccountSid,
    } = req.body || {};

    //log payload
    console.log("[Twilio SMS inbound]", {
      MessageSid,
      From,
      To,
      Body,
      NumMedia,
      SmsStatus,
      AccountSid,
    });

    // --- STEP 1: idempotency check ---
    if (MessageSid) {
        const existing = await prisma.interactionMessage.findFirst({
        where: { providerMessageId: MessageSid },
        select: { id: true },
        });

        if (existing) {
        console.log("[Twilio SMS inbound] Duplicate ignored", { MessageSid });
        return res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
    <Response></Response>`);
        }
    }
    // Request / log correlation id
    const rid = MessageSid || "no-message-sid";


    // --- STEP 2: resolve subscriber channel from "To" number (safe) ---
    const matches = await prisma.subscriberChannel.findMany({
    where: {
        channel: "SMS",
        enabled: true,
        providerNumberE164: To,
    },
    select: {
        id: true,
        subscriberId: true,
        providerInboxId: true,
    },
    });

    if (matches.length === 0) {
        console.warn("[Twilio SMS inbound] No enabled SMS channel for number", { To });
        return res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
        <Response></Response>`);

    } else if (matches.length > 1) {
        console.error("[Twilio SMS inbound] Multiple enabled SMS channels claim this number", {
            To,
            matches,
         });
    // For safety: do not route unpredictably
        return res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
        <Response></Response>`);
    } else {
        //  *** Matched SMS channel - single match ***          ***single sms channel match ***
        const smsChannel = matches[0];
        console.log("[Twilio SMS inbound] Matched SMS channel", {
            channelId: smsChannel.id,
            subscriberId: smsChannel.subscriberId,
        });


        // --- B-LITE: rate limit inbound SMS per sender per hour ---
        const MAX_SMS_PER_HOUR = 8;
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

        const outboundCount = await prisma.interactionMessage.count({
            where: {
                role: "AGENT",
                createdAt: { gte: oneHourAgo },
                interaction: {
                subscriberId: smsChannel.subscriberId,
                channel: "SMS",
                fromNumberE164: From,
                toNumberE164: To,
                },
            },
        });
        const remainingOut = MAX_SMS_PER_HOUR - outboundCount;

        if (remainingOut < 1) {
            console.warn("[Twilio SMS inbound] Rate limit hit — ignoring message", {
                subscriberId: smsChannel.subscriberId,
                From,
                To,
                remainingOut,
                MAX_SMS_PER_HOUR,
            });

            return res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
            <Response></Response>`);
        }        
     
        // --- STEP 3: create (or reuse) an Interaction for this inbound SMS ---
        // --- STEP 3B: D-lite threading ---
        // Reuse the most recent SMS interaction for this From/To within a window.
        const THREAD_WINDOW_HOURS = 24;
        const threadWindowStart = new Date(Date.now() - THREAD_WINDOW_HOURS * 60 * 60 * 1000);

        type SmsThread = {
            id: string;
            subscriberId: string;
            providerConversationId: string | null;
        };

        let interaction: SmsThread | null = await prisma.interaction.findFirst({
        where: {
            subscriberId: smsChannel.subscriberId,
            channel: "SMS",
            fromNumberE164: From,
            toNumberE164: To,
            startedAt: { gte: threadWindowStart },
        },
        orderBy: { startedAt: "desc" },
        select: {
            id: true,
            subscriberId: true,
            providerConversationId: true,
        },
        });

        let historySummary: string | null = null;
        if (!interaction) {
            historySummary = await buildHistorySummary({
                subscriberId: smsChannel.subscriberId,
                phoneNumber: From,
                channel: "SMS",
                maxInteractions: 3,
                lookbackMonths: 6,
            });

            interaction = await prisma.interaction.create({
                data: {
                subscriberId: smsChannel.subscriberId,
                channel: "SMS",
                direction: "INBOUND",
                status: "STARTED",
                provider: "TWILIO",
                fromNumberE164: From,
                toNumberE164: To,
                providerConversationId: null, // <-- IMPORTANT
                summary: historySummary || null,
                },
                select: {
                id: true,
                subscriberId: true,
                providerConversationId: true,
                },
            });

            console.log("[Twilio SMS inbound] CREATED SMS thread Interaction", {
                interactionId: interaction.id,
                subscriberId: interaction.subscriberId,
                sentInLastHour: outboundCount,
                remainingForTheHour: remainingOut,
            });
        } else {
            console.log("[Twilio SMS inbound] REUSED SMS thread Interaction", {
                interactionId: interaction.id,
                subscriberId: interaction.subscriberId,
                sentInLastHour: outboundCount,
                remainingForTheHour: remainingOut
            });
        }



        // --- STEP 4: persist the inbound SMS message ---
        await prisma.interactionMessage.create({
            data: {
                interactionId: interaction.id,
                role: "USER",                // SMS sender is the user
                content: Body || "",         // Body should exist, but be defensive
                providerMessageId: MessageSid,
            },
        });

        console.log(`Created InteractionMessage in db — interactionId=${interaction.id}, providerMessageId=${MessageSid}`);



        // --- A1: get AI reply from Retell (do NOT send SMS yet) ---
        const retellApiKey = RETELL_API_KEY;
        const retellChatAgentId = smsChannel.providerInboxId; // <-- store chat agent id here

        if (!retellApiKey) {
        console.error("[SMS A1] Missing RETELL_API_KEY");
        } else if (!retellChatAgentId) {
        console.error("[SMS A1] Missing Retell chat agent id (smsChannel.providerInboxId)");
        } else {


            const normalizedBody = (Body || "").trim().toLowerCase();

            // DEV: only run endchat if we already have a chat id to end
            // DEV: only run endchat if we already have a chat id to end
            if (normalizedBody === "endchat" && interaction.providerConversationId) {
                const chatIdToEnd = interaction.providerConversationId;

                // 1) Send "Ended." back to the texter + persist it
                const endedReply = "Ended.";

                await sendSmsAndPersist({
                    toUserNumber: From,
                    fromTwilioNumber: To,
                    body: endedReply,
                    interactionId: interaction.id,
                    rid,
                });

                // 2) End the Retell chat session
                const endResp = await fetch(`https://api.retellai.com/end-chat/${chatIdToEnd}`, {
                    method: "PATCH",
                    headers: {
                    Authorization: `Bearer ${retellApiKey}`,
                    "Content-Type": "application/json",
                    },
                });

                if (!endResp.ok) {
                    console.error("[SMS A1] Retell end-chat failed", endResp.status, await endResp.text());
                } else {
                    console.log("[SMS A1] Retell chat ended via 'endchat'", { chatId: chatIdToEnd });
                }

                // 3) Stop processing (do not call completion)
                return res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
                <Response></Response>`);
            }


            // Otherwise: always get Retell reply (helper will create chat if needed)
            const { chatId: finalChatId, lastAgentMsg, usedRecovery } =
            await getRetellReplyWithRecovery({
                interactionId: interaction.id,
                existingChatId: interaction.providerConversationId, // can be null — that's fine
                retellApiKey,
                retellChatAgentId,
                inboundText: Body || "",
                subscriberId: smsChannel.subscriberId,
                from: From,
                to: To,
                historySummary,
            });

            if (usedRecovery) {
                console.log("[SMS A1] Retell recovery path used", {
                    interactionId: interaction.id,
                    finalChatId,
                });
            }

            // --- A2: apply SMS policy + send + persist ---
            const bodyToSend = applySmsPolicy({
            agentReply: lastAgentMsg,
            remainingOut,
            rid,
            outboundCount,
            });

            await sendSmsAndPersist({
            toUserNumber: From,
            fromTwilioNumber: To,
            body: bodyToSend,
            interactionId: interaction.id,
            rid,
            });

        }

        return res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
        <Response></Response>`);

  
    }


    // Return empty TwiML so Twilio considers it handled but sends no reply
    res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
    <Response></Response>`);
  }
);

export default router;
