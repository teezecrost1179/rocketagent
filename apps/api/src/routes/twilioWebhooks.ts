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

    // --- STEP 2: resolve subscriber channel from "To" number ---
    const smsChannel = await prisma.subscriberChannel.findFirst({
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

        if (!smsChannel) {
        console.warn("[Twilio SMS inbound] No enabled SMS channel for number", {
            To,
        });
        } else {
        console.log("[Twilio SMS inbound] Matched SMS channel", {
            channelId: smsChannel.id,
            subscriberId: smsChannel.subscriberId,
        });
    }


    console.log("[Twilio SMS inbound]", {
      MessageSid,
      From,
      To,
      Body,
      NumMedia,
      SmsStatus,
      AccountSid,
    });

    // Return empty TwiML so Twilio considers it handled but sends no reply
    res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response></Response>`);
  }
);

export default router;
