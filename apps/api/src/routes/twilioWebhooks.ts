import { prisma } from "../lib/prisma"; // <-- adjust path if needed
import { Router } from "express";
import Twilio from "twilio";


const router = Router();

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
        const MAX_SMS_PER_HOUR = 6;
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

                            // 3) Retry the completion one time using the new chat_id
                            const retryResp = await fetch("https://api.retellai.com/create-chat-completion", {
                                method: "POST",
                                headers: {
                                Authorization: `Bearer ${retellApiKey}`,
                                "Content-Type": "application/json",
                                },
                                body: JSON.stringify({
                                chat_id: newChatId,
                                content: Body || "",
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
                                });

                                // IMPORTANT: set chatId to the new one so any downstream logs/use are consistent
                                chatId = newChatId;

                                // --- A2: send AI reply back to the user via Twilio SMS ---

                                // Create a Twilio REST client using credentials from env vars.
                                const twilioClient = Twilio(
                                process.env.TWILIO_ACCOUNT_SID!,
                                process.env.TWILIO_AUTH_TOKEN!
                                );

                                // If they’re nearing the cap, append a brief FYI
                                let lastAgentMsgWithPolicy = lastAgentMsg || "Okay — how can I help?";
                                const directToWebsite = subscriber?.websiteUrl;
                                const directToPhone = subscriber?.publicPhoneE164;

                                if (remainingOut <= 3) {
                                const remainingAfterThis = Math.max(remainingOut - 1, 0);

                                const parts: string[] = [
                                    `FYI: SMS limits apply — I can reply ${remainingAfterThis} more time${remainingAfterThis === 1 ? "" : "s"} this hour.`,
                                ];

                                if (directToWebsite) parts.push(`Continue on chat: ${directToWebsite}`);
                                if (directToPhone) parts.push(`Call: ${directToPhone}`);

                                lastAgentMsgWithPolicy += `\n\n${parts.join("\n")}`;

                                console.log(`[${rid}] [SMS limit] outboundCount=${outboundCount} remainingOut=${remainingOut}`);
                                }

                                // Send the AI-generated reply as an outbound SMS.
                                // IMPORTANT:
                                // - "from" must be YOUR Twilio number (the number that received the SMS)
                                // - "to" must be the original sender (the user)
                                const outboundMessage = await twilioClient.messages.create({
                                from: To,     // Twilio number
                                to: From,     // End user who texted in
                                body: lastAgentMsgWithPolicy,
                                });

                                // Log success so we can see outbound behavior clearly
                                console.log(
                                `Sent SMS reply (remaining in limits b4 this send: ${remainingOut})`,
                                { messageSid: outboundMessage.sid }
                                );

                                // Persist the outbound assistant message so the full conversation
                                // (USER + ASSISTANT) exists in the database.
                                await prisma.interactionMessage.create({
                                data: {
                                    interactionId: interaction.id,
                                    role: "AGENT",              // This message is from the system/AI
                                    content: lastAgentMsgWithPolicy, // What we sent to the user
                                    providerMessageId: outboundMessage.sid, // Twilio SID for idempotency/debugging
                                },
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

                    // --- A2: send AI reply back to the user via Twilio SMS ---

                    // Create a Twilio REST client using credentials from env vars.
                    const twilioClient = Twilio(
                    process.env.TWILIO_ACCOUNT_SID!,
                    process.env.TWILIO_AUTH_TOKEN!
                    );

                    // If they’re nearing the cap, append a brief FYI
                    let lastAgentMsgWithPolicy = lastAgentMsg || "Okay — how can I help?";
                    const directToWebsite = subscriber?.websiteUrl;
                    const directToPhone = subscriber?.publicPhoneE164;

                    if (remainingOut <= 3) {
                    const remainingAfterThis = Math.max(remainingOut - 1, 0);

                    const parts: string[] = [
                        `FYI: SMS limits apply — I can reply ${remainingAfterThis} more time${remainingAfterThis === 1 ? "" : "s"} this hour.`,
                    ];

                    if (directToWebsite) parts.push(`Continue on chat: ${directToWebsite}`);
                    if (directToPhone) parts.push(`Call: ${directToPhone}`);

                    lastAgentMsgWithPolicy += `\n\n${parts.join("\n")}`;

                    console.log(`[${rid}] [SMS limit] outboundCount=${outboundCount} remainingOut=${remainingOut}`);
                    }

                    // Send the AI-generated reply as an outbound SMS.
                    // IMPORTANT:
                    // - "from" must be YOUR Twilio number (the number that received the SMS)
                    // - "to" must be the original sender (the user)
                    const outboundMessage = await twilioClient.messages.create({
                    from: To,     // Twilio number
                    to: From,     // End user who texted in
                    body: lastAgentMsgWithPolicy,
                    });

                    // Log success so we can see outbound behavior clearly
                    console.log(
                    `Sent SMS reply (remaining in limits b4 this send: ${remainingOut})`,
                    { messageSid: outboundMessage.sid }
                    );

                    // Persist the outbound assistant message so the full conversation
                    // (USER + ASSISTANT) exists in the database.
                    await prisma.interactionMessage.create({
                    data: {
                        interactionId: interaction.id,
                        role: "AGENT",              // This message is from the system/AI
                        content: lastAgentMsgWithPolicy, // What we sent to the user
                        providerMessageId: outboundMessage.sid, // Twilio SID for idempotency/debugging
                    },
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
