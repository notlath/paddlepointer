# 10 — Complete the destructive confirmation migration

**What to build:** Deleting an account and clearing local History use the same accessible confirmation behavior as Match and Tournament actions. Once every destructive path has migrated, browser-native confirmation is removed from the application.

Origin: UI/UX audit finding U-12. This is the contract step of the confirmation migration.

**Blocked by:** 09 — Introduce one accessible destructive confirmation pattern; P1-07 — Separate People management from Match Operations

**Status:** completed

- [x] Delete Account identifies the account and clearly states that the account removal cannot be undone
- [x] Clear Local History distinguishes browser data from shared database records before confirmation
- [x] Safe cancellation changes no account, local History, or shared data
- [x] Confirming invokes each existing operation exactly once and communicates completion or failure
- [x] Focus returns to the invoking control or a meaningful surviving location after either decision
- [x] No destructive application action relies on a browser-native confirmation dialog
- [x] A search and test confirm that no native confirmation call remains in the browser application