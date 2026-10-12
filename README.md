# Riffify

The actual [Riff](https://github.com/rootscripts/riff) interface inside desktop Spotify through Spicetify. Spotify is the first-run provider. Spotify tracks play through Spotify's native player; external and local tracks use Riff's original audio engine.

## Status

This repository contains an installed development build, not a certified completion of the full master specification. The real Windows Spotify client opened the original Riff interface and loaded the user's liked songs and playlists. Automated checks and the headless UI contract pass. Native playback, Connect, full visual parity and performance still require live verification. Last.fm history needs the user's own locally configured API key. See [feature status](docs/FEATURE_PARITY.md) and [test report](docs/TEST_REPORT.md).

## Build and install

Requirements: Node.js 22.11 or newer, desktop Spotify, and Spicetify with exposed APIs. Node 22 needs the experimental SQLite flag; the supplied npm scripts include it. There are no application npm dependencies or install hooks.

```powershell
git clone https://github.com/zazu197/habe.git
cd habe
npm ci --ignore-scripts
npm run build
npm run check
npm test
npm run install:spotify
npm start
```

The companion runs at `127.0.0.1:38473` by default. Installation pairs the Custom App with a random local token, preserves the existing Spicetify applications and theme, and saves a rollback copy outside Git. Riffify covers Spotify's content area while its route is active. Choose **Settings → Interface → Show Spotify UI** to return to Spotify; reopen Riffify from the sidebar. Close the companion with Ctrl+C; it has no automatic startup registration.

For external playback and downloads, run `npm run setup:media` or install verified yt-dlp and FFmpeg yourself. The setup command checks published SHA-256 checksums for downloaded tools and records versions and hashes locally. Existing tools from PATH are recorded as user installations with unverified upstream origin. No executable or downloaded media belongs in Git.

## Last.fm and listening history

Open **Stats / Wrapped**, use the default username `zazafent`, enter your own [Last.fm API key](https://www.last.fm/api/account/create), and choose **Save and sync / resume**. This is a read-only API integration; no Last.fm password or scrobble submission is needed. The companion imports up to 200 timestamped records per page, saves the cursor, and supports pause/resume and incremental refresh.

Historical Last.fm scrobbles are counts, not measured listening minutes. Exact-name duration lookups add explicitly estimated historical time; unresolved records stay unknown. Recent listening time comes from observed intervals. Unmatched Last.fm records retain unknown provider attribution and are excluded from Spotify-only scope. Local JSON/CSV export, validated Riffify JSON history import, pause tracking and confirmed deletion are available in Stats.

## Scope and privacy

- `vendor/riff/` is the pinned upstream source and original assets. The build applies checked, reproducible hooks rather than rewriting the UI.
- `src/` contains the iframe integration and new Riff-styled panels.
- `spicetify/` contains the Custom App, route-specific chrome CSS, and Spotify adapter extension.
- `companion/` contains the authenticated gateway, SQLite ledger, Last.fm sync, and downloads.
- `scripts/`, `tests/`, and `docs/` contain installation, validation, and limitations.

Spotify session tokens stay in Spotify. The bridge sends metadata and constrained commands, not audio or credentials. Personal history, the Last.fm key, pairing token, media tools, and downloaded files stay outside the repository in local user data. Spotify downloads, stream decryption, and silent provider substitution are prohibited.

See [Windows installation](docs/INSTALL_WINDOWS.md), [uninstall](docs/UNINSTALL.md), [architecture](docs/ARCHITECTURE.md), [stats methodology](docs/STATS_METHODOLOGY.md), and [licensing](THIRD_PARTY_NOTICES.md).
