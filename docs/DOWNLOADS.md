# External media downloads

Spotify audio cannot be saved/decrypted/captured or substituted with a title match. Select an external source explicitly. Validated HTTPS YouTube/SoundCloud URLs require confirmation of both rights and source permission. Confirmation does not create rights.

yt-dlp enumerates actual formats/sizes where available. Audio/video are separate choices. Video-only streams combine with available audio using FFmpeg. Audio can retain source format or convert to M4A/MP3/FLAC/Opus. Metadata/artwork embedding is optional. Progress/speed/ETA use tool output. Cancel/retry/errors/open-file/open-folder/audio-library import have explicit controls.

Choose filename and optional safe private download subfolder. Arbitrary OS destinations are not accepted. Argument arrays use --no-config and a -- URL terminator. One job runs at a time; pending work caps at 20, size at 2 GB and execution at 30 minutes. Per-job directories isolate temporary files. Journals preserve state; interrupted jobs need retry. Cancel waits for child exit before retry can launch.

YouTube playlists cap at 100 entries. Formats derive from the first accessible entry. Later unavailable formats fail explicitly rather than changing quality. This known limit does not guarantee uniform playlist quality. Original audio-effects export remains unverified.

Tool setup is explicit, with reviewed SHA-256 checks. Observed yt-dlp 2026.08.19 is checksum-verified. Existing FFmpeg N-117770-g322b240cea-20241114 comes from PATH; upstream origin is unverified. Automatic install/update routes are blocked. Binaries/media stay outside Git.

Public Blender Foundation Big Buck Bunny metadata returned 49 formats (37 video, 12 audio). No media was saved. Actual saving/muxing needs a user-supplied source with rights and source permission. Tests establish validation/cancellation/journal behavior, not external availability or permission.
