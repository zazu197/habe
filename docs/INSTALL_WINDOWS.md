# Windows installation

Install desktop Spotify and Spicetify using their own documented procedures. Enable Spicetify API exposure. Use a regular Windows user account; Riffify does not need administrator privileges.

Clone this repository, install Node.js 22.11 or newer, then run the commands in the README. `npm ci --ignore-scripts` installs no application dependencies. Build before starting or installing; generated files are not tracked. Run `npm run setup:media` for external sources or supply trusted yt-dlp/FFmpeg paths through `RIFF_YTDLP` and `RIFF_FFMPEG`.

`npm run install:spotify` preserves current custom apps/theme and saves a backup under `%LOCALAPPDATA%\Riffify\spicetify-backup`. It pairs a generated token through an ignored installed `connection.js`; do not publish that file. Spicetify's patch validation is respected. If apply fails, inspect the local `last-install.log`, recover from the saved backup, and do not force an incompatible patch.

Run `npm start` in a terminal while using Riffify. It binds `127.0.0.1:38473`. A private connection configuration, Last.fm key, SQLite database, downloaded media, and tool metadata reside in `%LOCALAPPDATA%\Riffify`. `RIFFIFY_DATA_DIR` can select a different private user directory before starting/installing. The application does not register startup tasks or download tool updates automatically.

Open Riffify from Spotify's sidebar. It becomes the initial route while its extension is installed. Spotify is the default first-run provider; subsequent explicit choices are remembered. Choose an external provider explicitly for external audio. The local library import uses a browser file picker and imports supported audio into the companion's private library.

For history, open Stats / Wrapped and configure the default `zazafent` Last.fm account with your own API key. API keys are stored locally, not in source. See `LASTFM_INTEGRATION.md`. For downloads, confirm both your rights and source permission before saving anything; Spotify tracks cannot be downloaded.

Stop the companion with Ctrl+C. After changing generated bridge files, rebuild and rerun installation. Restart the companion after backend changes. Upgrade Spotify/Spicetify only with a current backup and rerun live compatibility checks.
