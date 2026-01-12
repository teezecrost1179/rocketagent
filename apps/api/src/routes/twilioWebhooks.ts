import { prisma } from "../lib/prisma"; // <-- adjust path if needed
import { Router } from "express";

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
        const MAX_SMS_PER_HOUR = 5;
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

        const recentInboundCount = await prisma.interactionMessage.count({
            where: {
                role: "USER",
                createdAt: { gte: oneHourAgo },
                interaction: {
                    subscriberId: smsChannel.subscriberId,
                    channel: "SMS",
                    fromNumberE164: From,
                    toNumberE164: To,
                },
            },
        });

        if (recentInboundCount >= MAX_SMS_PER_HOUR) {
            console.warn("[Twilio SMS inbound] Rate limit hit — ignoring message", {
                subscriberId: smsChannel.subscriberId,
                From,
                To,
                recentInboundCount,
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

        let interaction = await prisma.interaction.findFirst({
            where: {
                subscriberId: smsChannel.subscriberId,
                channel: "SMS",
                fromNumberE164: From,
                toNumberE164: To,
                startedAt: { gte: threadWindowStart },
            },
            orderBy: { startedAt: "desc" },
            select: { id: true, subscriberId: true },
        });

        if (!interaction) {
            interaction = await prisma.interaction.create({
                data: {
                    subscriberId: smsChannel.subscriberId,
                    channel: "SMS",
                    direction: "INBOUND",
                    status: "STARTED",
                    provider: "TWILIO",

                    // For SMS, we treat Interaction as the thread.
                    // Keep providerConversationId as the first MessageSid that opened the thread.
                    providerConversationId: MessageSid,

                    fromNumberE164: From,
                    toNumberE164: To,
                },
                select: { id: true, subscriberId: true },
            });
            console.log("[Twilio SMS inbound] Created SMS thread Interaction", {
                interactionId: interaction.id,
                subscriberId: interaction.subscriberId,
            });
        } else {
            console.log("[Twilio SMS inbound] Reused SMS thread Interaction", {
                interactionId: interaction.id,
                subscriberId: interaction.subscriberId,
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

        console.log("[Twilio SMS inbound] Created InteractionMessage", {
            interactionId: interaction.id,
            providerMessageId: MessageSid,
        });

        return res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
        <Response></Response>`);

  
    }


    // Return empty TwiML so Twilio considers it handled but sends no reply
    res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
    <Response></Response>`);
  }
);

export default router;
