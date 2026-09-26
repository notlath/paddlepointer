# Ticket 02 — Fast Open Play generation

## Before

The scheduler generated every possible four-player group and rescored the full list for every match. On this machine, 32 players took about 2.7 seconds and 48 players took about 22.9 seconds.

## After

The scheduler builds balanced player cycles and sorts only the active player list. On this machine, the checked schedules took about 3 ms for 48 players and 9 ms for 100 players. Player targets, round and court limits, locked matches, and the no-repeat partner baseline for 16 and 32 players are preserved.

## Verification

Run `node --test`. The scheduler tests include the ticket's 48-player and 100-player performance limits and partner-variety checks.
