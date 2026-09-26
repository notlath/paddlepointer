# 02 — The server refuses Match results that break the scoring rules

**What to build:** The server checks every completed Tournament Match and saved Match against the Score and the Match's win rule. It refuses to save a result if:
- the winner contradicts the Score (for example "winner A" at 3-11);
- a Match that was not ended early misses the target score or the win-by-2 rule;
- no winner is given.

Today the server accepts any winner it is sent. The browser also stops turning a missing winner into Team A when it builds a completion update.

Origin: pickleball rules review (finding R10 and the Match lifecycle winner check).

**Blocked by:** 01 — A Match ended early records who retired or forfeited (a retirement is the one allowed case where the winner may have fewer points)

**Status:** complete

- [x] Completing with a winner that has fewer points is refused, unless the Match ended by the other Team retiring
- [x] Completing below the target score, or without a 2-point lead when win-by-2 is on, is refused unless the Match ended early
- [x] Completing with no winner is refused; the browser never fills in Team A
- [x] Correcting a finished Match (Super Admin correction) runs the same checks
- [x] Each refusal returns a readable reason, shown to the scorer
- [x] PHP tests cover each refused case and each valid case
