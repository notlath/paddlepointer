# 08 — Turn Tournament into a progressive operations workspace

**What to build:** Super Admins configure Open Play, review the resulting estimate, and operate the schedule in a clear sequence instead of scanning one long page containing setup, QR access, statistics, estimates, and every round at once. Admins see an operations-focused version without disabled setup controls.

Origin: UI/UX audit finding U-10, limited to Tournament.

**Blocked by:** P0-06 — Make Tournament Setup validate as one accessible form

**Status:** completed

- [ ] Tournament configuration, format review, and schedule operation are presented as distinct sections or states
- [ ] Only one primary Generate or Update Schedule action is shown for the current configuration state
- [ ] Advanced format calculations can be expanded when needed without obscuring the primary workflow
- [ ] Completed and future rounds can be collapsed or filtered while the current and next rounds remain prominent
- [ ] Player-access QR and copy actions remain easy to find after schedule generation
- [ ] Regular Admins receive operational status and Match controls without focusable disabled configuration fields
- [ ] Existing completed and in-progress Matches remain protected during schedule updates
