---
status: accepted
---

# Players are their own records, separate from accounts, with unique names

Renames and typos split a Player's history, and nothing connected the same person across Events. Players therefore become their own records with a lasting identity. They are not `users` rows. A Player needs no account, so walk-ins can be rostered without a login, and an account links to at most one Player. Player names stay unique, trimmed and compared regardless of case. A roster name that matches an existing Player reuses that Player. Renaming a Player to another Player's name is refused, and staff Merge the two instead. Every view, including the analytics copy, shows a Player's current name.

## Considered Options

- **Player = account with the `player` role.** One identity table, but every walk-in would need a login before they could play.
- **Better name normalisation only.** Cheap, but a rename would still break history and the account link.
- **IDs with non-unique names.** Would allow two people with the same name, but typed roster entry would need a picker, and the Qlik load script would have to key on an id. Name collisions weren't a real problem.

## Consequences

- Replaces the "Players remain names, not accounts" consequence of ADR 0002.
- Existing Matches are backfilled with one Player per distinct name. Existing Player accounts are linked by matching `display_name` or `username`. Admins Merge the leftover duplicates. Merge cannot be undone and is refused when both Players have linked accounts.
- Because names stay unique and endpoints send the current name, the Qlik load script keeps keying on name. Renames and Merges appear after the next reload.
- Names in Visitor Matches do not become Players.
- With identity in place, staff-set Skill levels can balance Open Play Teams.
