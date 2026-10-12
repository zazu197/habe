import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readdirSync, rmSync, existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import { mediaUrl, safePath } from './security.mjs';

export class Downloads {
  constructor(root, command) {
    this.root = root; this.command = command; this.jobs = new Map(); mkdirSync(root, { recursive: true });this.journal=path.join(root,'jobs.json');
    if(existsSync(this.journal))for(const job of JSON.parse(readFileSync(this.journal,'utf8'))) { if(!/^[a-f0-9-]{36}$/.test(job.id))continue;if(['queued','running'].includes(job.state)){job.state='failed';job.error='Companion stopped; retry to resume';}this.jobs.set(job.id,job); }
  }
  save() { writeFileSync(this.journal+'.tmp',JSON.stringify(this.list()));renameSync(this.journal+'.tmp',this.journal); }
  run(args, onLine = () => {}, timeout = 30000) {
    const cmd = this.command(['--no-config', '--no-warnings', '--socket-timeout', '15', ...args]);
    const proc = spawn(cmd.bin, cmd.args, { windowsHide: true, shell: false });
    let text = '', error = '', pending = '';
    const promise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { proc.kill(); reject(new Error('Media tool timed out')); }, timeout);
      proc.stdout.on('data', chunk => {
        text += chunk; pending += chunk;
        if (text.length > 8 * 1024 * 1024) { proc.kill(); reject(new Error('Media response too large')); }
        const lines = pending.split(/\r?\n/); pending = lines.pop(); for (const line of lines) onLine(line);
      });
      proc.stderr.on('data', chunk => { error = (error + chunk).slice(-4000); });
      proc.on('error', () => { clearTimeout(timer); reject(new Error('Media tool could not start; configure yt-dlp and FFmpeg')); });
      proc.on('close', code => { clearTimeout(timer); if (pending) onLine(pending); code === 0 ? resolve(text) : reject(new Error(`Media tool exited ${code}: ${error.replace(/https?:\/\/\S+/g, '[source URL]')}`)); });
    });
    return { proc, promise };
  }
  async formats(value,{playlist=false}={}) {
    const url = mediaUrl(value,{playlist});
    let query=url, playlistCount=null;
    if(playlist) {const {promise}=this.run(['--flat-playlist','--playlist-end','100','--skip-download','--dump-single-json','--',url]);const listing=JSON.parse(await promise);playlistCount=listing.entries?.length||0;const first=listing.entries?.[0];if(!first?.id || !/^[\w-]{11}$/.test(first.id))throw new Error('Playlist has no accessible videos');query=`https://www.youtube.com/watch?v=${first.id}`;}
    const { promise } = this.run(['--no-playlist', '--skip-download', '--dump-single-json', '--', query]);
    const info = JSON.parse(await promise);
    return { url, title: String(info.title || ''), playlistCount,formats: (info.formats || []).filter(f => f.url && (f.vcodec !== 'none' || f.acodec !== 'none')).map(f => ({ id: String(f.format_id), ext: f.ext, height: f.height || null, audio: f.acodec !== 'none', video: f.vcodec !== 'none', size: f.filesize || f.filesize_approx || null })) };
  }
  create(input) {
    if (input.authorized !== true) throw new Error('Confirm your rights and source permission before saving media');
    const url = mediaUrl(input.url, { playlist: input.playlist === true });
    if (!['audio', 'video'].includes(input.kind)) throw new Error('Select Save audio or Save video');
    if (!/^\w[\w+.-]{0,79}$/.test(input.format || '')) throw new Error('Select an available format');
    if ([...this.jobs.values()].filter(j => ['queued', 'running'].includes(j.state)).length >= 20) throw new Error('Download queue is full');
    const filename = String(input.filename || 'media').normalize('NFKC').replace(/[<>:"/\\|?*\x00-\x1f%]/g, '_').replace(/[. ]+$/, '').slice(0, 100);
    if (!filename || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(filename)) throw new Error('Invalid filename');
    const id = randomUUID(), destination=String(input.destination||'').trim();if(destination && (!/^[\w -]{1,80}$/.test(destination)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(destination)))throw new Error('Destination must be a safe folder name inside private downloads');
    if(!['source','m4a','mp3','flac','opus'].includes(input.conversion||'m4a'))throw new Error('Unsupported audio conversion');
    const job = { id, url, kind: input.kind, format: input.format, filename, destination,conversion:input.conversion||'m4a',playlist: input.playlist === true, metadata: input.metadata === true, state: 'queued', percent: 0, speed: null, eta: null, error: '' };
    this.jobs.set(id, job); this.save(); this.pump(); return this.public(job);
  }
  public(job) { const { proc, ...data } = job; return data; }
  list() { return [...this.jobs.values()].map(j => this.public(j)); }
  pump() {
    if ([...this.jobs.values()].some(j => j.proc)) return;
    const job = [...this.jobs.values()].find(j => j.state === 'queued'); if (!job) return;
    job.state = 'running'; this.save();
    let dir;
    try {dir=this.directory(job);mkdirSync(dir,{recursive:true});}catch(error){job.state='failed';job.error='Could not prepare download destination: '+error.message;this.save();this.pump();return;}
    const args = ['--newline', '--no-overwrites', '--restrict-filenames', '--max-filesize', '2G', '--playlist-end', '100', '--paths', dir,
      '-o', `${job.filename}-%(id)s.%(ext)s`, '--progress-template', 'download:RIFFIFY:%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s', '-f', job.format];
    args.push(job.playlist ? '--yes-playlist' : '--no-playlist');
    if (job.kind === 'audio' && job.conversion!=='source') args.push('-x', '--audio-format', job.conversion);
    if (job.metadata) args.push('--embed-metadata', '--embed-thumbnail');
    args.push('--', job.url);
    try {
      const { proc, promise } = this.run(args, line => {
        if (line.startsWith('RIFFIFY:')) { const [percent, speed, eta] = line.slice(8).split('|'); job.percent = parseFloat(percent) || 0; job.speed = speed?.trim() || null; job.eta = eta?.trim() || null; }
      }, 30 * 60 * 1000);
      job.proc = proc;
      promise.then(() => {
        if (job.state !== 'canceled') { job.files = readdirSync(dir).filter(f => !/\.(part|ytdl|temp)$/.test(f)); job.state = job.files.length ? 'completed' : 'failed'; job.percent = job.files.length ? 100 : job.percent; }
      }).catch(error => { if (job.state !== 'canceled') { job.state = 'failed'; job.error = error.message; } })
        .finally(() => { delete job.proc; for (const file of readdirSync(dir)) if (/\.(part|ytdl|temp)$/.test(file)) rmSync(safePath(dir, file)); this.save(); this.pump(); });
    } catch (error) { job.state = 'failed'; job.error = error.message; this.pump(); }
  }
  cancel(id) { const job = this.jobs.get(id); if (!job) throw new Error('Unknown download'); if (['queued', 'running'].includes(job.state)) { job.state = 'canceled'; job.proc?.kill(); } this.save(); this.pump(); }
  retry(id) { const job = this.jobs.get(id); if (!job || job.proc || !['failed', 'canceled'].includes(job.state)) throw new Error('Wait for download to stop before retrying'); job.state = 'queued'; job.error = ''; this.pump(); }
  directory(job) {const base=job.destination?safePath(this.root,job.destination):this.root;return safePath(base,job.id);}
  file(id, name) { const job = this.jobs.get(id); if (!job || job.state !== 'completed' || !job.files.includes(name)) throw new Error('Unknown completed file'); const file = safePath(this.directory(job), name); if (!existsSync(file)) throw new Error('File no longer exists'); return file; }
  close() { for (const job of this.jobs.values()) job.proc?.kill(); }
}
