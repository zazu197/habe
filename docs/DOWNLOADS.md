# External media downloads

Spotify audio cannot be saved, decrypted, captured, or substituted with a title match. An explicit source selection is required. The download manager accepts validated HTTPS YouTube and SoundCloud track URLs and requires confirmation of download rights and source permission. No confirmation grants rights the user does not have.

The manager asks yt-dlp for available formats rather than inventing quality choices. Video and audio are distinct selections. Video-only formats are combined with the best available audio using FFmpeg. Current audio saving converts to M4A; additional conversion choices are not yet exposed. Available sizes are source estimates. Percentage, speed, ETA, cancellation, retry, completion, and subprocess errors are displayed when reported by yt-dlp.

Downloads stay under the private local Riffify downloads directory. Filenames are sanitized; every job receives its own safe directory. Subprocesses receive argument arrays, `--no-config`, HTTPS provider allowlists, and a `--` URL terminator. No arbitrary command or user-selected executable comes from the web UI. Jobs are serialized, pending work is limited to 20 jobs, files are limited to 2 GB, and execution is bounded to 30 minutes. A journal preserves job status; interrupted jobs need explicit retry.

Completed files have authenticated file links. Native open-folder actions, arbitrary destination selection, playlist-format enumeration, download-to-library import, and original audio-effects export are not complete. Raw playlist execution support in the job runner is not presented as a finished user workflow.

Tool setup is a separate explicit command. The audited upstream installer checks release SHA-256 checksums for downloaded tools. The current machine has yt-dlp `2026.08.19` and existing FFmpeg `N-117770-g322b240cea-20241114`; existing PATH installation provenance is recorded as unverified. Automatic installation and updater endpoints are blocked in the running companion.

No actual user-authorized source download was performed during development. Automated tests verify validation, missing-tool errors, journal restore, companion authentication, and file access. Successful tests do not prove external service availability or permission to download a particular video.
