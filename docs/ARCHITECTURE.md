# Architecture

The pinned Riff HTML, CSS, audio engine, assets, and application logic live in `vendor/riff`. `scripts/build.mjs` checks every modified hook and produces `dist/ui`. Original DOM IDs, classes, layout, and animation code remain the baseline. The CSS stays isolated in a companion-served iframe instead of leaking Riff's `html`, `body`, and `:root` rules into Spotify.

Spicetify loads `spicetify/index.js` as a Custom App. Its React component only mounts the original document in an iframe; it does not rebuild Riff components. `style.css` covers the client content area and restores Spotify chrome when the app unmounts. Native Spotify window controls remain outside the iframe.

The extension owns Spotify's authenticated APIs. It validates iframe origin, message source, method, URI, and numeric inputs. Spotify search, library, playlists, liking, playback, volume, repeat, shuffle, progress, and lyrics stay on that side of the boundary. No Spotify token crosses to the companion. Undocumented endpoint use is isolated in `bridge.js` and must be reverified after Spotify changes.

Riff's original queue and provider-qualified track state remain in the application closure. The integration exposes the smallest hooks needed for Spotify and new panels. External activation waits for Spotify to pause; stale switching requests are rejected. Spotify audio is never passed into Web Audio. Audio effects are disabled for native Spotify playback.

The companion binds loopback and requires a random 256-bit pairing token. It checks Host and Origin, enforces an operation allowlist, validates media URLs and paths, limits requests, and uses argument arrays for subprocesses. The original backend router is imported without listening on its own socket. Automatic binary installation/update, original unchecked downloads, unrestricted prefetch, and arbitrary audio proxy targets are excluded. Audio proxy DNS resolution is pinned to validated public addresses and credentials are stripped.

The ledger uses SQLite WAL, indexed sessions, listening intervals, Last.fm scrobbles, and sync state. A monotonic clock and progress deltas qualify measured intervals. Last.fm pages use a fixed upper time bound and a persisted cursor. Imported records remain local. Statistics use indexed period reads; live rendering does not recompute history every frame. Very large all-time datasets still require further performance profiling and database aggregation optimization.
