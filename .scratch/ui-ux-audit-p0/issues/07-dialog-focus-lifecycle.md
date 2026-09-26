# 07 — Give dialogs a complete keyboard focus lifecycle

**What to build:** Match Recovery and the expanded Live Score overlay behave as modal dialogs: focus enters them, remains inside while open, and returns to the invoking control or a sensible fallback after they close.

Origin: UI/UX audit finding U-04, limited to modal interactions.

**Blocked by:** None (can start immediately)

**Status:** complete

- [x] Opening a dialog moves focus to its heading or safest primary action
- [x] Tab and Shift+Tab remain within the active dialog
- [x] The page behind an open dialog is unavailable to keyboard and assistive-technology interaction
- [x] Escape closes the Live Score overlay and returns focus to the control that opened it
- [x] Match Recovery requires an explicit Continue or Reset decision and initially focuses the safer Continue action
- [x] Closing or resolving either dialog restores focus to a meaningful location
- [x] Dialog titles, descriptions, and destructive consequences are announced correctly
