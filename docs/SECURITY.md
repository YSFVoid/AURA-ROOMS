# SECURITY

AURA Rooms uses slash commands, buttons, selects, and modals only. It does not request message content intent.

## Secret Handling
- Keep `DISCORD_TOKEN` and `MONGODB_URI` only in local `.env`.
- Rotate credentials immediately if exposed.
- Never log or share raw secrets.

## Runtime Protections
- Strict environment validation with zod.
- Safe limits for names, timeouts, import size, per-room allow/deny entries, and abuse windows.
- Prototype-safe JSON import parsing with payload size caps.
- Two-step setup import confirmation with TTL and user+guild binding.
- Admin checks on setup actions and import confirmation/cancel.
- Per-user cooldown and max-room limits, join/leave limiter, and per-guild create rate limiting.
- Guild-scoped creation lock to prevent concurrent room-create races.
- Room deletion only for tracked temp rooms after empty checks.

## Operational Safety
- Structured audit events for setup, import/export, room ownership/permission changes.
- Request correlation IDs for interaction tracing.
- Graceful shutdown on `SIGINT` and `SIGTERM` with Mongo disconnect and client destroy.