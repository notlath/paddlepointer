# 16: Rehearse full migration and verify Qlik parity

**What to build:** As an operator, I want to rehearse a complete legacy data migration and compare its behavior with the current system, so that production cutover is gated on evidence that records and analytics remain correct.

**Blocked by:** 12 Restore Player account summaries; 13 Keep Qlik analytics working after PHP retirement; 14 Import Events, Schedules, and Players; 15 Import Matches, Rally logs, and Visitor history.

**Status:** implemented; fixture rehearsal passed on disposable Neon PostgreSQL with one documented Current Event review item; no populated legacy MySQL source exists

- [x] A repeatable rehearsal imports representative full-dataset data and produces a reviewable reconciliation report.
- [x] Reconciliation covers source and target counts, required references, scores, ordered Rally logs, Player identity links, account relationships, and Visitor isolation.
- [x] Representative Qlik feed outputs from the imported data match the established analytics contract and expected derived summaries.
- [x] The rehearsal surfaces unresolved differences as explicit failures or review items and does not modify production data.
- [x] An operator can repeat the rehearsal and compare results before the final production sync.
