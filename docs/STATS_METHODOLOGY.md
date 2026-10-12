# Statistics methodology

Measured time and counted plays are separate. Samples arrive about once per second. Monotonic elapsed time is compared with position delta and playback rate. Only active positive progress with at most 1.5 seconds discrepancy counts. Gaps above 15 seconds, stalls, seeks, duplicate zero-delta events and pauses add no time. A boundary interval may be lost rather than credited without observation. Connect state does not prove physical listening.

A qualified local play needs at least 30 seconds and half known duration, capped at four minutes. Unknown duration cannot qualify. Short skips still contribute measured time. Near-end replay resets create sessions. This independent rule is not Spotify's official convention. Continuous intervals coalesce; pause/seek/wall-clock discontinuities break coalescing. Pause/resume/seek/stall events are retained.

Last.fm timestamps establish scrobbles, not measured duration. Now-playing rows are excluded. Repeated listens at different times stay separate. Stable MBIDs reconcile corrections; adding a MBID to a same-name/time record preserves identity. Edition text stays intact. Material name changes without trustworthy identifiers can remain separate.

Evidence matches only for identical comparison keys, one local candidate within 90 seconds of start or end, and no competing nearby scrobble. Ambiguous records remain separate. A qualified session with a matched scrobble counts once with both sources. Unmatched scrobbles retain unknown provider attribution and do not enter Spotify-only scope.

Calendar filters use IANA timezone, local midnight and ISO Monday weeks. DST days can last 23/25 hours. Rolling 7/30-day windows stay distinct. Intervals clip/split at hour and midnight. Qualified plays use session start; scrobbles use original timestamps, which may reflect submission rather than track start.

Exact-name Last.fm track.getInfo processes 50 unresolved recordings per request. Available duration yields explicitly estimated time for unmatched historical scrobbles. Missing/zero durations remain unknown; no invented average is used. Time ranks use measured intervals only. Matched estimates are never added to measured sessions.

Ranks cover artists/tracks/albums/providers and identifiable contexts. Unique counts, active dates, average measured time per active date, peak date, first recorded artist, longest streak/session derive from records. Sessions join intervals with gaps at most five minutes; gaps add no time. Discovery means earliest observed record, not first-ever listening. Previous-period comparison counts Last.fm scrobbles in an equal-length timestamp window, unavailable for Spotify-only scope. Genre stays unknown. Activity shows at most 180 active dates; totals cover the full filter.

SQLite WAL, indexed periods and map lookups support recovery. Startup saves a snapshot. Additive schema version 3 first saves a consistent pre-migration snapshot for older databases. Private backups can retain deleted history; remove backup files separately when erasing all local copies. JSON/CSV export and transactional Riffify JSON import are available. Supported JSON is version 1, bounded to 16 MB and 100,000 rows per table. Repeats are idempotent; conflicting IDs abort without partial writes. Optional Spotify Extended Streaming History is absent.

Large lifetime queries and native tracking accuracy have not been benchmarked on this account. Artwork/trends, richer heatmaps and recap refinement remain work.
