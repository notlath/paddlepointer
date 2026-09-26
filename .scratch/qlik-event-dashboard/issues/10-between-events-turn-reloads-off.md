# 10 — Between Events: turn reloads off

**What to build:** The dashboard now lives across every Event (ADR 0002), so nothing is torn down after a single Event the way ADR 0001 first assumed. Between Events, only the reload schedule pauses; the analytics key, the REST connection and the Event dashboard app all stay in place so the next Event's data keeps landing in the same history. This is a checklist a person carries out; there is no code to write.

Supersedes the original "Teardown after the Event" ticket: the key is no longer removed and the app is no longer archived after every Event.

**Blocked by:** 09 — Reloads during Event hours

**Status:** ready-for-human

- [ ] After an Event ends, the reload automation's schedule is switched off (or its end time already stops it)
- [ ] The analytics key, REST connection and Event dashboard app are left in place
- [ ] Before the next Event, ticket 17's "start a new Event" action is used, and the reload automation is re-enabled with that Event's hours
- [ ] If embedding went ahead (ticket 11): the impersonation OAuth client and shared Event viewer user are left in place between Events, and are only removed if the embed is discontinued for good
