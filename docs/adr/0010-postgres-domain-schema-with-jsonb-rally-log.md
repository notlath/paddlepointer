---
status: accepted
---

# Use a relational domain schema with JSONB for the Rally log

The new PostgreSQL schema will use the domain's names and normalized records as the source of truth for Events, Tournament Matches, Matches, Players, and their stable relationships. PostgreSQL `jsonb` will hold the ordered Rally event log and other genuinely variable payloads, not a competing full Match or Tournament record; the Qlik feed can continue deriving its rally summaries from that log. This allows joins and constraints on stable facts while preserving the flexible event sequence. Legacy names and payload shapes may remain at compatibility boundaries during migration.

## Consequences

- An Event and its Tournament are distinct records. A unique, required Tournament-to-Event foreign key prevents duplicates; application operations create and delete the pair transactionally so a bare Event is never exposed. Tournament roster, Rounds, scheduled Tournament Matches, scored Matches, and Team membership have relational keys. The scored Match alone owns live/final scores, winner, lifecycle state, and timing once play starts; a scheduled slot holds court, assigned Teams, and pre-play scheduling state. Historical standalone MTC Matches may lack an Event or scheduled slot; Visitor Matches belong to a verified Visitor account and never to an Event or Player.
- Better Auth owns credential and session tables; PaddlePointer owns account role/active state and the optional unique account-to-Player link. A typed Current Event foreign key and compare-and-clear Qlik reload token replace free-form settings.
- Stable scores, status, timing, ownership, and links live in columns. The Rally log is an ordered JSONB array; the server validates Rally shape and sequence. Legacy and Qlik payloads are projections, not competing stored records. Primary/foreign/unique/check constraints and bounded transactions protect the relationships; exact DDL and import validation are delivery work.
