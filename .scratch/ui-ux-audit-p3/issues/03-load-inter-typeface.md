# 03 — Load Inter as the application typeface

**What to build:** PaddlePoint actually renders in Inter on every device used at events. Today the stylesheet names Inter but never loads it, so Windows shows Segoe UI, iOS shows SF, and Android shows Roboto, and weights like 850 and 950 fall back to whatever that font has.

Decision (user): use Inter from Google Fonts as the variable family, covering optical sizes 14–32, weights 100–900, and italics, with `display=swap`. The logo wordmark uses ExtraBold 800, so 800 is the brand display weight.

Origin: UI polish audit finding H4.

**Blocked by:** None (can start immediately)

**Status:** completed

- [x] Inter loads once for the whole app (sign-in and authenticated views) with swap display, so text is never invisible while the font loads
- [x] The font request is issued early enough that the first render does not visibly jump in width or line breaks on sign-in, Dashboard, or Scoreboard
- [x] Inter's optical sizing is enabled so large score digits and small labels both use appropriate optical sizes
- [x] If Google Fonts is unreachable (offline venue Wi-Fi), the app remains fully usable with the existing system font fallback stack
- [x] Computed font family and weight for headings, body, buttons, and score digits show Inter on Windows and a mobile emulation
- [x] The service's cache-busting version for the stylesheet is updated so venues pick up the change
- [x] No other visual change is introduced in this ticket (weight and scale cleanup belongs to ticket 04)
