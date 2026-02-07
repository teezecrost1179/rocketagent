import { Router } from "express";
import { RETELL_FUNCTION_SECRET } from "../config/env";
import { prisma } from "../lib/prisma";
import { buildHistorySignals } from "../services/historySummaryService";
import { normalizePhone } from "../utils/phone";

const router = Router();

function requireFunctionSecret(req: { headers: Record<string, string | string[] | undefined> }) {
  const expected = RETELL_FUNCTION_SECRET;
  if (!expected) return true;
  const provided = req.headers["x-retell-secret"];
  if (Array.isArray(provided)) return provided.includes(expected);
  return provided === expected;
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

export default router;
