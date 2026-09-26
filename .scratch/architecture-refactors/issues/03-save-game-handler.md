# 03 — Saving a Game goes through a handler tests can call

**What to build:** Saving a Game from a scoreboard behaves exactly as it does today over HTTP. Behind that, the endpoint's work (checking the scorer's role, deciding the Game's match scope, writing the row) becomes a function. It receives the database connection, the signed-in user and the request data, and returns a status and payload. The endpoint script only reads the request, calls that function and sends the result. This is the tracer bullet for turning every endpoint into a handler (04–08).

Origin: architecture review candidate C8. Assumes the schema migration work (C1) is committed first, since these tests reuse its test database setup.

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] Saving a Game over HTTP returns the same responses as before
- [ ] Tests call the handler directly, with no web server running
- [ ] Test: a Visitor's Game is saved with visitor scope, even if the request says otherwise
- [ ] Test: a Game linked to a tournament Match is saved with tournament scope, and a staff Game claiming visitor scope is saved as standard
- [ ] Test: a Player gets 403, and a request missing either team gets 400
- [ ] The schema tests save their sample Game through the handler instead of a copied SQL statement
