# Third-party notices

Riffify uses the MIT-licensed Riff source by rootscripts, pinned at `80ff208a32c1e3ee036881ed20d8b1388e990f48`. Its copyright and complete license are retained in `LICENSE` and `vendor/riff/LICENSE`. Build-time modifications are described in `docs/UPSTREAM.md`.

Bundled assets retain their upstream comments. HLS.js is Apache-2.0, not covered solely by Riff's MIT license. Its notice and the Apache license are included in `licenses/HLS-NOTICE.txt` and `licenses/Apache-2.0.txt`. The notice includes derived code credited to Brightcove.

Monaco Editor is MIT-licensed by Microsoft Corporation. See `licenses/Monaco-MIT.txt`. Tone.js is MIT-licensed by Yotam Mann. See `licenses/Tone-MIT.txt`; the vendored Tone asset is preserved but not loaded by the current UI.

Google Sans is requested from Google's hosted font stylesheet as in upstream Riff; no Google font binary is redistributed here. Availability and use remain subject to Google's hosted font service.

Spicetify is a separately installed tool. Its source is inspected for API compatibility but is not bundled in this repository. No Lyrics Plus code is copied; the Spotify lyrics endpoint and LRCLIB behavior are implemented through small independent adapters. These endpoints can change or become unavailable.

yt-dlp and FFmpeg are optional external user-level tools. Their binaries are not redistributed in source commits. Downloaded tool releases retain their own licensing obligations; FFmpeg build configuration determines applicable LGPL/GPL terms. The supplied setup uses upstream release checksums and records the chosen executable locally.
