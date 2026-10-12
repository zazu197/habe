import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { randomBytes, createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, realpathSync, createReadStream, createWriteStream, statSync, renameSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { equalToken, safePath, mediaUrl, readJson } from './security.mjs';
import { Ledger, LastFmSync } from './history.mjs';
import { Downloads } from './downloads.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const dataDir = process.env.RIFFIFY_DATA_DIR || path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.local', 'share'), 'Riffify');
mkdirSync(dataDir, { recursive: true });
const configFile = path.join(dataDir, 'connection.json');
export function configuration() {
  if (!existsSync(configFile)) writeFileSync(configFile, JSON.stringify({ token: randomBytes(32).toString('hex'), port: 38473, username:'zazafent', timezone:'Europe/Stockholm', apiKey:'', tracking:true }, null, 2), { mode:0o600 });
  const config = JSON.parse(readFileSync(configFile, 'utf8'));
  if (!/^[a-f0-9]{64}$/.test(config.token) || !Number.isInteger(config.port) || config.port < 1024 || config.port > 65535) throw new Error('Invalid local connection configuration');
  return config;
}
const json = (res, value, status = 200) => { res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml', '.woff':'font/woff', '.ttf':'font/ttf', '.mp3':'audio/mpeg', '.m4a':'audio/mp4', '.flac':'audio/flac', '.wav':'audio/wav', '.ogg':'audio/ogg', '.opus':'audio/ogg', '.mp4':'video/mp4', '.webm':'video/webm' };
function serveFile(req, res, file) {
  const size = statSync(file).size;
  let start=0, end=size-1, status=200;
  if (req.headers.range) {
    const m = req.headers.range.match(/^bytes=(\d*)-(\d*)$/);
    if (!m || !m[1] && !m[2]) { res.writeHead(416,{'Content-Range':`bytes */${size}`}); return res.end(); }
    start = m[1] ? Number(m[1]) : Math.max(0,size-Number(m[2])); end = m[1] && m[2] ? Number(m[2]) : size-1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start>end || start>=size || end>=size) { res.writeHead(416,{'Content-Range':`bytes */${size}`}); return res.end(); }
    status=206;
  }
  res.writeHead(status, { 'Content-Type':mime[path.extname(file)] || 'application/octet-stream', 'Content-Length':Math.max(0,end-start+1), 'Accept-Ranges':'bytes', ...(status===206 ? {'Content-Range':`bytes ${start}-${end}/${size}`} : {}) });
  if (req.method==='HEAD' || !size) return res.end();
  const stream = createReadStream(file,{start,end}); stream.on('error',()=>res.destroy()); stream.pipe(res);
}
function trustedImage(value) {
  if (!value) return true;
  try { const u=new URL(value); return u.protocol==='https:' && !u.username && !u.password && !u.port && ['i.ytimg.com','i.scdn.co','lh3.googleusercontent.com','lastfm.freetls.fastly.net'].includes(u.hostname) || u.protocol==='https:' && u.hostname.endsWith('.sndcdn.com'); } catch { return false; }
}
async function audioProxy(req,res,value,redirects=0) {
  const u=new URL(value);
  if (u.protocol!=='https:' || u.username || u.password || u.port || !['.googlevideo.com','.sndcdn.com'].some(s=>u.hostname.endsWith(s)) || redirects>4) throw new Error('Media host not allowed');
  const addresses=await dns.lookup(u.hostname,{all:true,family:4});
  if (!addresses.length || addresses.some(x=>/^(0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(x.address))) throw new Error('Private media address blocked');
  await new Promise((resolve,reject)=>{
    const upstream=https.get(u,{headers:{...(req.headers.range?{Range:req.headers.range}:{}),'User-Agent':'Riffify/0.1'},lookup:(_host,_options,callback)=>callback(null,addresses[0].address,4),timeout:20000}, response=>{
      if ([301,302,303,307,308].includes(response.statusCode)) { response.resume(); audioProxy(req,res,new URL(response.headers.location,u).href,redirects+1).then(resolve,reject); return; }
      res.writeHead(response.statusCode,{'Content-Type':response.headers['content-type']||'application/octet-stream',...(response.headers['content-length']?{'Content-Length':response.headers['content-length']}:{}),...(response.headers['content-range']?{'Content-Range':response.headers['content-range']}:{}),'Accept-Ranges':'bytes'});
      response.pipe(res); response.on('end',resolve); response.on('error',reject);
    }); upstream.on('error',reject); upstream.on('timeout',()=>upstream.destroy(new Error('Media proxy timed out'))); req.on('close',()=>upstream.destroy());
  });
}

export async function startCompanion({ port, config = configuration(), data = dataDir } = {}) {
  if (!existsSync(path.join(root,'dist/ui/index.html'))) throw new Error('Run npm run build before starting companion');
  mkdirSync(data,{recursive:true}); process.env.RIFF_DATA_DIR=data;
  const require=createRequire(import.meta.url), backend=require('../dist/ui/server.js'), platform=require('../dist/ui/platform.js');
  const ledger=new Ledger(path.join(data,'history.sqlite')); ledger.tracking=config.tracking;
  const sync=new LastFmSync(ledger,config), downloads=new Downloads(path.join(data,'downloads'),platform.ytDlpCommand);
  let syncPaused=false;
  const periodic=setInterval(()=>{ if(config.apiKey && !sync.status.running && !syncPaused) sync.run(); },10*60*1000); periodic.unref();
  const allowedGet=new Set(['/api/search','/api/artist','/api/check-cache','/api/stream-info','/api/local-track','/api/library','/api/library-file','/api/local-thumbnail','/api/offline-library','/api/lyrics','/api/tools-status']);
  const allowedPost=new Set(['/api/state','/api/library-add','/api/library-update','/api/library-remove','/api/save-custom-lyrics','/api/track-analysis','/api/vibe','/api/translate','/api/offline-delete','/api/clear-offline-library']);
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Referrer-Policy','no-referrer'); res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('Cache-Control','no-store');
    res.setHeader('Content-Security-Policy', "frame-ancestors https://xpui.app.spotify.com http://127.0.0.1:*; object-src 'none'; base-uri 'self'");
    try {
      const origin=req.headers.origin, own=`http://127.0.0.1:${server.address()?.port}`;
      if (req.headers.host!==`127.0.0.1:${server.address()?.port}`) return json(res,{error:'Invalid Host'},403);
      if (origin && ![own,'https://xpui.app.spotify.com'].includes(origin)) return json(res,{error:'Origin denied'},403);
      const u=new URL(req.url,own), match=u.pathname.match(/^\/session\/([^/]+)(\/.*)$/);
      if (!match || !equalToken(match[1],config.token)) return json(res,{error:'Pair Riffify with install:spotify'},401);
      if (origin) res.setHeader('Access-Control-Allow-Origin',origin);
      res.setHeader('Vary','Origin'); res.setHeader('Access-Control-Allow-Headers','Content-Type'); res.setHeader('Access-Control-Allow-Methods','GET,POST,DELETE,OPTIONS');
      if(req.method==='OPTIONS') { res.writeHead(204); return res.end(); }
      const route=match[2];
      if(route.startsWith('/ui/') && ['GET','HEAD'].includes(req.method)) {
        const ui=path.join(root,'dist/ui'); const file=safePath(ui,decodeURIComponent(route.slice(4)||'index.html'));
        if (['server.js','platform.js','tools.js','setup-tools.js'].includes(path.basename(file))) return json(res,{error:'Backend file not served'},404);
        if (!realpathSync(file).startsWith(realpathSync(ui)+path.sep)) throw new Error('Invalid asset'); return serveFile(req,res,file);
      }
      if(route.startsWith('/api/riffify/')) {
        const endpoint=route.slice(13);
        if(endpoint==='config' && req.method==='GET') return json(res,{username:config.username,timezone:config.timezone,hasKey:!!config.apiKey,tracking:ledger.tracking});
        if(endpoint==='config' && req.method==='POST') {
          const body=await readJson(req);
          if(sync.status.running && ('username' in body || 'apiKey' in body)) throw new Error('Pause sync before changing account/key');
          if('username' in body) { if(!/^[\w-]{1,64}$/.test(body.username)) throw new Error('Invalid username'); config.username=body.username; }
          if('apiKey' in body) { if(typeof body.apiKey!=='string' || body.apiKey.length>128 || /[^a-zA-Z0-9]/.test(body.apiKey)) throw new Error('Invalid API key'); config.apiKey=body.apiKey; }
          if('timezone' in body) { new Intl.DateTimeFormat('en',{timeZone:body.timezone}); config.timezone=body.timezone; }
          if('tracking' in body) { if(typeof body.tracking!=='boolean') throw new Error('Invalid tracking setting'); ledger.tracking=body.tracking; config.tracking=body.tracking; ledger.last=null; }
          writeFileSync(configFile+'.tmp',JSON.stringify(config,null,2),{mode:0o600}); renameSync(configFile+'.tmp',configFile); return json(res,{saved:true});
        }
        if(endpoint==='sample' && req.method==='POST') { const body=await readJson(req,16384); if (typeof body.playing!=='boolean') throw new Error('Invalid playing state'); ledger.sample(body); return json(res,{saved:true}); }
        if(endpoint==='stats' && req.method==='GET') return json(res,ledger.stats({...Object.fromEntries(u.searchParams),username:config.username,timezone:u.searchParams.get('timezone')||config.timezone}));
        if(endpoint==='export' && req.method==='GET') return json(res,ledger.export());
        if(endpoint==='history' && req.method==='DELETE') { const body=await readJson(req); if(body.confirm!==true || sync.status.running) throw new Error('Pause sync and confirm deletion first'); ledger.clear(); return json(res,{deleted:true}); }
        if(endpoint==='sync' && req.method==='GET') return json(res,sync.status);
        if(endpoint==='sync' && req.method==='POST') { syncPaused=false; sync.run(); return json(res,{started:true}); }
        if(endpoint==='sync/pause' && req.method==='POST') { syncPaused=true; sync.stop(); return json(res,{paused:true}); }
        if(endpoint==='rankings' && req.method==='GET') return json(res,await sync.rankings(u.searchParams.get('kind'),u.searchParams.get('period')||'overall'));
        if(endpoint==='formats' && req.method==='GET') return json(res,await downloads.formats(u.searchParams.get('url')));
        if(endpoint==='downloads' && req.method==='GET') return json(res,downloads.list());
        if(endpoint==='downloads' && req.method==='POST') {
          const body=await readJson(req);if(body.authorized!==true)throw new Error('Confirm download rights and source permission');
          const available=await downloads.formats(body.url), selected=available.formats.find(f=>f.id===body.format);
          if(!selected || body.kind==='video'&&!selected.video || body.kind==='audio'&&(!selected.audio||selected.video))throw new Error('Selected format is unavailable for this media type');
          if(body.kind==='video'&&!selected.audio)body.format+='+bestaudio';
          return json(res,downloads.create(body));
        }
        const job=endpoint.match(/^downloads\/([a-f0-9-]{36})\/(cancel|retry|file)$/);
        if(job && job[2]==='file' && req.method==='GET') return serveFile(req,res,downloads.file(job[1],u.searchParams.get('name')));
        if(job && ['cancel','retry'].includes(job[2]) && req.method==='POST') { downloads[job[2]](job[1]); return json(res,{ok:true}); }
        if(endpoint==='import' && req.method==='POST') {
          const name=u.searchParams.get('name')||'', ext=path.extname(name).slice(1).toLowerCase();
          if(!['mp3','m4a','flac','wav','ogg','opus'].includes(ext)) throw new Error('Unsupported local audio format');
          const id='local_'+randomBytes(6).toString('hex'), file=`${id}.${ext}`, dest=safePath(platform.LIBRARY_DIR,file);
          let size=0; req.on('data',chunk=>{size+=chunk.length;if(size>100*1024*1024)req.destroy();});
          await pipeline(req,createWriteStream(dest,{flags:'wx'})); return json(res,{id,file,ext,name:path.basename(name,`.${ext}`)});
        }
        return json(res,{error:'Unsupported companion operation'},404);
      }
      if(route==='/api/audio-proxy' && req.method==='GET') return await audioProxy(req,res,u.searchParams.get('url'));
      if(!(req.method==='GET' && allowedGet.has(route) || req.method==='POST' && allowedPost.has(route))) return json(res,{error:'Operation unavailable in Spotify companion'},403);
      if(['search','stream-info'].some(x=>route===`/api/${x}`)) {
        const provider=u.searchParams.get('platform')||'youtube'; if(!['youtube','ytmusic','soundcloud'].includes(provider)) throw new Error('Invalid media provider');
      }
      if(u.searchParams.has('url') && route==='/api/stream-info') u.searchParams.set('url',mediaUrl(u.searchParams.get('url')));
      if(!trustedImage(u.searchParams.get('thumbnail'))) throw new Error('Untrusted artwork host');
      if(u.searchParams.get('q')?.length>300) throw new Error('Search too long');
      if(u.searchParams.has('limit')) u.searchParams.set('limit',String(Math.min(50,Math.max(1,Number(u.searchParams.get('limit'))||20))));
      if(u.searchParams.has('id') && !/^[\w-]{1,128}$/.test(u.searchParams.get('id'))) throw new Error('Invalid local track ID');
      if(req.method==='GET' && ['/api/library-file','/api/local-track','/api/local-thumbnail'].includes(route)) {
        const id=u.searchParams.get('id')||'';
        if(route==='/api/library-file') { const index=JSON.parse(readFileSync(platform.LIBRARY_PATH,'utf8'));const item=index[id];if(!item || !/^local_[a-f0-9]{12}\.[a-z0-9]+$/.test(item.file||''))throw new Error('Unknown library file');return serveFile(req,res,safePath(platform.LIBRARY_DIR,item.file)); }
        if(route==='/api/local-thumbnail')return serveFile(req,res,safePath(platform.THUMBNAILS_DIR,`${id}.jpg`));
        const file=['opus','webm','m4a','mp3'].map(ext=>safePath(platform.CACHE_DIR,`${id}.${ext}`)).find(existsSync);if(!file)throw new Error('Track is not cached');return serveFile(req,res,file);
      }
      if(req.headers.range && !/^bytes=\d+-\d*$/.test(req.headers.range)) return json(res,{error:'Invalid media range'},416);
      if(req.method==='POST') {
        const body=await readJson(req);
        if(route==='/api/translate' && (!Array.isArray(body.texts || body.lines) || !(body.texts || body.lines).every(x=>typeof x==='string' && x.length<5000))) throw new Error('Translation requires a list of strings');
        if(route==='/api/library-add' && (!Array.isArray(body.items) || body.items.length>100 || body.items.some(x=>typeof x.name!=='string' || !/^local_[a-f0-9]{12}$/.test(x.id||''))))throw new Error('Invalid local import');
        const replay=Readable.from([Buffer.from(JSON.stringify(body))]); replay.headers=req.headers;replay.url=route+u.search;replay.method=req.method;replay.socket=req.socket;
        return await backend.handler(replay,res);
      }
      req.url=route+u.search; return await backend.handler(req,res);
    } catch(error) { if(!res.headersSent) json(res,{error:error.code==='ENOENT'?'File not found':String(error.message).replace(/api_key=[^&\s]+/gi,'api_key=[redacted]')},400); else res.destroy(); }
  });
  server.requestTimeout=30000; server.headersTimeout=10000; server.maxConnections=32;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port??Number(process.env.RIFFIFY_PORT||config.port),'127.0.0.1',resolve);});
  const close=async()=>{clearInterval(periodic);sync.stop();downloads.close();await new Promise(resolve=>server.close(resolve));ledger.close();};
  return {server,ledger,sync,downloads,close,config};
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const app=await startCompanion(); console.log(`Riffify companion listening on 127.0.0.1:${app.server.address().port}. Pairing token stays in local user configuration.`);
  for(const event of ['SIGINT','SIGTERM'])process.on(event,async()=>{await app.close();process.exit(0);});
}
