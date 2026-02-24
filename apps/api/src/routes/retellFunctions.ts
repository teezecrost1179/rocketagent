import { Router } from "express";
import { POSTMARK_API_KEY, RETELL_FUNCTION_SECRET } from "../config/env";
import { prisma } from "../lib/prisma";
import {
  buildHistorySignals,
  buildHistoryDetailSummary,
} from "../services/historySummaryService";
import { normalizePhone } from "../utils/phone";

const router = Router();

function requireFunctionSecret(req: { headers: Record<string, string | string[] | undefined> }) {
  const expected = RETELL_FUNCTION_SECRET;
  if (!expected) return true;
  const provided = req.headers["x-retell-secret"];
  if (Array.isArray(provided)) return provided.includes(expected);
  return provided === expected;
}

function sanitizeHeaderName(value: string) {
  return value.replace(/[\r\n<>"]/g, "").trim();
}

// Retell custom function: capture a phone number and return history summary.
router.post("/retell/functions/capture-phone", async (req, res) => {
  try {
    if (!requireFunctionSecret(req)) {
      return res.status(401).json({ error: "unauthorized" });
    }

    const { phone_number, interaction_id } = req.body || {};
    if (!phone_number || typeof phone_number !== "string") {
      return res.status(200).json({ history_summary: "" });
    }

    const normalized = normalizePhone(phone_number);
    if (!normalized.startsWith("+") || !/^\+\d{11,15}$/.test(normalized)) {
      return res.status(200).json({ history_summary: "" });
    }

    if (!interaction_id || typeof interaction_id !== "string") {
      return res.status(200).json({ history_summary: "" });
    }

    const interaction = await prisma.interaction.findUnique({
      where: { id: interaction_id },
      select: { id: true, subscriberId: true, contactPhoneE164: true },
    });

    if (!interaction) {
      return res.status(200).json({ history_summary: "" });
    }

    if (interaction.contactPhoneE164 !== normalized) {
      await prisma.interaction.update({
        where: { id: interaction.id },
        data: { contactPhoneE164: normalized },
      });
    }

    const historySummary =
      (await buildHistorySignals({
        subscriberId: interaction.subscriberId,
        phoneNumber: normalized,
        channels: ["VOICE", "SMS", "CHAT"],
        maxInteractions: 3,
        lookbackMonths: 6,
      })) || "";

    return res.status(200).json({
      history_summary: historySummary,
      contact_phone_e164: normalized,
    });
  } catch (err) {
    console.error("[Retell function capture-phone] error", err);
    return res.status(500).json({ error: "failed" });
  }
});

// Retell custom function: return detailed history summary on demand.
router.post("/retell/functions/history-detail", async (req, res) => {
  try {
    if (!requireFunctionSecret(req)) {
      return res.status(401).json({ error: "unauthorized" });
    }

    const { phone_number, interaction_id, subscriber_slug } = req.body || {};
    if (!phone_number || typeof phone_number !== "string") {
      return res.status(200).json({ history_detail_summary: "" });
    }

    const normalized = normalizePhone(phone_number);
    if (!normalized.startsWith("+") || !/^\+\d{11,15}$/.test(normalized)) {
      return res.status(200).json({ history_detail_summary: "" });
    }

    let subscriberId: string | null = null;

    if (interaction_id && typeof interaction_id === "string") {
      const interaction = await prisma.interaction.findUnique({
        where: { id: interaction_id },
        select: { id: true, subscriberId: true },
      });
      subscriberId = interaction?.subscriberId || null;
    }

    if (!subscriberId && subscriber_slug && typeof subscriber_slug === "string") {
      const subscriber = await prisma.subscriber.findUnique({
        where: { slug: subscriber_slug.toLowerCase().trim() },
        select: { id: true },
      });
      subscriberId = subscriber?.id || null;
    }

    if (!subscriberId) {
      return res.status(200).json({ history_detail_summary: "" });
    }

    const historyDetail =
      (await buildHistoryDetailSummary({
        subscriberId,
        phoneNumber: normalized,
        channels: ["VOICE", "SMS", "CHAT"],
      })) || "";

    return res.status(200).json({
      history_detail_summary: historyDetail,
      contact_phone_e164: normalized,
    });
  } catch (err) {
    console.error("[Retell function history-detail] error", err);
    return res.status(500).json({ error: "failed" });
  }
});

// Retell custom function: send an email to support with user request summary.
router.post("/retell/functions/send-email", async (req, res) => {
  try {
    if (!requireFunctionSecret(req)) {
      return res.status(401).json({ error: "unauthorized" });
    }

    if (!POSTMARK_API_KEY) {
      return res.status(500).json({ error: "missing_postmark_key" });
    }

    const {
      name,
      email,
      phone_number,
      summary,
      subject,
      subscriber_slug,
      interaction_id,
    } = req.body || {};

    const hasEmail = typeof email === "string" && email.trim().length > 0;
    const hasPhone =
      typeof phone_number === "string" && phone_number.trim().length > 0;

    if (!hasEmail && !hasPhone) {
      return res
        .status(200)
        .json({ email_sent: false, email_error: "missing_contact" });
    }

    const safeName =
      typeof name === "string" && name.trim().length > 0
        ? sanitizeHeaderName(name)
        : "Rocket Reception";

    let subscriberId: string | null = null;
    if (subscriber_slug && typeof subscriber_slug === "string") {
      const sub = await prisma.subscriber.findUnique({
        where: { slug: subscriber_slug.toLowerCase().trim() },
        select: { id: true },
      });
      subscriberId = sub?.id || null;
    }

    if (!subscriberId && interaction_id && typeof interaction_id === "string") {
      const interaction = await prisma.interaction.findUnique({
        where: { id: interaction_id },
        select: { subscriberId: true },
      });
      subscriberId = interaction?.subscriberId || null;
    }

    let toAddress = "support@rocketreception.ca";
    if (subscriberId) {
      const subForEmail = await prisma.subscriber.findUnique({
        where: { id: subscriberId },
        select: { primaryEmail: true },
      });
      if (subForEmail?.primaryEmail && subForEmail.primaryEmail.trim()) {
        toAddress = subForEmail.primaryEmail.trim();
      }
    }

    const from = `${safeName} <support@rocketreception.ca>`;
    const replyTo = hasEmail ? email.trim() : undefined;
    const safeSubject =
      typeof subject === "string" && subject.trim().length > 0
        ? subject.trim()
        : "Rocket Reception inquiry";

    const bodyLines = [
      `Name: ${typeof name === "string" ? name.trim() : ""}`,
      `Email: ${hasEmail ? email.trim() : ""}`,
      `Phone: ${hasPhone ? phone_number.trim() : ""}`,
      "",
      "Request summary:",
      typeof summary === "string" ? summary.trim() : "",
    ];

    const postmarkPayload: Record<string, unknown> = {
      From: from,
      To: toAddress,
      Subject: safeSubject,
      TextBody: bodyLines.join("\n"),
    };

    if (replyTo) {
      postmarkPayload.ReplyTo = replyTo;
    }

    const resp = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Postmark-Server-Token": POSTMARK_API_KEY,
      },
      body: JSON.stringify(postmarkPayload),
    });

    if (!resp.ok) {
      const errorBody = await resp.text();
      console.error("[Retell function send-email] postmark error", {
        status: resp.status,
        body: errorBody,
      });
      return res
        .status(500)
        .json({ email_sent: false, email_error: "send_failed" });
    }

    return res.status(200).json({ email_sent: true });
  } catch (err) {
    console.error("[Retell function send-email] error", err);
    return res.status(500).json({ email_sent: false, email_error: "failed" });
  }
});

export default router;
