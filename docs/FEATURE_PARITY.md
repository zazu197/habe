# Feature parity ledger

Code present, runtime observations and acceptance evidence are distinct. Preserving upstream code alone does not prove embedded behavior.

| Area | Implementation | Evidence and remaining work |
| --- | --- | --- |
| Shell/CSS/SVGs/backgrounds/liquid motion | Actual upstream DOM/CSS/logic reused | Actual Spotify observed; settings fixture SSIM 0.999; full native views/FPS pending |
| Provider selector | Spotify first/default; original three retained | Headless default verified; actual switching/audio overlap pending |
| Spotify library/albums/artists/playlists | Paginated albums/artists; native artist detail; create/add/remove | Real liked songs/playlists observed; artist fixture verified; account mutations not live-tested |
| Search/playback/transport | Genuine native URIs and controls, no YouTube substitution | Headless search/URI/toggle passes; native controls/niche results/Connect pending |
| Favorites/history/playlists/queue | Original Riff logic, account heart, separate mixed queue coordinator | Completion timing heuristic; skips/Connect/advancement need live proof |
| YouTube/YT Music/SoundCloud | Audited original router/audio graph | Public metadata returns 49 real formats; actual provider audio not verified |
| Local audio | Browser picker, safe library import/ranges | HTTP import/range tests pass; actual decoding/effects pending |
| Effects | Original external/local Web Audio graph | Spotify effects/crossfade disabled; external effects not live-tested |
| Lyrics/manual sync/translation/LRC | Spotify first, exact metadata LRCLIB, custom override/LRC picker, translation validation | Line/plain labels; generated word timing approximate; native seeking/offset/long-song checks pending |
| Themes/CSS | Original settings/editor, browser CSS import/list/enable/remove | Settings fixture matches; hosted fonts need network; Electron native dialogs unavailable |
| Downloads | Actual audio/video formats, playlist cap 100, subfolders/conversions/metadata, cancel/retry/open/folder/import | Validation/journal/cancellation tests pass; actual saving/muxing pending; playlist formats derive from first entry |
| Stats | Calendar/rolling/custom, measured/estimated time, ranks/context/activity/hours/streak/discovery/session metrics | Ledger tests pass; trends/artwork/richer heatmaps and large-history performance remain |
| Wrapped | Eight recap cards, PNG, original colors/motion preferences | Headless entry verified; richer story motion/artwork/native profiling remain |
| Last.fm | Read-only profile, 200/page, cursor/fixed bounds/overlap/pause/resume/rolling top APIs | Actual zazafent backfill blocked by missing user API key |
| Historical duration | Exact-name lookup, estimates separate from measured | Unit tests pass; unknown coverage retained; real enrichment not run |
| Privacy/recovery | Local data, pause/detach, JSON/CSV export, transactional JSON import, confirmed deletion, startup/pre-migration backups | Migration/import preservation tests pass; OS credential store/optional extended Spotify history absent |
| Native window/tray/updater/Discord/multiple instances | Controls disabled with explanations | Spotify owns window/media keys; detached Electron facilities unavailable |
| Security | Loopback/token/Host/Origin/allowlists, bounded paths/arguments/bodies/time, narrow media proxy | Automated checks/review; no comprehensive penetration test |
| Install/rollback | Preserve other apps/theme, current Apps/config backup, uninstall | Install/apply observed; user installation rollback not exercised |
| Publication | Source/tests/docs/notices/CI on zazu197/habe | Remote commit verified; no claim of CI success or release certification |

See STATUS.md for remaining work. This build does not yet meet every completion gate.
