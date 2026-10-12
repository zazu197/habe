# Test report

Date: 2026-10-12. Platform: Windows x64, Node.js 22.11.0, Spotify 1.3.4.258.gc60b10b0946a, Spicetify 2.45.0.

## Passed

- Build: checked hooks adapt the pinned original Riff UI and router.
- JavaScript parsing: source and generated files pass `npm run check`.
- `npm test`: 11 tests pass, zero failures. Coverage includes active listening, pause/seek/duplicate events, qualification, Last.fm overlaps/repeats/edition distinctions, local-scrobble matching, DST/ISO/calendar boundaries, midnight clipping, page resume, media URL validation, safe paths/tokens, real HTTP authentication/origin/allowlists, local upload and byte ranges, download validation, tool failure, and journal restoration.
- `npm ci --ignore-scripts`: zero application dependencies, zero reported vulnerabilities.
- Actual Windows `spicetify backup apply` and subsequent `spicetify apply` completed. Current Spotify Apps/config backup remains outside Git.
- Actual Spotify displayed the original Riff interface and populated real Spotify liked songs and playlist names.

## Not established

Computer Use was stopped by the user with Escape. No further native UI interaction was performed. Real play/pause/seek/queue/Connect checks, 10-minute measured listening acceptance, before/after native screenshots, 0.98 SSIM, and 60 FPS are not certified.

The headless fixture test is separately labeled and uses simulated Spotify data only in its test harness. The initial attempt failed because the bundled Chromium browser was absent; a subsequent existing Edge run is under investigation. A fixture pass would not prove native Spotify integration.

The Last.fm API key was not configured, so actual zazafent validation/backfill, historical totals, rate-limit behavior, and real provenance matching remain unverified. No real source media was downloaded without a user-supplied authorized source.

## Reproduce

```powershell
npm ci --ignore-scripts
npm run build
npm run check
npm test
```

Optional headless UI contract: install Playwright in a test environment, point `RIFFIFY_PLAYWRIGHT_MODULE` to its `index.mjs`, optionally set `RIFFIFY_BROWSER_CHANNEL=msedge` for an existing Edge installation, and run `node --experimental-sqlite scripts/ui-smoke.mjs`. Generated fixture screenshots are explicitly labeled. Use fresh profiles and equivalent DPI/font/window/theme data for actual visual comparisons.

Native manual gates: search an obscure Spotify title, play its real URI, verify pause/seek/volume/repeat/shuffle, open real library/playlists, test Connect changes, switch to each external provider without overlap, import local audio, validate Spotify-first lyrics and custom offsets, configure Last.fm and resume full pagination, test an explicitly permitted audio/video download and cancel/retry, verify reduced motion, then exercise uninstall/rollback.
