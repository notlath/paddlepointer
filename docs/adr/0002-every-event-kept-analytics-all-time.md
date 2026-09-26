---
status: accepted
---

# Every Event is kept as its own Tournament; analytics cover all Events

The Qlik dashboard analyses Players, Partnerships, Matches and courts across every Event, with Event as a filter. It replaces the single-Event dashboard from ADR 0001. PaddlePoint therefore keeps each Event as its own Tournament. A Super Admin starts a new Event, which becomes the Current Event, and past Events stay read-only in MySQL. The `/api/qlik/*` endpoints return all finished non-Visitor Matches, and Event is an optional filter.

## Considered Options

- **Qlik keeps history as snapshots.** Needs no PaddlePoint change, but past Events would exist only in Qlik, contradicting "MySQL is the only source of truth".
- **Drop multi-Event views.** Keeps the one-Event scope, but Player performance over time, Partnership analysis and per-Event comparisons would not be possible.

## Consequences

- Replaces two parts of ADR 0001: the one-Event scope, and the "no team table" consequence. Partnerships are ranked once they reach 3 Matches together, always showing Matches played.
- Players remain names, not accounts. Typos split a Player's history, so a data-quality check in Qlik and fixes at the source cover it. Skill level is out of scope until Players have real identity.
- Regenerate, reset and "clear results" apply only to the Current Event. A Super Admin may still correct a finished Match's Scores and winner in any Event, and may delete an Event that has no finished Matches, so history can be fixed but not wiped.
