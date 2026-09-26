# 24 — An unchanged Tournament gets a tiny reply

**What to build:** A Live poll tells the server when it last saw the Tournament change. If nothing has changed since, the server sends a tiny "unchanged" reply and the Live board isn't rebuilt.

Origin: architecture review candidate C5.

**Blocked by:** 23 — A Shared store module for the Tournament; 05 — Saving, reading and resetting a Tournament go through handlers

**Status:** done

- [x] A poll for a Tournament that hasn't changed gets a small reply with no Tournament in it
- [x] The Live board isn't rebuilt when the reply says unchanged
- [x] Any change (score update, schedule save, reset) makes the next poll return the full Tournament, even when two changes land within the same second
- [x] Handler tests cover both the unchanged and the changed case
