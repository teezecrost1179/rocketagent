import { prisma } from "../lib/prisma"; // <-- adjust path if needed
import { Router } from "express";
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
  const twilioClient = Twilio(
    process.env.TWILIO_ACCOUNT_SID!,
    process.env.TWILIO_AUTH_TOKEN!
  );

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

        // Pull public contact info for warning messages (website + phone)
        const subscriber = await prisma.subscriber.findUnique({
            where: { id: smsChannel.subscriberId },
            select: { websiteUrl: true, publicPhoneE164: true },
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

        if (!interaction) {
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
        const retellApiKey = process.env.RETELL_API_KEY;
        const retellChatAgentId = smsChannel.providerInboxId; // <-- store chat agent id here

        if (!retellApiKey) {
        console.error("[SMS A1] Missing RETELL_API_KEY");
        } else if (!retellChatAgentId) {
        console.error("[SMS A1] Missing Retell chat agent id (smsChannel.providerInboxId)");
        } else {
            // Reuse chat_id if we already created one for this Interaction thread
            let chatId = interaction.providerConversationId;

            // If providerConversationId is empty OR still looks like a Twilio MessageSid ("SM...")
            if (!chatId || chatId.startsWith("SM")) {
                const createChatResp = await fetch("https://api.retellai.com/create-chat", {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${retellApiKey}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        agent_id: retellChatAgentId,
                        metadata: {
                        subscriberId: smsChannel.subscriberId,
                        from: From,
                        to: To,
                        },
                    }),
                });

                if (!createChatResp.ok) {
                    const text = await createChatResp.text();
                    console.error("[SMS A1] Retell create-chat failed", createChatResp.status, text);
                } else {
                    const created = await createChatResp.json();
                    chatId = created.chat_id;

                    // Save chat_id so future SMS in this thread keeps context
                    await prisma.interaction.update({
                        where: { id: interaction.id },
                        data: { providerConversationId: chatId },
                    });

                    console.log("[SMS A1] Created Retell chat", { chatId });
                }
            }

            if (chatId) {

                // --- DEV TEST HOOK: if user texts "endchat", end the Retell chat session ---
                // This is purely for testing your recovery logic. We wait until chatId exists.
                const normalizedBody = (Body || "").trim().toLowerCase();

                if (normalizedBody === "endchat") {
                // 1) Tell the texter we ended it (so the test is obvious)
                const twilioClient = Twilio(
                    process.env.TWILIO_ACCOUNT_SID!,
                    process.env.TWILIO_AUTH_TOKEN!
                );

                const endedReply = "Ended.";

                const outboundMessage = await twilioClient.messages.create({
                    from: To,
                    to: From,
                    body: endedReply,
                });

                // Persist the outbound message
                await prisma.interactionMessage.create({
                    data: {
                    interactionId: interaction.id,
                    role: "AGENT",
                    content: endedReply,
                    providerMessageId: outboundMessage.sid,
                    },
                });

                // 2) End the Retell chat session (so the next message triggers your recovery path)
                const endResp = await fetch(`https://api.retellai.com/end-chat/${chatId}`, {
                    method: "PATCH",
                    headers: {
                    Authorization: `Bearer ${retellApiKey}`,
                    "Content-Type": "application/json",
                    },
                });

                if (!endResp.ok) {
                    console.error("[SMS A1] Retell end-chat failed", endResp.status, await endResp.text());
                } else {
                    console.log("[SMS A1] Retell chat ended via 'endchat' command", { chatId });
                }

                // 3) Stop processing: don't call create-chat-completion for this inbound message
                return res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
                <Response></Response>`);
                }
                // END IF *ENDCHAT***


                // --- Call Retell for the next reply in this chat ---
                const completionResp = await fetch("https://api.retellai.com/create-chat-completion", {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${retellApiKey}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        chat_id: chatId,
                        content: Body || "",
                    }),
                });

                if (!completionResp.ok) {
                    // If Retell returns an error, we read the body as text so we can inspect it.
                    const text = await completionResp.text();

                    // Special case: Retell is telling us the chat session is closed and cannot continue.
                    // In this case, we do NOT create a new Interaction thread in our DB.
                    // We simply create a new Retell chat_id, store it on the same Interaction,
                    // then retry the completion ONE time.
                    const isChatEnded =
                        completionResp.status === 400 && text.toLowerCase().includes("chat already ended");
                    if (!isChatEnded) {
                        console.error("[SMS A1] Retell create-chat-completion failed", completionResp.status, text);
                    } else {
                        console.warn("[SMS A1] Retell chat ended. Creating a new chat and retrying once.", {
                        oldChatId: chatId,
                        interactionId: interaction.id,
                        });

                        // 1) Create a NEW Retell chat session
                        const createChatResp2 = await fetch("https://api.retellai.com/create-chat", {
                            method: "POST",
                            headers: {
                                Authorization: `Bearer ${retellApiKey}`,
                                "Content-Type": "application/json",
                            },
                            body: JSON.stringify({
                                agent_id: retellChatAgentId,
                                metadata: {
                                subscriberId: smsChannel.subscriberId,
                                from: From,
                                to: To,
                                // (Optional) helps you debug which Interaction this new chat was created for
                                interactionId: interaction.id,
                                reason: "recovered_from_chat_ended",
                                },
                            }),
                        });

                        if (!createChatResp2.ok) {
                            const t2 = await createChatResp2.text();
                            console.error("[SMS A1] Retell create-chat failed during recovery", createChatResp2.status, t2);
                        } else {
                            const created2 = await createChatResp2.json();
                            const newChatId = created2.chat_id as string;

                            // 2) Update the SAME Interaction to point at the new Retell chat_id.
                            // This preserves your 24-hour SMS thread and your DB conversation history.
                            await prisma.interaction.update({
                                where: { id: interaction.id },
                                data: { providerConversationId: newChatId },
                            });

                            console.log("[SMS A1] RECOVERY created new Retell chat due to ended chat", {
                                oldChatId: chatId,
                                newChatId,
                                interactionId: interaction.id,
                            });

                            
                            // first build recovery prompt for a completion re-try
                            const history = await buildRecoveryContext({
                                interactionId: interaction.id,
                            });
                            const recoveryPrompt =
                                `Context (most recent messages):\n${history}\n\n` +
                                `Instruction: Do not repeat the context. Reply naturally and briefly to the latest user message.\n\n` +
                                `Latest user message: ${(Body || "").trim()}`;

                            // 3) Retry the completion one time using the new chat_id
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
                                const t3 = await retryResp.text();
                                console.error("[SMS A1] Retell retry create-chat-completion failed", retryResp.status, t3);
                            } else {
                                // ✅ From here on, treat retry completion exactly like the normal success path:
                                const completion = await retryResp.json();
                                const lastAgentMsg = [...(completion.messages || [])]
                                .reverse()
                                .find((m: any) => m.role === "agent")?.content;

                                console.log("[SMS A1] Retell reply after recovery (not sent yet)", {
                                chatId: newChatId,
                                reply: lastAgentMsg,
                                recoverPrompt: recoveryPrompt,
                                });

                                // IMPORTANT: set chatId to the new one so any downstream logs/use are consistent
                                chatId = newChatId;

                                const bodyToSend = applySmsPolicy({
                                    agentReply: lastAgentMsg,
                                    remainingOut,
                                    rid,
                                    outboundCount,
                                });
                                //**Send Twilio and Persist ****
                                await sendSmsAndPersist({
                                    toUserNumber: From,
                                    fromTwilioNumber: To,
                                    body: bodyToSend,
                                    interactionId: interaction.id,
                                    rid,
                                });

                            }
                        }
                    }
                } else {
                    // ✅ Normal success path: Retell returned a completion for the current chat_id
                    const completion = await completionResp.json();

                    const lastAgentMsg = [...(completion.messages || [])]
                        .reverse()
                        .find((m: any) => m.role === "agent")?.content;

                    console.log("[SMS A1] Retell reply (not sent to texter yet)", { chatId, reply: lastAgentMsg });

                    const bodyToSend = applySmsPolicy({
                        agentReply: lastAgentMsg,
                        remainingOut,
                        rid,
                        outboundCount,
                    });
                    //**Send Twilio and Persist ****
                    await sendSmsAndPersist({
                        toUserNumber: From,
                        fromTwilioNumber: To,
                        body: bodyToSend,
                        interactionId: interaction.id,
                        rid,
                    });
    


                }

            }
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
