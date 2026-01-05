AGENTS.md — Rocket Agent
Project Context

Rocket Agent is a service-first AI receptionist backend built with:

Node.js + TypeScript + Express

Prisma (v7) with Postgres

Hosted on Render

External integrations (Retell, future Twilio, Square, etc.)

This repo is not a self-serve SaaS app. It supports a managed service.

Runtime & Environment Assumptions

Render is the primary runtime and test environment

Local development is intentionally minimal

Do not assume full production parity locally

Local environment:

Node + npm installed

npm install

npx prisma generate

npm run build

Local .env may exist only to satisfy tooling (e.g. DATABASE_URL).

Database Rules (Important)

Database is Render Postgres

Prisma uses a driver adapter (@prisma/adapter-pg)

SSL is required in production (rejectUnauthorized: false)

Do NOT:

add logic that auto-runs seeds

run migrations automatically on deploy

assume a local Postgres instance exists

change Prisma adapter configuration without intent

Seeding is manual only.

Build & Deploy Rules

Render build command:

npx prisma generate && npm run build


dist/ is a build artifact and is gitignored

TypeScript is the source of truth

Do not commit compiled JS

Coding Expectations

Keep changes small and explicit

Prefer clarity over abstraction

Avoid adding new dependencies unless necessary

Do not introduce background jobs, schedulers, or queues unless explicitly requested

Integration Constraints
Retell

Dynamic variables must be passed via:

retell_llm_dynamic_variables


Do not assume SSML support

Greeting pauses use dash-style text pauses

Outbound calls are fire-and-forget unless otherwise specified

General

External integrations are usage-based and cost-sensitive

Avoid adding “free usage” assumptions

Prefer metered / explicit behavior

What This Project Is NOT

Not a CRM

Not a helpdesk

Not a full ERP replacement

Not an enterprise-grade AI platform

Design choices should favor:

reliability

predictability

explainability to SMB clients

When Unsure

If a change could affect:

billing

usage tracking

integrations

deployment behavior

➡️ Ask before implementing.

Summary for Agents

Respect the minimal local setup

Respect Render-first deployment

Avoid automation that removes operator control

Optimize for a managed SMB service, not a generic SaaS

End of AGENTS.md