# 10 — Toast enter and exit motion

**What to build:** Toast messages such as "Match saved" arrive and leave smoothly instead of popping in and vanishing. Today toasts appear and disappear instantly.

Origin: UI polish audit finding M8.

**Blocked by:** None (can start immediately)

**Status:** completed

- [x] A toast enters by fading in and rising a small fixed distance (about 8–12px), within the shared motion scale
- [x] A toast exits with a shorter and softer fade and a small movement, not a full slide
- [x] Only opacity and transform are animated
- [x] A new toast arriving while one is leaving does not jump, stack incorrectly, or restart visibly
- [x] Under reduced motion, toasts show and hide instantly and remain fully readable
- [x] The live region still announces each message exactly once
- [x] Toast timing (how long a message stays) is unchanged
- [x] Existing toast tests remain green, and a test covers the reduced-motion path if the behavior is script-driven
