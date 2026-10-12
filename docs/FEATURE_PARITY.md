# Feature parity ledger

Status distinguishes code present, runtime observations, and missing acceptance work. Original source is preserved, but preservation alone is not proof of a working embedded feature.

| Area | Current status | Verification / remaining work |
| --- | --- | --- |
| Original shell, CSS, SVGs, backgrounds, liquid motion | Original document and styling reused | Actual Spotify display observed; matched screenshots/SSIM and FPS not measured |
| Provider pills | Spotify added first/default; original three retained | Build hooks checked; native provider switching needs testing |
| Spotify library and playlist navigation | Real Library/Rootlist/Playlist adapters | Real liked songs and playlist names observed; album/followed-artist views and editing are incomplete |
| Spotify search and playback | Native URI and API bridge, no YouTube matching | Headless contract pending; real playback and obscure search not verified |
| Transport, seek, volume, repeat, shuffle | Spotify routes and native progress adapter | Version-sensitive APIs; live controls and Connect not verified |
| Riff favorites/history/playlists/queue | Original logic retained, Spotify heart routed to account | Automatic mixed-source queue advancement and account playlist editing need implementation/verification |
| YouTube / YouTube Music / SoundCloud | Audited original backend routes and audio engine retained | Tools available; live provider playback/search not tested |
| Local files | Browser import, safe library file serving | HTTP import/add/range tests pass; actual audio decoding/effects need live testing |
| External audio effects | Original Riff Web Audio graph retained | Native Spotify effects disabled; external effects not live-tested |
| Lyrics | Spotify internal endpoint first, Riff custom/LRCLIB fallback | URI/failure boundaries implemented; actual provider response/offset/long-song tests pending |
| Manual lyric sync / translation | Original UI retained; translation input validated | Embedded behavior not exhaustively tested; LRC file import needs further adaptation |
| Themes and CSS overrides | Original palette/settings/CSS editor retained | Electron native theme import unavailable; hosted fonts depend on network |
| Downloads | Audio/video formats, safe queued jobs, journal, progress/cancel/retry | Real source downloads unverified; playlist UI, destination picker, native folder actions, library import incomplete |
| Stats filters and ranks | Calendar/rolling/custom periods, measured time, counts, artist/track/album/source ranks, activity chart | Unit tests cover interval accounting, DST, midnight and dedup; full history performance pending |
| Riff Wrapped | Recap cards, PNG export, reduced-motion CSS | Fixture UI pending; visual refinement and live animation profiling pending |
| Last.fm history | Read-only profile, 200-row pagination, fixed bounds, cursor, incremental overlap, top API calls | Requires user's local API key; actual zazafent backfill not run |
| Historical minutes | Unknown duration coverage explicitly labeled | Reliable duration enrichment/estimated totals incomplete |
| Advanced stats | No invented values | Streaks, comparisons, discovery, genre, context ranks, milestones and longest-session metrics incomplete |
| Privacy controls | Local storage, pause tracking, detach key, JSON/CSV export, confirmed deletion | HTTP/ledger tests pass; OS credential store and DB backup rotation incomplete |
| Native windows/tray/updater/multi-instance/Discord | Electron features unavailable in embedded page | Disabled or documented; native Spotify owns window/device/media keys |
| Security | Loopback, token, Host/Origin, route allowlist, paths, bounded bodies, safe process args, narrow media proxy | Automated tests and review; complete penetration testing not performed |
| Install/rollback | Managed app install, config/current Apps backup, uninstall preserving others | Windows install/apply observed; rollback not exercised against user installation |
| Publication | Source intended for zazu197/habe | See repository commit and test report for actual publication result |

The complete master specification is not yet achieved. Remaining implementation must not be labeled as unsupported merely because it is unfinished.
