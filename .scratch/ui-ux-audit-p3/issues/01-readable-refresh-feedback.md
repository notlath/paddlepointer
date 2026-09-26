# 01 — Make data refresh feedback readable

**What to build:** When shared data is refreshing or a refresh fails, the "Updating…" badge, the refresh error banner, and the session loading spinner are readable and on-brand wherever they appear. Today the updating badge is lime text on a light page (about 1.2:1 contrast), the error banner uses a light red intended for dark backgrounds (about 2.8:1), and the spinner falls back to an off-brand teal because it references a token that does not exist.

Origin: UI polish audit findings H1, H2, and M2.

**Blocked by:** None (can start immediately)

**Status:** completed

- [x] The updating badge text meets 4.5:1 contrast on every light surface it appears on (People, History, and any other refreshing list)
- [x] The refresh error banner text and Retry control meet 4.5:1 contrast and match the existing form failure styling family
- [x] The session loading spinner uses brand navy and lime on light pages and a readable light treatment in the dark sign-in shell, with no teal or undefined token references
- [x] The updating badge still pulses gently and stops pulsing under reduced motion; the refreshing state stays understandable without the animation
- [x] Feedback colors resolve through semantic tokens rather than new raw color literals
- [x] Refresh, retry, and loading behavior is unchanged
- [x] A focused visual check covers updating, failed refresh, and session loading on a light page and in the dark sign-in shell
