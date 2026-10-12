import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';

export const comparisonKey = value => String(value || '').normalize('NFKC').trim().toLocaleLowerCase('en').replace(/\s+/g, ' ');
export function qualifies(ms, duration) { return ms >= 30000 && duration > 0 && ms >= Math.min(duration / 2, 240000); }

const formatters=new Map();
const formatter = zone => { if(!formatters.has(zone))formatters.set(zone,new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }));return formatters.get(zone); };
export function dateParts(time, zone) {
  return Object.fromEntries(formatter(zone).formatToParts(time).filter(p => p.type !== 'literal').map(p => [p.type, Number(p.value)]));
}
export function midnight(date, zone) {
  const target = Date.UTC(date.year, date.month - 1, date.day);
  let guess = target;
  for (let i = 0; i < 5; i++) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(guess).filter(p => p.type !== 'literal').map(p => [p.type, Number(p.value)]));
    const observed = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    const diff = target - observed;
    if (!diff) return guess;
    guess += diff;
  }
  return guess;
}
const shift = (d, days) => { const dt = new Date(Date.UTC(d.year, d.month - 1, d.day + days)); return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate() }; };
export function periodBounds(period, zone, now = Date.now(), custom = {}) {
  const d = dateParts(now, zone), tomorrow = midnight(shift(d, 1), zone);
  const monday = shift(d, -(new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay() + 6) % 7);
  const ranges = {
    today: [midnight(d, zone), tomorrow], yesterday: [midnight(shift(d, -1), zone), midnight(d, zone)],
    week: [midnight(monday, zone), midnight(shift(monday, 7), zone)],
    lastweek: [midnight(shift(monday, -7), zone), midnight(monday, zone)],
    month: [midnight({ ...d, day: 1 }, zone), midnight({ year: d.year, month: d.month + 1, day: 1 }, zone)],
    year: [midnight({ year: d.year, month: 1, day: 1 }, zone), midnight({ year: d.year + 1, month: 1, day: 1 }, zone)],
    '7days': [now - 7 * 86400000, now], '30days': [now - 30 * 86400000, now], all: [0, now + 1]
  };
  if (period === 'custom') {
    const parse = value => { if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) throw new Error('ISO date required'); const [year, month, day] = value.split('-').map(Number); return { year, month, day }; };
    const a = midnight(parse(custom.from), zone), b = midnight(shift(parse(custom.to), 1), zone);
    if (a >= b) throw new Error('Date range is reversed');
    return [a, b];
  }
  if (!ranges[period]) throw new Error('Unknown period');
  return ranges[period];
}

export class Ledger {
  constructor(file) {
    this.db = new DatabaseSync(file);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, provider TEXT NOT NULL, track_id TEXT NOT NULL, title TEXT, artist TEXT, album TEXT,
        started INTEGER NOT NULL, ended INTEGER NOT NULL, duration INTEGER NOT NULL, measured INTEGER NOT NULL DEFAULT 0, qualified INTEGER NOT NULL DEFAULT 0, context TEXT);
      CREATE TABLE IF NOT EXISTS intervals(id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id), started INTEGER NOT NULL, ended INTEGER NOT NULL, ms INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS scrobbles(id TEXT PRIMARY KEY, username TEXT NOT NULL, timestamp INTEGER NOT NULL, title TEXT NOT NULL, artist TEXT NOT NULL,
        album TEXT, mbid TEXT, raw TEXT NOT NULL, batch TEXT NOT NULL, matched_session TEXT UNIQUE REFERENCES sessions(id) ON DELETE SET NULL);
      CREATE TABLE IF NOT EXISTS state(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS scrobble_time ON scrobbles(username,timestamp);
      CREATE INDEX IF NOT EXISTS session_time ON sessions(started);
      CREATE INDEX IF NOT EXISTS interval_time ON intervals(started,ended);
      PRAGMA user_version=1;`);
    this.active = null; this.last = null; this.tracking = true;
    const saved=this.get('active');
    if(saved) { const row=this.db.prepare('SELECT * FROM sessions WHERE id=?').get(saved.id); if(row && Date.now()-row.ended<60000)this.active={...saved,measured:row.measured}; }
  }
  get(key, fallback = null) { const row = this.db.prepare('SELECT value FROM state WHERE key=?').get(key); return row ? JSON.parse(row.value) : fallback; }
  set(key, value) { this.db.prepare('INSERT OR REPLACE INTO state VALUES(?,?)').run(key, JSON.stringify(value)); }
  sample(sample, mono = performance.now(), wall = Date.now()) {
    if (!this.tracking) { this.last = null; return; }
    const track = sample.track;
    if (!track?.id || !['spotify', 'youtube', 'ytmusic', 'soundcloud', 'local'].includes(track.platform)) { this.last = null; return; }
    const position = Number(sample.position), rate = Number(sample.rate || 1);
    if (!Number.isFinite(position) || position < 0 || !Number.isFinite(rate) || rate <= 0 || rate > 4) throw new Error('Invalid playback sample');
    const identity = `${track.platform}:${track.id}`;
    const previous = this.last;
    const repeated = previous?.identity === identity && previous.position > position + 1000 && position < 2000 && previous.position > Number(track.duration || 0) * 1000 - 4000;
    if (!this.active || this.active.identity !== identity || repeated) {
      const id = randomUUID();
      this.db.prepare('INSERT INTO sessions(id,provider,track_id,title,artist,album,started,ended,duration,context) VALUES(?,?,?,?,?,?,?,?,?,?)')
        .run(id, track.platform, String(track.id), String(track.title || ''), String(track.artist || ''), String(track.album || ''), wall, wall, Math.max(0, Math.round(Number(track.duration || 0) * 1000)), String(sample.context || ''));
      this.active = { id, identity, measured: 0, duration: Number(track.duration || 0) * 1000 };
      this.set('active',this.active);
    }
    if (previous && previous.identity === identity && !repeated && previous.playing && sample.playing) {
      const elapsed = mono - previous.mono, delta = position - previous.position;
      if (elapsed > 0 && elapsed <= 15000 && delta > 0 && Math.abs(delta - elapsed * rate) <= 1500) {
        const ms = Math.round(Math.min(elapsed, delta / rate));
        const start = wall - ms;
        this.db.prepare('INSERT INTO intervals VALUES(?,?,?,?,?)').run(randomUUID(), this.active.id, start, wall, ms);
        this.active.measured += ms;
        this.db.prepare('UPDATE sessions SET ended=?,measured=?,qualified=? WHERE id=?').run(wall, this.active.measured, +qualifies(this.active.measured, this.active.duration), this.active.id);
      }
    }
    this.last = { mono, wall, position, playing: Boolean(sample.playing), identity };
  }
  importScrobbles(username, tracks, batch) {
    if (!Array.isArray(tracks)) throw new Error('Malformed Last.fm track list');
    let added = 0;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const t of tracks) {
        if (String(t?.['@attr']?.nowplaying) === 'true' || !/^\d+$/.test(String(t?.date?.uts || ''))) continue;
        const timestamp = Number(t.date.uts) * 1000, title = String(t.name || ''), artist = String(t.artist?.['#text'] || t.artist?.name || '');
        if (!title || !artist || !Number.isSafeInteger(timestamp) || timestamp <= 0) continue;
        const id = createHash('sha256').update(`${username}\0${timestamp}\0${comparisonKey(artist)}\0${comparisonKey(title)}`).digest('hex');
        added += Number(this.db.prepare('INSERT OR IGNORE INTO scrobbles(id,username,timestamp,title,artist,album,mbid,raw,batch) VALUES(?,?,?,?,?,?,?,?,?)')
          .run(id, username, timestamp, title, artist, String(t.album?.['#text'] || ''), String(t.mbid || ''), JSON.stringify(t), batch).changes);
        const candidates = this.db.prepare(`SELECT s.id,s.title,s.artist FROM sessions s WHERE s.started BETWEEN ? AND ?
          AND NOT EXISTS(SELECT 1 FROM scrobbles x WHERE x.matched_session=s.id)`).all(timestamp - 90000, timestamp + 90000)
          .filter(s => comparisonKey(s.title) === comparisonKey(title) && comparisonKey(s.artist) === comparisonKey(artist));
        if (candidates.length === 1) {
          const nearby = this.db.prepare('SELECT title,artist FROM scrobbles WHERE username=? AND timestamp BETWEEN ? AND ? AND id<>?').all(username, timestamp - 90000, timestamp + 90000, id)
            .filter(s => comparisonKey(s.title) === comparisonKey(title) && comparisonKey(s.artist) === comparisonKey(artist));
          if (!nearby.length) this.db.prepare('UPDATE scrobbles SET matched_session=? WHERE id=? AND matched_session IS NULL').run(candidates[0].id, id);
        }
      }
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    return added;
  }
  stats({ period = 'week', timezone = 'Europe/Stockholm', scope = 'all', rank = 'plays', username = 'zazafent', from, to, now = Date.now() } = {}) {
    const [start, end] = periodBounds(period, timezone, now, { from, to });
    const sessions = this.db.prepare('SELECT * FROM sessions WHERE started < ? AND ended >= ?').all(end, start).filter(s => scope !== 'spotify' || s.provider === 'spotify');
    const sessionMap=new Map(sessions.map(s=>[s.id,s]));
    const intervals = this.db.prepare(`SELECT i.*,s.provider,s.title,s.artist,s.album,s.track_id FROM intervals i JOIN sessions s ON s.id=i.session_id WHERE i.started<? AND i.ended>?`).all(end, start)
      .filter(s => scope !== 'spotify' || s.provider === 'spotify');
    const scrobbles = this.db.prepare('SELECT * FROM scrobbles WHERE username=? AND timestamp>=? AND timestamp<?').all(username, start, end);
    const eligible = scope === 'spotify' ? scrobbles.filter(s => sessionMap.get(s.matched_session)?.provider === 'spotify') : scrobbles;
    const artistMap = new Map(), trackMap = new Map(), albumMap = new Map(), daily = new Map(), hours = Array(24).fill(0), providers = new Map();
    const add = (map, key, label, plays, ms) => { const row = map.get(key) || { name: label, plays: 0, measured: 0 }; row.plays += plays; row.measured += ms; map.set(key, row); };
    const dayKey = time => { const d = dateParts(time, timezone); return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`; };
    for (const s of sessions) {
      if (s.started < start || s.started >= end || !s.qualified) continue;
      add(artistMap, comparisonKey(s.artist), s.artist, 1, 0);
      add(trackMap, `${s.provider}:${s.track_id}`, `${s.title} — ${s.artist}`, 1, 0);
      if (s.album) add(albumMap, `${comparisonKey(s.artist)}:${comparisonKey(s.album)}`, s.album, 1, 0);
      add(providers, s.provider, s.provider, 1, 0);
      const key=dayKey(s.started), item=daily.get(key)||{date:key,plays:0,measured:0};item.plays++;daily.set(key,item);
    }
    let measured = 0;
    for (const s of intervals) {
      const a = Math.max(start, s.started), b = Math.min(end, s.ended), ms = Math.round(s.ms * (b - a) / (s.ended - s.started));
      measured += ms;
      add(artistMap, comparisonKey(s.artist), s.artist, 0, ms);
      add(trackMap, `${s.provider}:${s.track_id}`, `${s.title} — ${s.artist}`, 0, ms);
      if (s.album) add(albumMap, `${comparisonKey(s.artist)}:${comparisonKey(s.album)}`, s.album, 0, ms);
      add(providers, s.provider, s.provider, 0, ms);
      let cursor = a;
      while (cursor < b) {
        const d = dateParts(cursor, timezone), boundary = Math.min(b, midnight(shift(d, 1), timezone));
        const fraction = (boundary - cursor) / (b - a), key = dayKey(cursor);
        const item = daily.get(key) || { date: key, plays: 0, measured: 0 }; item.measured += ms * fraction; daily.set(key, item);
        hours[d.hour] += ms * fraction; cursor = boundary;
      }
    }
    for (const s of eligible) {
      const local = sessionMap.get(s.matched_session);
      const extra = local?.qualified ? 0 : 1;
      add(artistMap, comparisonKey(s.artist), s.artist, extra, 0);
      const trackKey = local ? `${local.provider}:${local.track_id}` : `lastfm:${comparisonKey(s.artist)}:${comparisonKey(s.title)}`;
      add(trackMap, trackKey, `${s.title} — ${s.artist}`, extra, 0);
      if (s.album) add(albumMap, `${comparisonKey(s.artist)}:${comparisonKey(s.album)}`, s.album, extra, 0);
      if (!local) add(providers, 'lastfm', 'Last.fm (provider unknown)', 1, 0);
      const key = dayKey(s.timestamp), item = daily.get(key) || { date: key, plays: 0, measured: 0 }; item.plays+=extra; daily.set(key, item);
    }
    const sorted = map => [...map.values()].sort((a, b) => rank === 'time' ? b.measured - a.measured : b.plays - a.plays).slice(0, 50);
    const coverage = this.db.prepare('SELECT MIN(timestamp) earliest,MAX(timestamp) latest,COUNT(*) imported FROM scrobbles WHERE username=?').get(username);
    return { start, end, period, timezone, scope, rank, measured, estimated: null, missingDurations: eligible.filter(s => !s.matched_session).length,
      scrobbles: eligible.length, plays: [...trackMap.values()].reduce((sum, x) => sum + x.plays, 0),
      artists: sorted(artistMap), tracks: sorted(trackMap), albums: sorted(albumMap), providers: [...providers.values()],
      daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)), hours, coverage, sync: this.get(`sync:${username}`), tracking: this.tracking };
  }
  export() { return { version: 1, sessions: this.db.prepare('SELECT * FROM sessions').all(), intervals: this.db.prepare('SELECT * FROM intervals').all(), scrobbles: this.db.prepare('SELECT * FROM scrobbles').all() }; }
  clear() { this.active = null; this.last = null; this.db.exec('DELETE FROM intervals; DELETE FROM scrobbles; DELETE FROM sessions; DELETE FROM state;'); }
  close() { this.db.close(); }
}

export class LastFmSync {
  constructor(ledger, config, fetcher = fetch) { this.ledger = ledger; this.config = config; this.fetcher = fetcher; this.status = { running: false }; this.controller = null; }
  async api(method, extra = {}, signal) {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(this.config.username)) throw new Error('Invalid Last.fm username');
    if (!this.config.apiKey) throw new Error('Add your Last.fm API key in Stats settings');
    const u = new URL('https://ws.audioscrobbler.com/2.0/');
    u.search = new URLSearchParams({ method, user: this.config.username, api_key: this.config.apiKey, format: 'json', ...extra }).toString();
    for (let retry = 0; retry < 4; retry++) {
      signal?.throwIfAborted();
      try {
        const res = await this.fetcher(u, { signal: AbortSignal.any([AbortSignal.timeout(15000), ...(signal ? [signal] : [])]) });
        const data = await res.json();
        if ([429, 500, 502, 503].includes(res.status) || [11, 16, 29].includes(Number(data.error))) throw Object.assign(new Error('Last.fm temporarily unavailable; retry later'), { retry: true });
        if (!res.ok || data.error) throw new Error(`Last.fm error ${Number(data.error) || res.status}`);
        return data;
      } catch (error) {
        if (signal?.aborted || (!error.retry && error.name !== 'TimeoutError' && !(error instanceof TypeError)) || retry === 3) throw error;
        await new Promise((resolve, reject) => { const timer = setTimeout(resolve, 1000 * 2 ** retry + Math.random() * 300); signal?.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true }); });
      }
    }
  }
  async rankings(kind, period = 'overall') {
    if (!['Artists', 'Tracks', 'Albums'].includes(kind) || !['overall', '7day', '1month', '3month', '6month', '12month'].includes(period)) throw new Error('Invalid rolling chart');
    return this.api(`user.getTop${kind}`, { period, limit: '50' });
  }
  stop() { this.controller?.abort(new Error('Sync paused; progress saved')); }
  async run() {
    if (this.status.running) return;
    this.status = { running: true, retrieved: 0, error: '' }; this.controller = new AbortController();
    const signal = this.controller.signal, username = this.config.username, key = `sync:${username}`;
    try {
      const profile = await this.api('user.getInfo', {}, signal);
      if (!profile.user?.name || comparisonKey(profile.user.name) !== comparisonKey(username)) throw new Error('Last.fm profile mismatch');
      let cursor = this.ledger.get(key, {});
      if (!cursor.pending) cursor = { ...cursor, page: 1, to: Math.floor(Date.now() / 1000), from: cursor.complete ? Math.max(0, (cursor.highwater || 0) - 86400) : 0, pending: true };
      this.status.profile = { name: profile.user.name, playcount: Number(profile.user.playcount), registered: Number(profile.user.registered?.unixtime) || null };
      for (;;) {
        signal.throwIfAborted();
        const data = await this.api('user.getRecentTracks', { limit: '200', page: String(cursor.page), from: String(cursor.from), to: String(cursor.to) }, signal);
        const result = data.recenttracks, attr = result?.['@attr'];
        if (!attr || !Number.isFinite(Number(attr.totalPages)) || Number(attr.page) !== cursor.page) throw new Error('Malformed Last.fm pagination');
        const rows = Array.isArray(result.track) ? result.track : result.track ? [result.track] : [];
        if (!rows.length && cursor.page < Number(attr.totalPages)) throw new Error('Empty page before end of history; retry saved page');
        this.ledger.importScrobbles(username, rows, `${username}:${cursor.to}`);
        this.status.retrieved = Number(this.ledger.db.prepare('SELECT COUNT(*) n FROM scrobbles WHERE username=?').get(username).n);
        this.status.total = Number(attr.total); this.status.page = cursor.page; this.status.pages = Number(attr.totalPages);
        cursor.page++; this.ledger.set(key, cursor);
        if (Number(attr.totalPages) === 0 || cursor.page > Number(attr.totalPages)) break;
        if (!rows.length) throw new Error('Empty page before end of history; retry saved page');
        await new Promise(resolve => setTimeout(resolve, 350));
      }
      cursor.pending = false; cursor.complete = true; cursor.highwater = cursor.to; cursor.syncedAt = Date.now(); this.ledger.set(key, cursor);
    } catch (error) { this.status.error = signal.aborted ? 'Sync paused; resume to continue' : String(error.message).replace(/api_key=[^&\s]+/gi, 'api_key=[redacted]'); }
    finally { this.status.running = false; }
  }
}
