# Test report

Date: 2026-10-12. Windows x64; Node 22.11.0; Spotify 1.3.4.258.gc60b10b0946a; Spicetify 2.45.0.

## Passed

- Build hooks adapt pinned original Riff UI/router; 21 JavaScript files parse.
- npm test: 22 tests, zero failures. Native bridge startup/URI/origin guards, delayed queue completion, current playlist endpoints, real HTTP auth/origin/routes/config atomicity, uploads/ranges, download validation/journal/cancel races, ledger pause/seek/dedup/qualification, MBID corrections, estimates, hour/midnight/DST/ISO boundaries, Last.fm cursor resume, schema backup preservation and transactional history import.
- npm ci --ignore-scripts: zero application dependencies and reported vulnerabilities.
- Actual Windows spicetify backup apply and later apply completed. Current Apps/config rollback copies remain outside Git.
- Actual Spotify displayed original Riff and real account liked songs/playlists.
- Headless Edge fixture: authentic generated UI boot, Spotify first, original carousel, library, search, native URI command, artist detail without YouTube substitution, toggle, Stats and settings.
- Earlier settings baseline at cdc87cf reached SSIM approximately 0.999. The current settings fixture is 0.857 after the requested Spotify-interface setting shifts existing rows. This crop includes that intentional difference and no longer passes the 0.98 target. See screenshots/visual-comparison.json, reference/settings PNGs, overlay and difference. Gaussian window 11, sigma 1.5; crop (112,104,1548,958). Excludes native chrome/provider/new sidebar/player/right lyrics. Neither result establishes complete native parity.
- Follow-up UI regression checks verify play-button containment and visible SoundCloud bounds at 1920/1600/1280/1024/800/600 pixels, collapsed history tools, populated/empty Wrapped, recap navigation, PNG download and Settings → Interface → Show Spotify UI dispatching native navigation. All account/history data in these checks is synthetic and confined to temporary test storage.
- Actual public YouTube metadata enumeration returned 49 available formats (37 video, 12 audio). No media downloaded.

## Not established

The user stopped Computer Use with Escape. No further native UI interaction occurred. Actual play/pause/seek/queue/Connect, ten-minute listening, full native visual parity, narrow screens, FPS and user-installation rollback are unverified.

The Last.fm key remains unconfigured. Actual zazafent validation/backfill/totals/metadata/rate behavior and real provenance matching were not run. Actual media saving requires a user-supplied authorized source. Production contains no fixture API or account data.

Headless tests use a disposable Edge profile, simulated Spotify only in the harness, and explicit local-network permission for the fixture origin. Initial bundled-browser/local-network failures were resolved; fixture success does not certify native integration. Richer stats visuals and lyrics/provider workflows remain incomplete. No remote CI/release success is claimed.

## Reproduce

Run npm ci --ignore-scripts, npm run build, npm run check and npm test.

Optional UI: install Playwright in a separate test environment; set RIFFIFY_PLAYWRIGHT_MODULE to its index.mjs, optionally RIFFIFY_BROWSER_CHANNEL=msedge, then run node --experimental-sqlite scripts/ui-smoke.mjs. Run python scripts/compare-visuals.py with Pillow/NumPy for the fixture comparison. Screenshots contain labeled fixture data only.

Native gates: play actual Spotify URI, transport/seek/volume/repeat/shuffle/queue, niche search, account changes, Connect, all external providers without overlap, local audio/effects, lyrics/offsets, Last.fm full history/resume, permitted audio/video download/mux/cancel/retry, reduced motion, full visual comparisons/performance and rollback.
