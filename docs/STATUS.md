# Development status

Source is published to https://github.com/zazu197/habe. This installed development checkpoint does not yet meet every master-specification completion gate.

Implemented: pinned authentic Riff UI/assets, Spotify-first search/player/library, paginated album/artist navigation, private playlist create/add/remove, authenticated companion, provider coordination, local audio and LRC import, browser CSS themes, SQLite interval/event ledger, Last.fm reconciliation/resumable sync/duration estimates, calendar stats/ranks/activity/streaks/discovery/contexts, recap/PNG, JSON/CSV export, transactional JSON history import, download formats/jobs/playlist/subfolder/conversion/open/import, installation and rollback scripts.

Observed: actual Windows Spotify displayed original Riff with real liked songs and playlists; Spicetify apply succeeded. Automated checks: 22 tests pass; 21 JavaScript files parse; headless UI contract passes. Earlier settings SSIM was 0.999; the requested Spotify-interface row shifts content and yields 0.857 in the current unaligned crop. See TEST_REPORT.md.

Blocked: user's own Last.fm API key is not configured, so actual zazafent validation/backfill is unavailable. Native UI interaction stopped when the user pressed Escape; no further Computer Use was performed. Actual media saving needs a user-supplied source with rights and source permission.

Remaining acceptance: native playback/transport/Connect, external playback/mixed queue transitions, actual media saving/muxing/cancel/retry, native lyrics timing, ten-minute tracking proof, uninstall/rollback, full-view visual comparisons, narrow-screen checks and native FPS profiling. Queue completion uses a timing heuristic and needs particular attention under Connect, skips and delayed events.

Remaining implementation: richer artwork/trend/heatmap presentation, full liquid-motion recap refinement, large-history/list performance work, broader Lyrics Plus fallback coverage and exhaustive original-control adaptation. OS credential storage, arbitrary native destination selection and optional extended Spotify history are absent; browser import/private subfolders are supported alternatives. Genre stays unknown without trustworthy metadata. These gaps must not be labeled fully finished or proven platform impossibilities.
