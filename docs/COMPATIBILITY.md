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

Electron-only window management, detached mini window, tray behavior, multi-instance control, native data-directory migration, native theme import, updater, and duplicate Discord RPC are unavailable in the embedded document. Native Spotify owns its media keys and device controls. Effects cannot alter Spotify audio. A Riff queue remains separate from Spotify's native queue; complete automatic mixed-provider advancement and remote Connect switching need live validation.

Linux and macOS paths are retained where reasonable, but no runtime verification was performed on those platforms. Spicetify's origin and client layout may change. An account login or API permission request must be handled by the user.
