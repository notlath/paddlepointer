-- PaddlePoint cPanel clean install / reset
-- Drops every app table, clearing all app data. Run it in phpMyAdmin, then open the app once:
-- the first request recreates the tables (api/schema.php) and seeds the Super Admin.
-- Keep schema_migrations last, so a request arriving mid-reset can't record a half-dropped schema as current.
-- If this database is shared with another app, first check that none of these tables belong to it
-- (players and app_settings are generic names).

DROP TABLE IF EXISTS user_sessions;
DROP TABLE IF EXISTS game_players;
DROP TABLE IF EXISTS games;
DROP TABLE IF EXISTS tournament_matches;
DROP TABLE IF EXISTS tournaments;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS players;
DROP TABLE IF EXISTS app_settings;
DROP TABLE IF EXISTS schema_migrations;
