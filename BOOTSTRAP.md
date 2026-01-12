# Rocket Reception — BOOTSTRAP

## What this project is

**Rocket Reception** is a managed AI receptionist platform for SMBs.

Current capabilities:
- Voice-first AI call handling (Retell)
- Twilio phone numbers via SIP trunking
- Web chat widget (DB-backed, live)
- SMS ingress (Canada, Twilio)
- Multi-tenant by design (everything belongs to a Subscriber)

Planned / upcoming:
- AI-powered SMS replies
- Email routing
- Usage-based billing

Core principles:
- Explicit, boring schema (no magic JSON blobs)
- Predictable behavior
- Auditable usage & billing
- Clear separation of transport vs AI provider

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
- Embedded via:

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
