# Rocket Reception — BOOTSTRAP

## What this project is
Rocket Reception is a **managed AI receptionist platform** for SMBs.

Core capabilities today:
- **Voice-first AI call handling** (Retell)
- **Twilio phone numbers via SIP trunking**
- **Web chat widget** (live, DB-backed)
- Multi-tenant by design (everything belongs to a Subscriber)

Planned / future:
- SMS
- Email routing
- Usage-based billing

Core principles:
- Explicit, boring schema (no magic JSON blobs)
- Predictable behavior
- Auditable usage & billing

---

## Current stack

### Backend
- Node.js + TypeScript
- Express
- Prisma ORM
- PostgreSQL (Render-managed)
- Hosted on Render

### Widget
- Plain JS compiled from TypeScript
- Hosted on cPanel
- Embedded with:

```html
<script
  src="https://widget.rocketreception.ca/widget.js"
  data-api-base="https://rocketagent.onrender.com"
  data-subscriber="rocketsciencedesigns"
  defer
></script>
<script>
  window.addEventListener("load", function () {
    if (window.RocketChatWidget) RocketChatWidget.init();
  });
</script>
```

---

## Repo layout (local)

```
root
├─ apps/
│  ├─ api/
│  │  ├─ src/
│  │  │  ├─ lib/prisma.ts
│  │  │  ├─ routes/
│  │  │  └─ scripts/seed/
│  │  ├─ prisma/
│  │  │  ├─ schema.prisma
│  │  │  └─ migrations/
│  │  └─ dist/
│  └─ widget/
│     └─ src/index.ts
└─ prisma.config.ts
```

---

## Database model (high-level)

### Core tables
- **Subscriber** – tenant / customer
- **SubscriberChannel** – enabled communication channels per subscriber
- **Agent** – internal AI agents
- **Interaction** – calls / chats
- **InteractionMessage** – transcripts & messages
- **UsageRollup** – billing aggregates

---

## SubscriberChannel provider model (IMPORTANT)

The legacy single `provider` field has been **removed**.

SubscriberChannel now uses an explicit split:

- `transportProvider` (NOT NULL)
  - Who owns the transport / number / carrier
  - Examples: `TWILIO`, `RETELL`, `OTHER`

- `aiProvider` (NOT NULL)
  - Who provides the AI brain
  - Examples: `RETELL`, `OTHER`

This enables clear logic such as:
- Twilio number + Retell AI
- Retell-owned number + Retell AI
- Future email/SMS transports

Provider-specific implementation details remain optional:
- `providerNumberE164`
- `providerAgentId`
- `providerInboxId`

---

## Demo & real numbers (current)

### Demo phone number (Twilio → Retell via SIP)
- **+1 431 600 5505**
- Transport provider: **TWILIO**
- AI provider: **RETELL**
- Uses a Retell **gatekeeper agent** that routes to demo agents

### Rocket Science Designs (Retell-owned number)
- **+1 (204) 808-2733**
- Transport provider: **RETELL**
- AI provider: **RETELL**

---

## Seeding status

Seeds are **manual** (not run automatically on deploy).

Key seed scripts:
- `seed-core` – canonical subscribers
- `seed-demo` – demo subscribers
- `seed-agents` – internal agent records
- `seed-channels` – CHAT + VOICE channels

`seed-channels` now:
- Creates CHAT channel (aiProvider=RETELL)
- Creates VOICE channel with:
  - transportProvider=TWILIO
  - aiProvider=RETELL
  - demo phone number
  - gatekeeper agent ID

Seeds are idempotent and safe to re-run.

---

## Migration posture (important)

- **`prisma migrate deploy`** is the source of truth
- **`prisma migrate dev` is intentionally NOT used** on Render
- `prisma migrate diff` is used for inspection only

Migration history is now clean and logically replayable, but Render permissions prevent `migrate dev` from being practical.

---

## Current state

✅ Provider refactor complete
✅ Legacy provider field removed
✅ Data backfilled and enforced NOT NULL
✅ Seeds updated and verified
✅ CHAT + VOICE channels seeded for all subscribers

---

## Likely next steps

- Interaction logging for inbound VOICE calls
- Runtime routing based on SubscriberChannel
- SMS channel planning
- Billing & usage aggregation

