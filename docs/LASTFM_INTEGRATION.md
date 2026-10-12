# Last.fm integration

The configured username is `zazafent`: https://www.last.fm/user/zazafent. The username remains editable for other users. The API adapter uses the official `https://ws.audioscrobbler.com/2.0/` JSON endpoint. Public profile/history access requires your own API key but no account password or Last.fm session.

Create a key at https://www.last.fm/api/account/create, then enter it in Stats / Wrapped. The server stores it in local private configuration; neither the key nor a Spotify token is returned by the configuration API. Avoid putting it in chat, `.env`, source, or screenshots. OS credential-store integration is not implemented; Windows user-profile permissions protect the local file.

Save and sync validates `user.getInfo` and confirms the returned username. `user.getRecentTracks` uses `limit=200`, official page counts, a fixed `to` timestamp, and a persisted backfill page. Now-playing rows are excluded. Completed backfill records coverage and a high-water mark; later pulls overlap one day to capture late records and deduplicate them. Retries use bounded exponential delay with jitter and a 15-second request timeout. Rate limits and transient errors keep the saved cursor.

Pause sync aborts current work; resume continues the saved cursor. Automatic incremental refresh runs every ten minutes while the companion runs and a key is configured. Detach clears the key and leaves imported history; local deletion requires explicit confirmation and paused synchronization. The sync UI shows retrieved count, expected total, page counts, errors, coverage, and the last completed sync time.

The adapter also exposes official top Artists/Tracks/Albums API calls for `overall`, `7day`, `1month`, `3month`, `6month`, and `12month`. These rolling periods are not calendar Today/This Week. Calendar charts use imported timestamped scrobbles. Weekly chart aids were not substituted for exact range calculations and are not implemented in this build.

The user had not configured a key during development. Actual `zazafent` profile totals, registration date, historical coverage, API rate behavior, and the full backfill were not verified. No personal listening history was committed. The application never submits scrobbles automatically.
