Rocket Reception — GOTCHAS / QUIRKS

This document exists so Future You does not re-learn the same painful lessons.

Everything here is based on real failures encountered during development and production cutovers.

Local vs Render databases (critical)

Local development should use a local Postgres database

Render production should use a separate Render Postgres database

Never run prisma migrate dev or seed scripts against the production DB by accident

Why this matters:

SSL behavior differs

Shadow DB behavior differs

Seeds against prod are dangerous and confusing

Rule of thumb:

Local DB → localhost

Render DB → *.render.com

Prisma + Render gotchas
prisma migrate dev on Render

❌ Fails with: permission denied to terminate process

Reason: Render Postgres does not grant permissions required for Prisma’s shadow database

This is not a schema bug

Use instead:

prisma migrate deploy (applies known migrations only)

prisma migrate diff (inspection / verification only)

Shadow DB clarification

Prisma’s shadow DB is created on whatever database DATABASE_URL points to

It is not local by default

Ordering bugs surface during shadow DB replays, not always immediately

Migration rules of engagement

❌ Never rename migrations to force ordering (e.g. adding 000_)

❌ Never edit already-applied migrations

❌ Never “patch” broken history by stacking fixes blindly

Correct approach:

Add new migrations for fixes

If migrations stop replaying cleanly:

Stop

Baseline (see below)

Baseline / migration reset lessons (important)

If migration history becomes unreplayable:

Treat the current production DB as the source of truth

Generate a single baseline migration

Apply it to a new empty database

Point the app at the new DB

Keep the old DB temporarily as a fallback

Notes:

Render allows multiple databases per Postgres instance

Changing only the DB name in DATABASE_URL is sufficient

Render UI shows one “primary” DB, but others still exist

Prisma + SSL gotchas (very common)

External Render Postgres URLs require SSL

Use ?sslmode=require

Local Postgres does not support SSL by default

Use ?sslmode=disable (or omit sslmode)

Common error:

“The server does not support SSL connections”

This means:

The DB endpoint and sslmode do not match

Mental rule:

Environment	Host	sslmode
Local dev	localhost	disable
Render prod	*.render.com	require

Note:

psql may succeed while Prisma fails — Prisma is stricter

Provider refactor lessons

A single provider field is ambiguous.

Correct split:

transportProvider (Twilio, Retell, etc.)

aiProvider (Retell, OpenAI, etc.)

Safe refactor order:

Add new fields (nullable)

Backfill data

Enforce NOT NULL

Drop legacy field

Seeds (read this twice)

Seeds are manual and idempotent

Seeds are not independent

Order matters

Always:

Build before running seeds

Run seeds from compiled dist/ output

Correct seed order:

seed-core

seed-agents

seed-channels

seed-demo

Running channels before agents may silently create incomplete rows.

SMS channel wiring gotchas

providerInboxId is required for SMS → Retell routing

Despite the name, it stores the Retell chat agent ID

If missing:

SMS routing succeeds

Interaction is created

Retell fails with “Missing Retell chat agent id”

Seeds must set:

enabled = true

providerNumberE164

providerInboxId (Retell agent ID)

PowerShell / Windows quirks

psql -c requires careful quoting

Double-escaped quotes silently break SQL

When in doubt:

Enter psql interactively

Paste SQL directly

Other notes:

Some node scripts require explicit dotenv loading

VS Code aggressively caches Prisma types

Restarting the terminal fixes more than expected

Twilio SMS gotchas

Twilio SMS webhooks are application/x-www-form-urlencoded, not JSON

Must be parsed with express.urlencoded

Twilio requires a TwiML response, even if empty

Leaving demo webhook URLs active will swallow messages and auto-reply

SMS transport ownership

In this project, Twilio SMS sending is done by your API (Twilio SDK), not by Retell directly.

Retell is used as the AI response engine for SMS content.

Retell SMS limitation

Retell native two-way SMS only supports US numbers

Canadian SMS requires:

Twilio as transport

Your API as router/logger

Retell chat agents as the AI brain

Retell custom function gotchas

For custom functions that expect raw args in your Express route, set Payload: args only = ON.

If args only is OFF, payload shape changes and your route may see missing fields.

If you see literal templates like "{{interaction_id}}" in tool arguments, the dynamic variable was not resolved in Retell.

For secured function endpoints, include x-retell-secret header and match RETELL_FUNCTION_SECRET.

history-detail debugging

If history_detail_summary returns empty, verify:

- function URL and secret header are correct

- Payload: args only is ON

- phone_number and subscriber_slug (or interaction_id) are present

- OPENAI_API_KEY exists in Render env

Mental model reminders

diff shows differences

deploy applies known migrations

dev creates + validates migrations (not suitable for Render)

Transport provider ≠ AI provider

Channels are permissioned, tier-gated features

When in doubt

Trust the database state

Verify with migrate diff

Avoid clever migrations

Prefer explicit data over inferred behavior

Domain allowlist notes

Subscriber.allowedDomains controls access to /widget-config and /chat.

We use Origin header first, then Referer.

If both are missing, we log a warning and allow the request.

Widget branding defaults

widgetPrimaryColorHex / widgetSecondaryColorHex are optional; widget-config and widget client fall back to defaults.

Default avatar URL: https://rocketreception.ca/assets/rocket-reception.png
