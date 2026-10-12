/* Isolated iframe: no Spotify credentials cross this boundary. */
(() => {
  const session = location.pathname.match(/^\/session\/([a-f0-9]{64})\//)?.[1];
  if (!session) throw new Error('Open Riffify through its paired Spicetify app');
  const prefix = `/session/${session}`;
  window.riffifyPrefix = prefix;
  const nativeFetch = window.fetch.bind(window);
  const local = value => typeof value === 'string' ? value.replace(/http:\/\/127\.0\.0\.1:\d+(\/api\/[^\s"']*)/g, `${location.origin}${prefix}$1`) : value;
  const rewrite = value => {
    if (typeof value === 'string') return local(value);
    if (Array.isArray(value)) return value.map(rewrite);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rewrite(v)]));
    return value;
  };
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? local(input) : input;
    const res = await nativeFetch(url, init);
    if (typeof url === 'string' && url.startsWith(location.origin + prefix) && res.headers.get('content-type')?.includes('application/json')) {
      const json = res.json.bind(res); res.json = async () => rewrite(await json());
    }
    return res;
  };
  window.riffifyApi = async (route, body, method) => {
    const response = await nativeFetch(`${prefix}/api/riffify/${route}`, { method: method || (body ? 'POST' : 'GET'), headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    const result = await response.json(); if (!response.ok || result.error) throw new Error(result.error || 'Companion request failed'); return result;
  };
  window.electronAPI = {
    getServerPort: async () => Number(location.port),
    getDataDir: async () => ({ path: 'Private Riffify data directory' }),
    getDownloadDir: async () => ({ path: 'Riffify/downloads (local user data)' }),
    getCustomThemes: async () => [],
    setZoomFactor: value => { document.body.style.zoom = value; }
  };
})();
