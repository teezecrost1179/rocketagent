Rocket Reception — BOOTSTRAP

What this project is

Rocket Reception is a managed AI receptionist platform for SMBs.

Current capabilities:

Voice-first AI call handling (Retell)

Twilio phone numbers via SIP trunking

Web chat widget (DB-backed, live)

SMS ingress for Canada via Twilio (inbound working)

Multi-tenant by design (everything belongs to a Subscriber)

Planned / upcoming:

AI-powered SMS replies (Twilio transport + Retell chat agent)

Email routing

Usage-based billing

Core principles:

Explicit, boring schema (no magic JSON blobs)

Predictable behavior

Auditable usage & billing

Clear separation of transport provider vs AI provider

Current stack

Backend:

Node.js + TypeScript

Express

Prisma ORM

PostgreSQL (Render-managed)

Hosted on Render

Widget:

Plain JavaScript compiled from TypeScript

Hosted on cPanel

Embedded via a script tag that loads the widget and initializes it on page load

Repo layout (local)

root

BOOTSTRAP.md

GOTCHAS.md

apps

api

src

lib (prisma client, helpers)

routes (Express routes, including Twilio webhooks)

scripts/seed (manual seed scripts)

prisma

schema.prisma

migrations

dist (compiled JS output)

widget

src (widget source)

prisma.config.ts

Core database model (high-level)

Primary tables:

Subscriber – a tenant / customer

SubscriberChannel – enabled communication channels per subscriber

Agent – internal AI agents

Interaction – calls, chats, SMS

InteractionMessage – transcripts and messages

UsageRollup – billing aggregates

SubscriberChannel provider model (important)

The legacy single “provider” field has been removed.

SubscriberChannel now uses two explicit provider fields:

transportProvider (NOT NULL)
Who owns the transport, carrier, or number.
Examples: TWILIO, RETELL, OTHER

aiProvider (NOT NULL)
Who provides the AI brain.
Examples: RETELL, OTHER

Optional provider-specific fields:

providerNumberE164

providerAgentId

providerInboxId

This enables clean modeling such as:

Twilio (Canada) + Retell AI

Retell-owned numbers

Future email or SMS transports

Phone numbers (current)

Demo number (Twilio → Retell via SIP trunking):

+1 431 600 5505

Transport provider: TWILIO

AI provider: RETELL

Used for VOICE and SMS

Twilio SMS webhook points to:
https://rocketagent.onrender.com/webhooks/twilio/sms

Rocket Science Designs (Retell-owned number):

+1 (204) 808-2733

Transport provider: RETELL

AI provider: RETELL

Channels (current behavior)

CHAT:

Enabled by default

aiProvider = RETELL

Used by the web widget

VOICE:

Enabled by default

transportProvider = TWILIO

aiProvider = RETELL

Uses demo number and Retell gatekeeper routing

SMS:

Separate channel (tier-gated feature)

Default disabled

transportProvider = TWILIO

aiProvider = RETELL

Inbound Canadian SMS is currently received by the API

No replies yet (logging only)

Seeding status

Seeds are manual and not run automatically on deploy.

Key seed scripts:

seed-core – canonical subscribers

seed-demo – demo subscribers

seed-agents – internal agent records

seed-channels – CHAT, VOICE, and SMS channels

seed-channels behavior:

Upserts CHAT (enabled)

Upserts VOICE (enabled)

Upserts SMS (disabled by default)

Seeds are idempotent and safe to re-run.

Migration posture (important)

prisma migrate deploy is the source of truth

prisma migrate dev is avoided on Render due to shadow DB permission issues

prisma migrate diff is used for inspection and validation only

SMS webhook (current)

A minimal inbound SMS webhook is implemented at:

POST /webhooks/twilio/sms

Behavior:

Parses Twilio form-encoded payload

Logs inbound SMS fields

Returns empty TwiML so Twilio does not auto-reply

This confirms Canadian SMS delivery into the system.

Current state

Provider split complete (transportProvider / aiProvider)

Legacy provider field removed

Data backfilled and NOT NULL enforced

CHAT, VOICE, and SMS channels seeded

Twilio inbound SMS successfully hitting Render logs

Ready to persist inbound SMS to the database

Immediate next steps (recommended order)

Persist inbound SMS into Interaction and InteractionMessage tables

Resolve Subscriber based on inbound “To” number

Forward SMS content to a Retell chat agent for reply text

Send outbound SMS via Twilio Messaging API

Add SMS metrics to UsageRollup