# 07 — Clarify hierarchy on records and reference views

**What to build:** History, Leaderboard, Rules, Player results, and Visitor results become easier to scan by using strong section grouping and fewer equal-weight cards. Records remain dense enough for comparison while supporting text stays visually quiet.

Origin: UI/UX audit finding DS-05, limited to records and reference views.

**Blocked by:** P1-09 — Make Leaderboards readable without hidden horizontal content; P1-10 — Make History rows clearly actionable; 01 — Expand the stylesheet with semantic UI tokens

**Status:** completed

- [x] History separates Match identity, outcome, metadata, and View Summary action without wrapping every value in a separate surface
- [x] Leaderboard emphasizes rank, identity, and primary record before secondary statistics
- [x] Rules content is grouped by real rule topic rather than a repeated generic-card rhythm
- [x] Player and Visitor result sections use the same record hierarchy and spacing language
- [x] Ordinary content groups use spacing or restrained dividers while elevated cards remain exceptional
- [x] Empty, loading, and error states keep the same hierarchy as populated content
- [x] Mobile and desktop layouts preserve a logical reading and keyboard order
