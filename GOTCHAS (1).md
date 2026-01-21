Rocket Reception — GOTCHAS / QUIRKS

This file exists so Future You doesn’t have to rediscover painful lessons.

Prisma + Render gotchas

no local db. Database URL in local env var is the DB on Render.

prisma migrate dev on Render:

Fails with “permission denied to terminate process”

Reason: Render Postgres does not grant permissions needed for Prisma’s shadow DB lifecycle

This is not a schema bug

Use prisma migrate deploy

Use prisma migrate diff for inspection only

Shadow DB clarification:

Shadow DB is not local by default

Prisma creates it on the database pointed to by DATABASE_URL

Ordering bugs surface during shadow DB replays

Migration rules of engagement

Never rename migrations to force ordering (for example adding “000_”)

Migrations must only touch tables that already exist at that point in history

Do not edit already-applied migrations

Use new migrations for fixes

Provider refactor lessons

A single provider field is ambiguous

Correct split:

transportProvider

aiProvider

Correct order:

Add new fields (nullable)

Backfill data

Enforce NOT NULL

Drop legacy field

Seeds

Seeds are manual and idempotent

Always build before running seeds

Always run seeds from dist output

Prisma Client + TypeScript

If TypeScript says a field does not exist:

Run prisma generate

Restart the VS Code TypeScript server

VS Code aggressively caches Prisma type definitions.

PowerShell / Windows quirks

Some node scripts require dotenv preloading

npx failures are often execution policy or shell issues

Restarting the terminal fixes more than expected

Twilio SMS gotchas

Twilio SMS webhooks are form-encoded, not JSON

Must be parsed with express.urlencoded

Twilio requires a TwiML response, even if empty

Leaving the demo webhook URL will swallow messages and auto-reply

Retell SMS limitation

Retell native two-way SMS only supports US numbers

Canadian SMS requires:

Twilio as transport

Your API as router and logger

Retell chat agents as the AI brain

Mental model reminders

diff shows differences

deploy applies known migrations

dev creates and validates migrations (not suitable for Render)

Transport provider is not the same as AI provider

Channels are permissioned, tier-gated features

When in doubt

Trust the database state

Verify with migrate diff

Avoid cleverness

Prefer explicit over magical