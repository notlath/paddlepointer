# 27 — The browser hides UI based on what the session allows

**What to build:** The browser decides which views, buttons and match controls to show from the allowed actions in the session response, instead of from its own role lists. The server stays the source of truth: hiding UI is a convenience, not the protection.

Origin: architecture review candidate C6.

**Blocked by:** 26 — An Access policy module on the server; 09 — A Session module owns who is signed in

**Status:** ready-for-agent

- [ ] Each role sees the same views, navigation and match controls as today
- [ ] The browser no longer keeps its own lists of which roles may use which views or actions
- [ ] Tests using 09's fake session cover each role's visible views and controls
- [ ] An action the server refuses still shows the server's message
