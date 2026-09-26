---
status: accepted
---

# Use Supabase Broadcast as an invalidation signal

Supabase Broadcast will send minimal change notices for public shared Event data; it will not carry authoritative records or private account/Visitor data. Browsers refetch through the authorized Next.js server path, with automated polling as a fallback. This keeps the Better Auth server-side authorization boundary intact while enabling prompt Live Board updates.

## Consequences

- Advance a public Event revision once per committed Schedule, court, Tournament Match, or Match score/lifecycle operation, even when it changes many rows. A database trigger uses `realtime.send` with `is_private := false` on a public Event topic with only Event ID and revision; Current Event switches get a separate changed notice. The full-row `realtime.broadcast_changes` helper uses private channels and is not used for this public signal.
- Live Board clients refetch through Next.js on newer notices and on reconnect. Poll every 10 seconds while connected to catch missed notices, and every 2 seconds while visible and disconnected, preserving the current fallback cadence. Treat notices as untrusted and coalesce refetches. Target a visible update within 2 seconds of a committed public change when connected.
- Public History and Leaderboard views may refetch on the same Event notice. Private account, Player, and Visitor data never rides on a public topic, and the server enforces authorization again on every refetch.
