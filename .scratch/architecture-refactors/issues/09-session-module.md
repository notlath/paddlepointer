# 09 — A Session module owns who is signed in

**What to build:** Signing in, reloading the page, switching portal through the URL, silent re-sign-in for Players and Visitors, and signing out all behave as they do today. But one Session module in the browser now owns that state: which portal the URL asks for, where the session is kept, re-sign-in and sign-out. The rest of the app only asks it who is signed in, and drawing a page never changes sign-in state.

Origin: architecture review candidate C9. Silent re-sign-in lives here, so coordinate with the separate auth security review.

**Blocked by:** 01 — Open Play scheduler lives in its own tested module (sets the browser module and test pattern)

**Status:** ready-for-agent

- [ ] Sign-in, reload, portal switching and sign-out behave the same in the browser
- [ ] Rendering a page never signs anyone out; a session that doesn't match the URL's portal is dealt with when the page loads or the portal changes
- [ ] Tests with fake storage and a fake URL cover: a session kept per portal, the old shared storage key moved to its portal, a mismatched portal clearing the session, silent re-sign-in for Players and Visitors, and sign-out
- [ ] Helper functions that only pass through to another helper are gone
