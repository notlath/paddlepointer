# 09 — Focused Scoreboard serving information

**What to build:** A scorer glancing at the Scoreboard mid-rally finds who is serving, from which court, and the score call immediately, each stated once. Today "Serving" appears three times (team badge, "(Serving)" tag beside the player, and a serving-team row), serve position appears in both the serve card and a meta row, and the current server appears in both the player line and a meta row, all above seven metadata rows.

Origin: UI polish audit finding M7.

**Blocked by:** None (can start immediately)

**Status:** completed

- [x] The serving team is marked once on its score tile, using a badge that works without color alone
- [x] In doubles, the current server is identified once, beside their name on the serving team tile
- [x] Serve position (right or left court) and its short explanation appear once, next to the court drawing
- [x] The score call remains the most prominent element of the court board
- [x] Remaining details that are not shown elsewhere (receiving team, server number in doubles, last Rally, side-outs) are kept in a compact, quieter list
- [x] Undo, End Match, and Reset keep their positions and behavior
- [x] Singles and doubles, Team A serving and Team B serving, the opening serve, and a Tournament Match all still show everything a scorer needs
- [x] Screen reader users still hear the serving team, server, and serve position
- [ ] Mobile Scoreboard keeps rally buttons within reach and does not grow taller than before (removing rows can only shorten it; not checked in a signed-in browser session)
- [x] Existing Scoreboard and rally engine tests remain green

Implementation notes:
- The "Serving" badge marks the serving Team. In doubles the current server carries a "Server" tag beside their name; singles relies on the badge alone.
- The serve position card no longer repeats the server's name. Its partner rule shows only in doubles.
- The details list keeps Receiving team, Server number (doubles only), Last rally, and Side-outs. Serving team, Current server, and Serve from rows were removed.
- The court drawing's Serving/Receiving labels and "Serve here" cue are unchanged; they are the diagram itself.
- A focused test renders the real tile and court board from app.js with stubbed rally-engine helpers. It replaced a test that checked a copy of the old template.
