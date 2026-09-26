# 11 — The Live board shows every Court

**What to build:** On a Tournament with more than four Courts, the Live board shows a slot for every Court, so a Match in progress on Court 5 or higher finally appears. Today the board is fixed at four cards, although a Tournament allows up to 16 Courts. Decided: the grid grows to fit every Court. It doesn't page or rotate.

Origin: architecture review candidate C10.

**Blocked by:** 10 — A Live board module builds the court cards

**Status:** ready-for-agent

- [ ] A Tournament with 6 Courts shows 6 Court cards on the Ongoing tab, including a Match in progress on Court 6
- [ ] A Tournament with 16 Courts shows all 16 cards, readable on a TV-sized screen
- [ ] The Next tab offers as many upcoming slots as the Tournament has Courts, never fewer than four
- [ ] Tournaments with four or fewer Courts keep today's four-card layout
- [ ] A Live board module test covers a Tournament with more than four Courts
