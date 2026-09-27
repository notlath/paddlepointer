# 08: Correct Tournament Match operations

**What to build:** As an authorized staff member, I want to correct, reset, or remove Tournament Match results safely, so that operational mistakes can be fixed without leaving inconsistent Match or Schedule state.

**Blocked by:** 07 Prototype and deliver the Scoreboard Match flow.

**Status:** implemented

- [x] Authorized staff can perform the correction, reset, and removal operations supported by the current system.
- [x] Each operation preserves consistency between the Tournament Match, saved Match, Rally history, and derived results.
- [x] Destructive operations require clear, explicit confirmation and report their result.
- [x] Past Event protections and role permissions are enforced by server code.
- [x] Browser journeys cover successful changes, invalid state, confirmation behavior, and denied access.
