import { OPENAI_API_KEY } from "../config/env";
import { prisma } from "../lib/prisma";

type HistorySummaryOptions = {
  subscriberId: string;
  phoneNumber: string;
  channel?: "VOICE" | "SMS" | "CHAT";
  channels?: Array<"VOICE" | "SMS" | "CHAT">;
  maxInteractions?: number;
  lookbackMonths?: number;
  maxMessagesPerInteraction?: number;
};

const DEFAULT_MAX_INTERACTIONS = 3;
const DEFAULT_LOOKBACK_MONTHS = 6;
const DEFAULT_MAX_MESSAGES_PER_INTERACTION = 10;
const OPENAI_MODEL = "gpt-4.1-mini";

const REDACTION_RULES = `Redact any highly sensitive personal or security-related information from the text below.

REDACT the following if present:
- Credit card or debit card numbers
- Bank account numbers or routing numbers
- Social Security / Social Insurance numbers
- Email addresses
- Phone numbers (any format)
- Exact street addresses (house number + street)
- Passwords, API keys, access tokens, or secrets

Replace each redacted item with a clear placeholder:
- [REDACTED_EMAIL]
- [REDACTED_PHONE]
- [REDACTED_ADDRESS]
- [REDACTED_FINANCIAL]
- [REDACTED_SECRET]

Do NOT redact:
- First names only
- Company or business names
- Cities or regions
- General descriptions of needs or services

Do not add or remove content other than redaction.`;

function buildLookbackDate(months: number) {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d;
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function daysAgo(date: Date) {
  const ms = Date.now() - date.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

function normalizeText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function roleLabel(role: string) {
  switch (role) {
    case "USER":
      return "User";
    case "AGENT":
      return "Agent";
    case "SYSTEM":
      return "System";
    case "TOOL":
      return "Tool";
    default:
      return "Message";
  }
}

async function callOpenAiSummary(input: string): Promise<string | null> {
  const apiKey = OPENAI_API_KEY;
  if (!apiKey) {
    console.warn("[historySummary] Missing OPENAI_API_KEY");
    return null;
  }

  const systemPrompt =
    "You summarize prior customer interactions for an AI receptionist. " +
    "Write a factual summary that captures: the caller's intent, key details, and any decisions/outcomes. " +
    "If multiple interactions are provided, include 1-2 bullet points per interaction. " +
    "Do not add new facts. Avoid meta-commentary about redaction or privacy. " +
    "After summarizing, apply the redaction rules exactly to the content.";

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `${REDACTION_RULES}\n\nSource text:\n${input}` },
      ],
      temperature: 0.2,
    }),
  });

  const data = await resp.json();

  if (!resp.ok) {
    console.error("[historySummary] OpenAI error", {
      status: resp.status,
      data,
    });
    return null;
  }

  const text = data?.choices?.[0]?.message?.content;
  return text ? text.trim() : null;
}

export async function buildHistorySummary({
  subscriberId,
  phoneNumber,
  channel,
  channels,
  maxInteractions = DEFAULT_MAX_INTERACTIONS,
  lookbackMonths = DEFAULT_LOOKBACK_MONTHS,
  maxMessagesPerInteraction = DEFAULT_MAX_MESSAGES_PER_INTERACTION,
}: HistorySummaryOptions): Promise<string | null> {
  const since = buildLookbackDate(lookbackMonths);
  const channelList = channels || (channel ? [channel] : undefined);

  const interactions = await prisma.interaction.findMany({
    where: {
      subscriberId,
      ...(channelList ? { channel: { in: channelList } } : {}),
      startedAt: { gte: since },
      OR: [
        { fromNumberE164: phoneNumber },
        { toNumberE164: phoneNumber },
        { contactPhoneE164: phoneNumber },
      ],
    },
    orderBy: { startedAt: "desc" },
    take: maxInteractions,
    select: {
      id: true,
      startedAt: true,
      direction: true,
      channel: true,
      summary: true,
      updatedAt: true,
    },
  });

  if (interactions.length === 0) return null;

  const interactionIds = interactions.map((i) => i.id);

  const messages = await prisma.interactionMessage.findMany({
    where: { interactionId: { in: interactionIds } },
    orderBy: { createdAt: "asc" },
    select: { interactionId: true, role: true, content: true, createdAt: true },
  });

  const messagesByInteraction = new Map<string, typeof messages>();
  for (const msg of messages) {
    const arr = messagesByInteraction.get(msg.interactionId) || [];
    arr.push(msg);
    messagesByInteraction.set(msg.interactionId, arr);
  }

  const sections: string[] = [];

  for (const interaction of interactions) {
    const msgs = messagesByInteraction.get(interaction.id) || [];
    const lastMessageAt = msgs.length
      ? msgs[msgs.length - 1].createdAt
      : null;
    const summaryIsFresh =
      !!interaction.summary &&
      !!lastMessageAt &&
      interaction.updatedAt >= lastMessageAt;

    const ageDays = daysAgo(interaction.startedAt);
    const header = `Interaction: ${interaction.channel} • ${interaction.direction} • ${formatDate(
      interaction.startedAt
    )} (${ageDays} days ago)`;
    sections.push(header);

    if (summaryIsFresh && interaction.summary) {
      sections.push(`Summary: ${normalizeText(interaction.summary)}`);
      continue;
    }

    const tail = msgs.slice(-maxMessagesPerInteraction);
    for (const msg of tail) {
      const line = `${roleLabel(msg.role)}: ${normalizeText(msg.content)}`;
      sections.push(line);
    }
  }

  const sourceText = sections.join("\n");
  if (!sourceText.trim()) return null;

  return callOpenAiSummary(sourceText);
}

type HistorySignalsOptions = {
  subscriberId: string;
  phoneNumber: string;
  channel?: "VOICE" | "SMS" | "CHAT";
  channels?: Array<"VOICE" | "SMS" | "CHAT">;
  maxInteractions?: number;
  lookbackMonths?: number;
};

/**
 * Build a compact list of recent interactions (date + channel + direction).
 * Intended for low‑friction context at chat/call start.
 */
export async function buildHistorySignals({
  subscriberId,
  phoneNumber,
  channel,
  channels,
  maxInteractions = DEFAULT_MAX_INTERACTIONS,
  lookbackMonths = DEFAULT_LOOKBACK_MONTHS,
}: HistorySignalsOptions): Promise<string | null> {
  const since = buildLookbackDate(lookbackMonths);
  const channelList = channels || (channel ? [channel] : undefined);

  const interactions = await prisma.interaction.findMany({
    where: {
      subscriberId,
      ...(channelList ? { channel: { in: channelList } } : {}),
      startedAt: { gte: since },
      OR: [
        { fromNumberE164: phoneNumber },
        { toNumberE164: phoneNumber },
        { contactPhoneE164: phoneNumber },
      ],
    },
    orderBy: { startedAt: "desc" },
    take: maxInteractions,
    select: {
      startedAt: true,
      direction: true,
      channel: true,
      summary: true,
    },
  });

  if (interactions.length === 0) return null;

  const lines = interactions.map((i) => {
    const date = formatDate(i.startedAt);
    const base = `${date} • ${i.channel} • ${i.direction}`;
    return i.summary ? `${base} • ${normalizeText(i.summary)}` : base;
  });

  return `Recent interactions (${lookbackMonths}mo):\n- ${lines.join("\n- ")}`;
}
