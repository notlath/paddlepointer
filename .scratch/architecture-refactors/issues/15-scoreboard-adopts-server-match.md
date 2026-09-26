# 15 — The scoreboard shows the Match the server returns

**What to build:** When staff start, score, complete or reset a tournament Match, the browser shows the Match the server returns. Today it changes the Match itself first and corrects it afterwards. A start the server refuses leaves the Tournament on screen unchanged and shows why.

Origin: architecture review candidate C2.

**Blocked by:** 14 — One Match lifecycle module decides every Match change; 01 — Open Play scheduler lives in its own tested module (sets the browser module and test pattern)

**Status:** ready-for-agent

- [ ] Starting, scoring, completing and resetting a tournament Match work as before from staff scoreboards
- [ ] The browser no longer rewrites a Match's status, scores or lock before the server answers
- [ ] A refused start (for example, a Match already ongoing on another scoreboard) leaves the Tournament on screen unchanged and shows the server's reason
- [ ] A failed score sync keeps the Game scoring locally, as it does today
- [ ] Tests cover applying the server's answer for each kind of update, including a refusal
