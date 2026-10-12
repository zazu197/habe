import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { existsSync } from 'node:fs';

export const comparisonKey = value => String(value || '').normalize('NFKC').trim().toLocaleLowerCase('en').replace(/\s+/g, ' ');
export const durationKey=(artist,title)=>createHash('sha256').update(`${comparisonKey(artist)}\0${comparisonKey(title)}`).digest('hex');
export function qualifies(ms, duration) { return ms >= 30000 && duration > 0 && ms >= Math.min(duration / 2, 240000); }

const formatters=new Map();
const formatter = zone => { if(!formatters.has(zone))formatters.set(zone,new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',minute:'2-digit',second:'2-digit', hourCycle: 'h23' }));return formatters.get(zone); };
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
    const version=Number(this.db.prepare('PRAGMA user_version').get().user_version);
    if(file!==':memory:'&&version>0&&version<3&&!existsSync(file+'.before-schema-3.sqlite'))this.db.prepare('VACUUM INTO ?').run(file+'.before-schema-3.sqlite');
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, provider TEXT NOT NULL, track_id TEXT NOT NULL, title TEXT, artist TEXT, album TEXT,
        started INTEGER NOT NULL, ended INTEGER NOT NULL, duration INTEGER NOT NULL, measured INTEGER NOT NULL DEFAULT 0, qualified INTEGER NOT NULL DEFAULT 0, context TEXT);
      CREATE TABLE IF NOT EXISTS intervals(id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id), started INTEGER NOT NULL, ended INTEGER NOT NULL, ms INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS scrobbles(id TEXT PRIMARY KEY, username TEXT NOT NULL, timestamp INTEGER NOT NULL, title TEXT NOT NULL, artist TEXT NOT NULL,
        album TEXT, mbid TEXT, raw TEXT NOT NULL, batch TEXT NOT NULL, matched_session TEXT UNIQUE REFERENCES sessions(id) ON DELETE SET NULL);
      CREATE TABLE IF NOT EXISTS state(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS durations(key TEXT PRIMARY KEY,ms INTEGER NOT NULL,source TEXT NOT NULL,updated INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,session_id TEXT NOT NULL REFERENCES sessions(id),timestamp INTEGER NOT NULL,kind TEXT NOT NULL,metadata TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS scrobble_time ON scrobbles(username,timestamp);
      CREATE INDEX IF NOT EXISTS session_time ON sessions(started);
      CREATE INDEX IF NOT EXISTS interval_time ON intervals(started,ended);
      PRAGMA user_version=3;`);
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
    const identity = String(track.id).startsWith(track.platform+':')?String(track.id):`${track.platform}:${track.id}`;
    if(!sample.playing && this.active?.identity!==identity)return;
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
        if(this.active.intervalId && Math.abs((wall-previous.wall)-elapsed)<=1500) {
          this.db.prepare('UPDATE intervals SET ended=?,ms=ms+? WHERE id=?').run(wall,ms,this.active.intervalId);
        } else { this.active.intervalId=randomUUID();this.db.prepare('INSERT INTO intervals VALUES(?,?,?,?,?)').run(this.active.intervalId, this.active.id, start, wall, ms); }
        this.active.measured += ms;
        this.db.prepare('UPDATE sessions SET ended=?,measured=?,qualified=? WHERE id=?').run(wall, this.active.measured, +qualifies(this.active.measured, this.active.duration), this.active.id);
      } else { this.active.intervalId=null;const kind=delta===0?'stall':'seek';if(previous.event!==kind)this.db.prepare('INSERT INTO events VALUES(?,?,?,?,?)').run(randomUUID(),this.active.id,wall,kind,JSON.stringify({from:previous.position,to:position,elapsed}));sample.event=kind; }
    }
    if(!sample.playing || !previous?.playing) { this.active.intervalId=null;if(previous?.identity===identity&&previous.playing!==Boolean(sample.playing))this.db.prepare('INSERT INTO events VALUES(?,?,?,?,?)').run(randomUUID(),this.active.id,wall,sample.playing?'resume':'pause',JSON.stringify({position})); }
    this.last = { mono, wall, position, playing: Boolean(sample.playing), identity,event:sample.event };
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
        const recording=/^[a-f0-9-]{36}$/i.test(t.mbid||'')?`mbid:${t.mbid}`:`${comparisonKey(artist)}\0${comparisonKey(title)}`;
        const prior=this.db.prepare('SELECT id,mbid,title,artist FROM scrobbles WHERE username=? AND timestamp=?').all(username,timestamp).filter(s=>{
          const a=/^[a-f0-9-]{36}$/i.test(s.mbid||''),b=/^[a-f0-9-]{36}$/i.test(t.mbid||'');
          if(a&&b)return s.mbid===t.mbid;return comparisonKey(s.title)===comparisonKey(title)&&comparisonKey(s.artist)===comparisonKey(artist);
        });
        const id = prior.length===1?prior[0].id:createHash('sha256').update(`${username}\0${timestamp}\0${recording}`).digest('hex');
        const existed=this.db.prepare('SELECT 1 FROM scrobbles WHERE id=?').get(id);
        this.db.prepare(`INSERT INTO scrobbles(id,username,timestamp,title,artist,album,mbid,raw,batch) VALUES(?,?,?,?,?,?,?,?,?)
          ON CONFLICT(id) DO UPDATE SET title=excluded.title,artist=excluded.artist,album=excluded.album,mbid=excluded.mbid,raw=excluded.raw`)
          .run(id, username, timestamp, title, artist, String(t.album?.['#text'] || ''), String(t.mbid || ''), JSON.stringify(t), batch);
        if(!existed)added++;
        const candidates = this.db.prepare(`SELECT s.id,s.title,s.artist FROM sessions s WHERE (s.started BETWEEN ? AND ? OR s.ended BETWEEN ? AND ?)
          AND NOT EXISTS(SELECT 1 FROM scrobbles x WHERE x.matched_session=s.id)`).all(timestamp - 90000, timestamp + 90000,timestamp - 90000, timestamp + 90000)
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
    const artistMap = new Map(), trackMap = new Map(), albumMap = new Map(), contextMap=new Map(), daily = new Map(), hours = Array(24).fill(0), hourlyScrobbles=Array(24).fill(0), providers = new Map();
    const add = (map, key, label, plays, ms) => { const row = map.get(key) || { name: label, plays: 0, measured: 0 }; row.plays += plays; row.measured += ms; map.set(key, row); };
    const dayKey = time => { const d = dateParts(time, timezone); return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`; };
    for (const s of sessions) {
      if (s.started < start || s.started >= end || !s.qualified) continue;
      add(artistMap, comparisonKey(s.artist), s.artist, 1, 0);
      add(trackMap, `${s.provider}:${s.track_id}`, `${s.title} — ${s.artist}`, 1, 0);
      if (s.album) add(albumMap, `${comparisonKey(s.artist)}:${comparisonKey(s.album)}`, s.album, 1, 0);
      add(providers, s.provider, s.provider, 1, 0);
      if(s.context)add(contextMap,s.context,s.context,1,0);
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
      const context=sessionMap.get(s.session_id)?.context;if(context)add(contextMap,context,context,0,ms);
      let cursor = a;
      while (cursor < b) {
        const d = dateParts(cursor, timezone), nextHour=cursor+(60-d.minute)*60000-d.second*1000-(cursor%1000),boundary = Math.min(b, midnight(shift(d, 1), timezone),nextHour);
        const fraction = (boundary - cursor) / (b - a), key = dayKey(cursor);
        const item = daily.get(key) || { date: key, plays: 0, measured: 0 }; item.measured += ms * fraction; daily.set(key, item);
        hours[d.hour] += ms * fraction; cursor = boundary;
      }
    }
    const durations=new Map(this.db.prepare('SELECT key,ms FROM durations').all().map(d=>[d.key,d.ms]));
    let estimated=0,knownDurations=0;
    for (const s of eligible) {
      const local = sessionMap.get(s.matched_session);
      const extra = local?.qualified ? 0 : 1;
      add(artistMap, comparisonKey(s.artist), s.artist, extra, 0);
      const trackKey = local ? `${local.provider}:${local.track_id}` : `lastfm:${comparisonKey(s.artist)}:${comparisonKey(s.title)}`;
      add(trackMap, trackKey, `${s.title} — ${s.artist}`, extra, 0);
      if (s.album) add(albumMap, `${comparisonKey(s.artist)}:${comparisonKey(s.album)}`, s.album, extra, 0);
      if (!local) add(providers, 'lastfm', 'Last.fm (provider unknown)', 1, 0);
      const key = dayKey(s.timestamp), item = daily.get(key) || { date: key, plays: 0, measured: 0 }; item.plays+=extra; daily.set(key, item);
      hourlyScrobbles[dateParts(s.timestamp,timezone).hour]++;
      if(!local) { const duration=durations.get(durationKey(s.artist,s.title));if(duration>0){estimated+=duration;knownDurations++;} }
    }
    const sorted = map => [...map.values()].sort((a, b) => rank === 'time' ? b.measured - a.measured : b.plays - a.plays).slice(0, 50);
    const coverage = this.db.prepare('SELECT MIN(timestamp) earliest,MAX(timestamp) latest,COUNT(*) imported FROM scrobbles WHERE username=?').get(username);
    const days=[...daily.values()].sort((a,b)=>a.date.localeCompare(b.date));
    const activeDays=days.filter(d=>d.plays>0||d.measured>0);let streak=0,longestStreak=0,lastDay=null;
    for(const day of activeDays) { const stamp=Date.parse(day.date+'T12:00:00Z');streak=lastDay!==null&&stamp-lastDay===86400000?streak+1:1;longestStreak=Math.max(longestStreak,streak);lastDay=stamp; }
    let longestSession=0,run=0,previousEnd=null;
    for(const interval of [...intervals].sort((a,b)=>a.started-b.started)) {const ms=Math.round(interval.ms*Math.max(0,Math.min(end,interval.ended)-Math.max(start,interval.started))/(interval.ended-interval.started));run=previousEnd!==null&&interval.started-previousEnd<=300000?run+ms:ms;longestSession=Math.max(longestSession,run);previousEnd=interval.ended;}
    const previousStart=Math.max(0,start-(end-start));
    const previousScrobbles=scope==='spotify'?null:Number(this.db.prepare('SELECT COUNT(*) n FROM scrobbles WHERE username=? AND timestamp>=? AND timestamp<?').get(username,previousStart,start).n);
    const firstRows=scope==='spotify'?this.db.prepare("SELECT artist,MIN(started) first FROM sessions WHERE provider='spotify' AND measured>0 GROUP BY artist").all():this.db.prepare(`SELECT artist,MIN(first) first FROM (SELECT artist,started first FROM sessions WHERE measured>0 UNION ALL SELECT artist,timestamp first FROM scrobbles WHERE username=?) GROUP BY artist`).all(username);
    const firstMap=new Map();for(const row of firstRows){const key=comparisonKey(row.artist);if(key)firstMap.set(key,Math.min(firstMap.get(key)??Infinity,row.first));}const firstArtists=[...firstMap.values()].filter(time=>time>=start&&time<end).length;
    return { start, end, period, timezone, scope, rank, measured, estimated:knownDurations?estimated:null,knownDurations, missingDurations: eligible.filter(s => !s.matched_session).length-knownDurations,
      scrobbles: eligible.length, plays: [...trackMap.values()].reduce((sum, x) => sum + x.plays, 0),
      artists: sorted(artistMap), tracks: sorted(trackMap), albums: sorted(albumMap), providers: [...providers.values()],
      contexts:sorted(contextMap),daily:days,hours,hourlyScrobbles,coverage, sync: this.get(`sync:${username}`), tracking: this.tracking,
      uniqueTracks:trackMap.size,uniqueArtists:artistMap.size,uniqueAlbums:albumMap.size,activeDays:activeDays.length,longestStreak,longestSession,
      averageDailyMeasured:activeDays.length?measured/activeDays.length:0,peakDay:activeDays.slice().sort((a,b)=>b.measured-a.measured||b.plays-a.plays)[0]||null,
      firstRecordedArtists:firstArtists,previousScrobbles,genres:'Unknown / unclassified',milestones:{measuredHours:Math.floor(measured/3600000),qualifiedPlays:[...trackMap.values()].reduce((n,x)=>n+x.plays,0)} };
  }
  export() { return { version: 1, sessions: this.db.prepare('SELECT * FROM sessions').all(), intervals: this.db.prepare('SELECT * FROM intervals').all(), scrobbles: this.db.prepare('SELECT * FROM scrobbles').all(),events:this.db.prepare('SELECT * FROM events').all() }; }
  importHistory(data) {
    if(data.version!==1||!['sessions','intervals','scrobbles','events'].every(key=>Array.isArray(data[key])&&data[key].length<=100000))throw new Error('Select a supported Riffify JSON history export');
    const text=(value,max=1000)=>{if(typeof value!=='string'||value.length>max||value.includes('\0'))throw new Error('Invalid history text');return value;};
    const integer=value=>{if(!Number.isSafeInteger(value)||value<0||value>8640000000000000)throw new Error('Invalid history number');return value;};
    const insert=(table,columns,row)=>{const previous=this.db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(row[0]);if(previous){if(columns.some((key,i)=>previous[key]!==row[i]))throw new Error('History ID conflicts with an existing record');return;}this.db.prepare(`INSERT INTO ${table}(${columns.join(',')}) VALUES(${columns.map(()=>'?').join(',')})`).run(...row);};
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for(const s of data.sessions){if(!['spotify','youtube','ytmusic','soundcloud','local'].includes(s.provider)||![0,1].includes(s.qualified))throw new Error('Invalid history session');const numbers=['started','ended','duration','measured'].map(key=>integer(s[key]));insert('sessions',['id','provider','track_id','title','artist','album','started','ended','duration','measured','qualified','context'],[text(s.id,128),s.provider,text(s.track_id),text(s.title),text(s.artist),text(s.album),...numbers,s.qualified,text(s.context||'')]);}
      for(const i of data.intervals){if(i.ended<=i.started||i.ms>i.ended-i.started)throw new Error('Invalid history interval');insert('intervals',['id','session_id','started','ended','ms'],[text(i.id,128),text(i.session_id,128),integer(i.started),integer(i.ended),integer(i.ms)]);}
      for(const s of data.scrobbles){if(!/^[\w-]{1,64}$/.test(s.username))throw new Error('Invalid history username');const raw=text(s.raw,32768);JSON.parse(raw);insert('scrobbles',['id','username','timestamp','title','artist','album','mbid','raw','batch','matched_session'],[text(s.id,128),s.username,integer(s.timestamp),text(s.title),text(s.artist),text(s.album||''),text(s.mbid||''),raw,text(s.batch),s.matched_session==null?null:text(s.matched_session,128)]);}
      for(const e of data.events){const metadata=text(e.metadata,32768);JSON.parse(metadata);insert('events',['id','session_id','timestamp','kind','metadata'],[text(e.id,128),text(e.session_id,128),integer(e.timestamp),text(e.kind,32),metadata]);}
      this.db.exec('COMMIT');
    } catch(error){this.db.exec('ROLLBACK');throw error;}
    return {imported:true};
  }
  clear() { this.active = null; this.last = null; this.db.exec('DELETE FROM intervals; DELETE FROM scrobbles; DELETE FROM events; DELETE FROM sessions; DELETE FROM state;DELETE FROM durations;'); }
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
  async enrichDurations(limit=100) {
    if(!this.config.apiKey)throw new Error('Configure your own Last.fm API key first');
    const rows=this.ledger.db.prepare('SELECT artist,title FROM scrobbles WHERE username=? GROUP BY artist,title').all(this.config.username);
    let resolved=0;
    for(const row of rows) {
      const key=durationKey(row.artist,row.title);
      if(this.ledger.db.prepare('SELECT 1 FROM durations WHERE key=?').get(key))continue;
      const response=await this.api('track.getInfo',{artist:row.artist,track:row.title,autocorrect:'0'});
      const t=response.track,ms=Number(t?.duration);
      if(t && comparisonKey(t.name)===comparisonKey(row.title) && comparisonKey(t.artist?.name)===comparisonKey(row.artist))this.ledger.db.prepare('INSERT OR REPLACE INTO durations VALUES(?,?,?,?)').run(key,Number.isFinite(ms)&&ms>0?ms:0,'Last.fm track.getInfo',Date.now());
      resolved++;if(resolved>=limit)break;await new Promise(resolve=>setTimeout(resolve,350));
    }
    return {resolved,remaining:rows.length-Number(this.ledger.db.prepare('SELECT COUNT(*) n FROM durations').get().n)};
  }
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
