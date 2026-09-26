# 01 — A completed Match keeps its Game link

**What to build:** Once a Tournament Match is completed, it stays linked to the Game that completed it. No completion update can clear or replace that Game link, whatever its intent. Today only a "complete-match" update without a Game id is refused, so other completion updates can wipe the link. The Event's results and rally stats would then quietly undercount.

Origin: Qlik Event dashboard grilling (Q39), and the known gap left from ticket 04 of the architecture refactors. "Take Over Scoring" (commit 9576438) now sends an `in_progress` update with no Game id whenever a stalled Match is taken over, which runs through the same handler's sibling branch — a real, everyday path onto this bug, not just a theoretical one.

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] A test first reproduces a completion update with no Game id, sent with an intent other than "complete-match", clearing a completed Match's Game link
- [ ] Any completion update without a Game id on a Match that already has one is refused as a conflict, and the stored link is unchanged
- [ ] A completion update from the owning Game still succeeds
- [ ] A test covers taking over a stalled `in_progress` Match (no Game id in the request): the stored Game link, whatever it was, is unchanged by the take-over
- [ ] All existing Tournament Match tests still pass
