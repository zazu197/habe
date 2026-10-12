# Uninstall and recovery

Run `npm run uninstall:spotify`. This removes only the managed Riffify Custom App entry and directory, preserves other current Spicetify customizations, and reapplies Spicetify. Stop the companion with Ctrl+C or stop its own background Node process if you launched it separately.

Riffify does not install a startup task, service, or registry entry. Listening history and settings are retained outside Git. Use Stats' confirmed local deletion before uninstalling if you want to remove history. Removing Last.fm linkage does not delete your Last.fm account.

If Spicetify apply fails, the installation backup contains the pre-Riffify `config-xpui.ini` and Spotify `Apps` directory under `%LOCALAPPDATA%\Riffify\spicetify-backup`. Close Spotify before restoring these files. Verify the backup path and target Spotify directory before copying. A restored old app snapshot may not match a later Spotify executable; after a Spotify update, use Spotify's repair/reinstall and rebuild Spicetify's backup instead of applying an incompatible snapshot.

Do not remove arbitrary user media or unrelated Spicetify files. The uninstall script validates its managed target and keeps personal data for an explicit separate decision.
