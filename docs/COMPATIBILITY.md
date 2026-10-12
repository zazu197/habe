# Compatibility

Observed on Windows x64 on 2026-10-12:

- Spotify `1.3.4.258.gc60b10b0946a`.
- Spicetify `2.45.0`; expose_apis enabled.
- Node.js `22.11.0`, with `--experimental-sqlite`.
- yt-dlp `2026.08.19`, checksum-verified release downloaded to local Riffify data.
- Existing FFmpeg `N-117770-g322b240cea-20241114` from the user's PATH; its upstream origin was not verified.

The initial Spicetify backup represented an older Spotify build. Riffify first copied the current Spotify Apps directory and Spicetify config outside Git, then `spicetify backup apply` completed successfully against the current client. A subsequent apply also completed.

The actual Custom App displayed Riff's original interface and populated real Spotify liked songs and playlists. Live playback and Spotify Connect were not validated after the user stopped Computer Use. These are not certified by fixture tests or a successful build.

The current adapter uses available Spicetify Player, LibraryAPI, RootlistAPI, and PlaylistAPI behavior. Spotify search and internal lyrics endpoints are version-sensitive and may reject account access. Lyrics failure falls back to Riff's LRCLIB/custom lyrics path. There is no unrestricted public Spotify lyrics API.

Electron-only window management, detached mini window, tray behavior, multi-instance control, native data-directory migration, native theme dialogs, updater, and duplicate Discord RPC are unavailable in the embedded document. Browser CSS and LRC import replace applicable file dialogs. Native Spotify owns media keys and device controls. Effects cannot alter Spotify audio. A Riff queue remains separate from Spotify's native queue; automatic mixed-provider advancement and Connect switching need live validation. Completion is inferred from native URI change and monotonic progress near the duration because the exposed event lacks a reliable end reason; manual skips near the end can be ambiguous.

Playlist mutations use the documented [current-user create](https://developer.spotify.com/documentation/web-api/reference/create-playlist), [add items](https://developer.spotify.com/documentation/web-api/reference/add-items-to-playlist) and [remove items](https://developer.spotify.com/documentation/web-api/reference/remove-items-playlist) endpoints. Artist top tracks is deprecated in the public API and may be unavailable to an account. Errors remain visible rather than substituting an external source. Native permissions and API availability require live verification.

Linux and macOS paths are retained where reasonable, but no runtime verification was performed on those platforms. Spicetify's origin and client layout may change. An account login or API permission request must be handled by the user.
