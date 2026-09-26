Type: grilling
Status: resolved
Blocked by: 03, 04

Decision: Use Supabase Realtime Broadcast for minimal public Event invalidation, plus polling through Next.js as a safety net and disconnected fallback. Broadcast carries no Match, Player, account, or Visitor record. A browser refetches the Live Board from a server Route Handler after a notice; the server remains the only application-data authority. See [ADR 0011](../../../docs/adr/0011-broadcast-as-invalidation-only.md).

## Question

How should the Live Board and other shared views receive updates after migration: retain polling, use Supabase Realtime, or use a combination? Decide which records need near-live updates, acceptable update delay, reconnect/fallback behavior, and how to avoid exposing private player or account data.

## Public update contract

- Each Event has a monotonic public revision. A committed change to its public Schedule, Tournament Match state, court assignment, or live/final Match score advances that revision once, at the end of the domain operation's transaction rather than once per changed row. Cover start, score sync, completion, unlock, reset, schedule regeneration, and correction. A permitted Event deletion sends one tombstone invalidation for its former topic; changing the Current Event emits a separate public current-Event invalidation. Clients then refetch the Current Event ID and board. Finished-Match changes can also refresh public History and Leaderboard views when those views are open. Staff-only records and Visitor Matches do not advance a public Event revision.
- A database trigger on the public revision uses `realtime.send` with `is_private := false` to the public `event:<id>:public` topic. Send only `{ eventId, revision }`, or `{ eventId, deleted: true }` from a deletion trigger; the Current Event topic sends only a changed marker. The client joins a public channel with the publishable Supabase key. Do not use `realtime.broadcast_changes`, Postgres Changes, or a full row payload: the former uses private channels and the latter can expose columns. Database credentials and privileged keys stay on the server.
- The Live Board loads its initial snapshot through Next.js, subscribes to the relevant public topic, and refetches through a Next.js Route Handler on a newer notice. Treat notices as untrusted hints: never render their payload as data, never use them for authorization, and coalesce repeated or forged notices so they cannot cause unbounded refetches. The server checks access and returns only the requested public projection; private refetches perform Better Auth role and ownership checks.

## Freshness and failure behavior

- Target a visible Live Board update within 2 seconds of a committed public change when Broadcast is connected. Keep a 10-second safety poll while connected to catch missed notices. If the channel is unavailable, closed, or reconnecting, switch to the existing 2-second poll interval while the board is visible. Polling requests may use a revision/conditional response to avoid retransmitting unchanged boards.
- Refetch immediately after initial subscription, successful reconnection, tab visibility return, and Current Event switch, because messages can be missed while disconnected. Do not open overlapping refetches; after a pending refetch finishes, run one more if a newer revision arrived. Pause background polling in hidden tabs and resume with an immediate refetch. Keep the last confirmed board visible and show stale/error feedback when refetch fails; retry without treating a Broadcast notice as proof that data was saved.
- Public History and Leaderboard views may reuse the relevant Event notice to refetch their authorized projection while open. Account management, private Player/Visitor views, and Qlik analytics do not subscribe to public Event data for their private state. A Visitor Match never appears in an Event notice or public Event result.

## Delivery checks

- Test the emitted payload and topic for each covered mutation and prove no Rally log, account, Visitor, private Player data, or full row appears. Test one revision increment and one notice per committed logical public change, even when it writes many rows; test one tombstone for deletion and no notice for rolled-back writes. An anonymous subscriber must receive the public topic without a Better Auth or Supabase Auth login.
- Browser tests show prompt Live Board updates, a 2-second polling fallback during a lost channel, recovery after reconnect or tab return, and Current Event switching. Refetch authorization tests show a notice cannot reveal private data; forged or repeated notices are bounded to a safe refetch rate.

Sources: [Supabase Broadcast from database](https://supabase.com/docs/guides/realtime/broadcast), [Supabase Realtime channel status](https://supabase.com/docs/guides/realtime/broadcast), [Next.js Route Handlers](https://nextjs.org/docs/app/api-reference/file-conventions/route).
