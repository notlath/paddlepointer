# Ticket 01 — Open Play scheduler module

## Before

The Open Play scheduling algorithm lived inside `app.js`, used `Math.random` directly, and could not be tested in Node without loading the browser application.

## After

The scheduler lives in `open-play-scheduler.js`. The browser and Node tests load the same public `buildOpenPlayMatches` function, whose optional random source makes schedules deterministic in tests. Schedule generation and regeneration preserve locked matches while enforcing player targets and round/court constraints.

## Verification

Run `node --test`. The scheduler tests cover player game targets, unique players per round, court limits, and unchanged completed/in-progress matches.
