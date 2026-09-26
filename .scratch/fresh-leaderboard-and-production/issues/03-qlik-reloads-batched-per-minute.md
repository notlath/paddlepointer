# 03 — Qlik reloads are batched to one a minute

**What to build:** Today every successful write (save Match, complete Match, correct Match, delete Event, reset, start Event) calls the Qlik reload trigger inside the request, so a burst of Match completions queues many reloads. Instead, a write only records that a reload is pending. A command-line entry point, run every minute by a cPanel cron job in production, fires the existing Qlik reload trigger once if a reload is pending and clears the mark. Eight Matches finishing in the same minute cost one reload, saving a Match no longer waits on an outgoing HTTP call, and Analytics is at most about a minute behind during an Event. The 15-minute scheduled reload automation stays as the backstop.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Every write that triggers a reload today marks a reload as pending instead and makes no outgoing call
- [ ] Failed writes (non-2xx) do not mark a reload
- [ ] Running the command with a reload pending fires the trigger once and clears the mark; with none pending it does nothing
- [ ] A write that lands while the command is firing is not lost: it stays pending for the next run
- [ ] If the trigger call fails, the reload stays pending so the next run retries
- [ ] The command runs from the CLI with no web request, and its one-line cPanel cron entry is written into the deploy notes for ticket 08
- [ ] Locally, running the command by hand against the dev tenant produces a reload (verify via the app's last reload time)
