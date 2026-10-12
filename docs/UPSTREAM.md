# Upstream sources and modifications

| Source | Pinned revision | Use |
| --- | --- | --- |
| https://github.com/rootscripts/riff | `80ff208a32c1e3ee036881ed20d8b1388e990f48` | Original HTML, CSS, JS, audio engine, backend, platform helpers, tools installer, assets, Monaco |
| https://github.com/spicetify/cli | `16840237b5c4f0edfc0556b9c214f8c2029b6390` | API and packaging audit; separately installed runtime |

Riff declares MIT. Third-party bundled assets have separate notices in `THIRD_PARTY_NOTICES.md`. Source snapshots are preserved, not replaced with newly designed components.
The unused Tone.js bundle is excluded. Electron entry points and binaries are not shipped in the embedded app.

The build adds a Spotify pill, defaults to Spotify, routes search/playback/library/lyrics to the bridge, adapts progress accessors, adds Stats and Downloads, and rewrites all original loopback references to paired companion URLs. It disables Spotify audio effects and unsupported native controls. The backend's automatic media saving, source substitution fallback, certificate bypass, and automatic binary updater are removed. The backend socket is never started by the companion.

To update: audit the new upstream revision and licenses, replace only the vendored snapshot, update `upstream.json`, run the build hook checks and all tests, capture equivalent UI fixtures and live Spotify screenshots, and review security again. A missing hook fails the build. Do not silently accept a changed application flow.
