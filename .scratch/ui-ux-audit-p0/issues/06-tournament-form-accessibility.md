# 06 — Make Tournament Setup validate as one accessible form

**What to build:** A Super Admin can configure and generate Open Play from the keyboard, understand numeric and player-list errors in context, and receive clear pending or failure feedback without losing the entered setup.

Origin: UI/UX audit findings U-03 and U-04, limited to Tournament Setup.

**Blocked by:** None (can start immediately)

**Status:** completed

- [x] Tournament configuration submits through a predictable form action
- [x] Court, match-target, score, transition-time, and minimum-player constraints are explained and validated beside their fields
- [x] The first invalid field receives focus and every invalid field exposes its error state to assistive technology
- [x] Win-by-two exposes its checked state and remains keyboard operable
- [x] Generating or updating a schedule exposes a pending state and prevents duplicate generation requests
- [x] A failed generation or save preserves the entered configuration and provides an announced retryable error
- [x] Successful generation still produces the existing schedule and format estimate
