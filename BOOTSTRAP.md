START OF BOOTSTRAP (RocketAgent / Rocket Reception)

PROJECT PURPOSE

Multi-tenant “AI receptionist” platform for small businesses.

Supports channels: WEB CHAT, VOICE (calls), SMS.

Tenancy is modeled by Subscriber + per-channel config in SubscriberChannel.

All conversations are logged as Interaction (thread/call/conversation) + InteractionMessage (individual messages).

REPO SHAPE (high-level)

apps/api/ = Express API (Render deploy target)

src/routes/

twilioWebhooks.ts = Twilio inbound webhooks (SMS is implemented end-to-end)

callRoutes.ts = outbound “call me” endpoint (DB-aware, tenant-scoped)

chatRoutes.ts = web chat endpoints (tenant/channel-aware)

widgetConfig.ts = widget config endpoint (DB-driven per subscriber)

chatRoutes.ts also exposes /chat/contact-phone for widget UX

src/services/retellService.ts = helper(s) for Retell outbound + chat (DB-configured, dynamic vars)

src/services/historySummaryService.ts = builds redacted history summaries (OpenAI) for voice/SMS/chat

scripts/seed/ = seed scripts (idempotent upserts)

Prisma

apps/api/prisma/schema.prisma defines:

Subscriber (tenant + widget/public contact info)

SubscriberChannel (per-tenant channel config: enabled, providers, number, agent IDs)

Interaction (conversation/thread container)

InteractionMessage (messages in an Interaction)

UsageRollup (exists, but NOT currently written to by code)

DATABASE MODEL (current important fields)

Subscriber

slug (unique tenant key)

Widget fields: widgetTitle, widgetSubtitle, widgetGreeting, widgetAvatarUrl, widgetEnabled, offlineMessage
Widget colors: widgetPrimaryColorHex, widgetSecondaryColorHex

Public contact fields (just added + migrated): websiteUrl, publicPhoneE164

allowedDomains: domain allowlist for widget-config + chat access

SubscriberChannel

Unique per (subscriberId, channel)

channel: VOICE | CHAT | SMS

enabled

providerNumberE164 (important for SMS/VOICE routing by “To” number)

providerAgentIdOutbound (Retell voice agent id for outbound)

providerAgentIdInbound (Retell voice agent id for inbound)

providerInboxId (Retell chat agent id used for SMS + web chat)

transportProvider, aiProvider

Interaction

For SMS: used as the “thread”

providerConversationId is used to store Retell chat_id for continuity across messages

Also stores fromNumberE164, toNumberE164, contactPhoneE164, timestamps/status

InteractionMessage

role: USER | AGENT | SYSTEM | TOOL

providerMessageId: Twilio MessageSid for SMS idempotency + tracing

SEEDS (why they exist + how they’re used)

Seed scripts are repeatable (idempotent) upserts so a fresh DB (or a reset DB) can be brought to a known working state quickly.

In production, adding a real subscriber would normally be done by an admin UI / internal tool (not seeds). Seeds are mainly:

dev/demo setup

consistent environments

quick rebuilds after schema changes

Current seed scripts:

seed-core.ts: upserts core Subscribers (rocketsciencedesigns + demo-gatekeeper) including websiteUrl and publicPhoneE164

seed-demo.ts: upserts demo Subscribers (winnipegbeauty, winnipegrenoking, winnipegprimoaccountants) widget content

seed-channels.ts: upserts SubscriberChannel rows for CHAT/VOICE/SMS and ensures only the correct subscriber “claims” numbers / agents

seed-agents.ts: seeds internal Agent table entries (not Retell agent IDs; these are “our” Agent prompts)

ENV VARS (local .env and Render)

Database

DATABASE_URL=...

Retell

RETELL_API_KEY=...

RETELL_FUNCTION_SECRET=... (used for custom function webhook verification)

OPENAI_API_KEY=... (history summaries)

Twilio (needed for sending SMS + webhook validation if you add it later)

TWILIO_ACCOUNT_SID=...

TWILIO_AUTH_TOKEN=...

NOTE: You currently still have some env vars like RETELL_FROM_NUMBER, RETELL_AGENT_ID, RETELL_CHAT_AGENT_ID from earlier work. They are used by the current outbound call / older patterns, and may be phased out as we move channel config into the DB.
NOTE: Legacy RETELL_FROM_NUMBER / RETELL_CHAT_AGENT_ID are no longer used in code (safe to remove).

WHAT IS DONE (SMS IS “FINISH LINE” LEVEL)
File: apps/api/src/routes/twilioWebhooks.ts

Inbound SMS endpoint (POST /sms) is working end-to-end:

Parses Twilio form payload.

Idempotency: ignores duplicates using InteractionMessage.providerMessageId = MessageSid.

Resolves the tenant via SubscriberChannel by matching:

channel = "SMS"

enabled = true

providerNumberE164 = To (Twilio number)

D-lite threading:

Reuses an existing Interaction (SMS thread) for same subscriber + From/To inside a window.

Persists inbound text as InteractionMessage role=USER.

Retell chat:

Uses SubscriberChannel.providerInboxId as the Retell chat agent id.

Creates Retell chat_id if missing and stores it on Interaction.providerConversationId.

Sends message to Retell create-chat-completion to get a reply.

A2 outbound SMS:

Sends the Retell reply via Twilio.

Persists outbound message as InteractionMessage role=AGENT with Twilio SID.

Rate limiting:

Outbound-per-hour limiting is implemented and working now.

Policy/warning messaging is implemented (append “remaining replies” + website/phone) and depends on:

counting outbound InteractionMessage (role=AGENT) in last hour

Subscriber websiteUrl and publicPhoneE164 for “continue on website / call” directions

There are helper functions in this file (ex: policy application, sending + persisting) to keep logic consistent.

IMPORTANT: UsageRollup

Current code does not insert/update UsageRollup anywhere yet.

Right now, usage can be derived from Interaction + InteractionMessage by querying counts over time.

UsageRollup is intended as a monthly aggregation table (fast billing queries), but needs a job/worker/cron to compute it.

WHAT STILL NEEDS DOING (NEXT GOALS)
Goal 1: Make VOICE tenant/channel-aware + log Interactions like SMS

Update inbound voice webhook route(s) (Twilio -> Retell or Retell -> your API, depending on your current call flow) to:

Resolve subscriber by called number (To) using SubscriberChannel where channel="VOICE" and enabled=true

Create an Interaction for the call (providerCallId, from/to, startedAt, etc.)

Persist key “events” or transcripts as InteractionMessage (if/when available), or at minimum:

start event message

end event message with duration/status

Ensure the correct Retell voice agent id is used from DB (SubscriberChannel.providerAgentIdOutbound/providerAgentIdInbound), not hardcoded/env

Status: In progress. Retell voice webhook persists call_started/call_ended/call_analyzed and resolves inbound by called number.
Status: In progress. Inbound Call Webhook (Retell) now injects history_summary via /retell/voice-inbound.

Goal 2: Make WEB CHAT tenant/channel-aware + log Interactions like SMS (DONE)

Update chatRoutes.ts so that the request identifies which tenant it is for (DONE)

Request requires subscriber slug in body.

Resolves SubscriberChannel where channel="CHAT", enabled=true (DONE)

Uses providerInboxId as Retell chat agent id (DONE)

Creates Interaction per session and persists inbound/outbound messages (DONE)

Continuity:

Retell chat_id stored on Interaction.providerConversationId (DONE)

Widget stores chatId in localStorage per subscriber (DONE)

Widget stores interactionId in localStorage and can query contact phone (DONE)

Widget-config + chat routes enforce allowedDomains by Origin/Referer (DONE)

Goal 3: Outbound “Call me” route refactor (optional but recommended soon)

The “call me” button DOES call your API:

The website JS posts to https://rocketagent.onrender.com/call

callRoutes.ts now uses DB-based VOICE config (providerNumberE164 + providerAgentIdOutbound) and creates Interactions on outbound call_id.

Outbound calls attach history_summary (last 3 interactions / 6 months).

Future direction to align with DB:

Determine subscriber for the call request (e.g., pass slug in request body, or host-based mapping)

Load the VOICE SubscriberChannel row and use:

providerNumberE164 (from number)

providerAgentIdOutbound (Retell voice agent for outbound)

Create an Interaction for the outbound call and log status transitions + any callbacks.

HOW TO THINK ABOUT “ONE ROUTE VS SEPARATE ROUTE” FOR OUTBOUND CALLS

Keep inbound voice webhooks and outbound “call me” as separate endpoints/routes:

They are different triggers, different payloads, different auth/threat models.

They can share helper functions:

resolveSubscriberByNumber(To)

createInteractionForCall()

logInteractionMessage()

USAGE DATA (SHORT-TERM vs LONG-TERM)
Short-term (right now)

Query directly from Interaction / InteractionMessage:

SMS outbound count per subscriber per hour/day

Conversations per channel per day/week

Basic billing previews

This is the best source of truth until rollups exist.

Long-term (recommended)

Use UsageRollup as the monthly “billing-grade” summary table.

Implement a scheduled job (cron/worker) that:

Aggregates per subscriber per month:

smsCount (could be outbound only for billing, or both inbound/outbound depending on your pricing)

voiceCallsCount / voiceMinutes

chatConversationsCount / chatMessagesCount

Upserts into UsageRollup.

Build a secure internal dashboard:

Admin auth

Subscriber list with rollups + ability to drill down into raw interactions/messages

This can start as a simple admin-only page/API.

CURRENT DEMO SETUP

Demo gatekeeper subscriber exists and “owns” the demo Twilio number.

Demo businesses exist as separate Subscribers (winnipegbeauty, winnipegrenoking, winnipegprimoaccountants).

Channels are seeded so only the correct subscriber claims numbers/agents.

Retell agent IDs for chat/voice are stored in DB fields on SubscriberChannel (providerAgentIdOutbound/providerAgentIdInbound/providerInboxId).

Widget branding defaults:
- widget-config returns default colors if missing
- widget client also falls back to defaults (colors + avatar)
- default avatar URL: https://rocketreception.ca/assets/rocket-reception.png

Widget demo branding:
- Winnipeg Beauty avatar: https://rocketreception.ca/demo-winnipeg-beauty/assets/winnipeg-beauty-logo.png
- Rocket Science Designs avatar: https://rocketsciencedesigns.com/assets/rocket-logo-26.png
- Winnipeg Beauty primary color: #f473bf
- Winnipeg Reno King avatar: https://rocketreception.ca/demo-winnipeg-reno-king/assets/logo.png
- Winnipeg Reno King primary color: #ae8332
- Winnipeg Primo Accountants avatar: https://rocketreception.ca/demo-winnipeg-primo-accountants/assets/logo.png
- Winnipeg Primo Accountants primary color: #14aa40
- Demo secondary color (avatar bg): #808080

NOTES / GOTCHAS YOU’VE HIT BEFORE

Prisma TLS errors were due to local/Render DB URL SSL config mismatch (resolved already).

Reset DBs + migrations archive:

Local DB: rocket_agent_local_v2

Render DB: rocket_agent_baseline

Inconsistent migration history prompted a clean reset and a migrations archive folder now exists.

When you add new columns to Prisma schema:

migrate DB

regenerate Prisma client (so TS types include new fields)

rebuild TS -> dist before running compiled seed JS

Trial Twilio adds “Sent from your Twilio trial account” banner (normal).

NEXT WORK SESSION CHECKLIST (what Codex should do next)

History-aware context (DONE for voice/SMS/chat)

- Voice outbound/inbound: history_summary injected via dynamic variables.

- SMS: history_summary injected on new thread create-chat.

- Chat: history_summary injected on new chat creation if contactPhoneE164 exists.

Retell custom function (capture_phone) (DONE)

- Endpoint: POST /retell/functions/capture-phone

- Stores contactPhoneE164 and returns history_summary for chat.

Read apps/api/src/routes/twilioWebhooks.ts and copy the “pattern” used for SMS:

resolve tenant via SubscriberChannel

create/reuse Interaction

write InteractionMessage

Apply the same pattern to:

voice webhook route(s) (wherever voice inbound is currently handled)

Refactor callRoutes.ts to:

accept a subscriber identifier (slug) (DONE)

resolve VOICE channel from DB (DONE)

use DB-based from number + Retell voice agent id (DONE)

log Interaction and messages/events (DONE)

END OF BOOTSTRAP
