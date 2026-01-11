# Rocket Reception — GOTCHAS / QUIRKS

This file exists so Future You doesn’t have to rediscover painful lessons.

---

## Prisma + Render gotchas

### `prisma migrate dev` on Render
- **Fails** with:
  > permission denied to terminate process
- Reason: Render Postgres does not grant permissions Prisma needs to manage shadow DB lifecycle
- This is **not** a schema bug
- Solution:
  - Use `prisma migrate deploy` only
  - Use `prisma migrate diff` for inspection

### Shadow DB clarification
- Shadow DB is **not local by default**
- Prisma creates it on whatever DB `DATABASE_URL` points to
- Ordering bugs show up only during shadow replays

---

## Migration rules of engagement

- Never rename migrations to force ordering (e.g. adding `000_`)
- Migrations must only touch tables that already exist at that point in history
- Do not edit already-applied migrations to change live behavior
- Use new migrations for fixes

---

## Provider refactor lessons

- Single `provider` field was ambiguous
- Split into:
  - `transportProvider`
  - `aiProvider`
- Backfill first → enforce NOT NULL second → drop legacy field last

Correct order matters.

---

## Seeds

- Seeds are **manual** and idempotent
- Always run:
  - `npm run build:api`
  - then the seed script from `dist/`

Example:
```bash
node -r dotenv/config apps/api/dist/scripts/seed/seed-channels.js
```

---

## Prisma Client + TypeScript

If TS says a new field doesn’t exist:
1) Run `npx prisma generate`
2) Restart TS Server in VS Code

VS Code often caches old `.d.ts` files.

---

## PowerShell / Windows quirks

- Some scripts require:
  ```bash
  node -r dotenv/config ...
  ```
- Execution policy can block `npx` scripts
- Restarting shells fixes more than expected

---

## Mental model reminders

- `diff` shows differences
- `deploy` applies known migrations
- `dev` creates & validates migrations (not for Render)

---

## When in doubt

- Trust the database state
- Verify with `migrate diff`
- Avoid cleverness
- Prefer explicit over magical

