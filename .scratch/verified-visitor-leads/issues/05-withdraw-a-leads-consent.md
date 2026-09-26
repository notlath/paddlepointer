# 05 — Super Admin withdraws a Lead's consent on request

**What to build:** When someone asks MTC to stop contacting them, the Data Privacy Act gives them that right. The Super Admin enters the Lead's email and withdraws their consent. The system records when consent was withdrawn, and the person drops out of the Leads export. Their Visitor account and Matches stay. If they tick the checkbox again at a later sign-in, they give new consent and become a Lead again. Every withdrawal is logged with who did it and when.

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] Withdrawing a Lead's email removes it from the next export and from the Lead count
- [ ] An email that is not a Lead gets a clear "not a Lead" message; nothing changes
- [ ] The withdrawal time and the Super Admin who did it are recorded
- [ ] Only a Super Admin can withdraw
- [ ] Ticking consent again at a later sign-in makes them a Lead again
