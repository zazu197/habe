import { timingSafeEqual } from 'node:crypto';
import path from 'node:path';

export function equalToken(value, token) {
  const a = Buffer.from(value || ''), b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function safePath(root, relative) {
  if (typeof relative !== 'string' || relative.includes('\0') || relative.includes('\\')) throw new Error('Invalid path');
  const resolved = path.resolve(root, relative);
  if (resolved !== root && !resolved.startsWith(path.resolve(root) + path.sep)) throw new Error('Path escapes allowed directory');
  return resolved;
}

export function mediaUrl(value, { playlist = false } = {}) {
  const u = new URL(value);
  if (u.protocol !== 'https:' || u.username || u.password || u.port) throw new Error('HTTPS media URL required');
  const youtube = ['www.youtube.com', 'youtube.com', 'music.youtube.com', 'youtu.be'].includes(u.hostname);
  const soundcloud = ['soundcloud.com', 'www.soundcloud.com'].includes(u.hostname);
  if (!youtube && !soundcloud) throw new Error('Only YouTube and SoundCloud URLs are supported');
  if (youtube) {
    const id = u.hostname === 'youtu.be' ? u.pathname.slice(1) : u.searchParams.get('v') || u.pathname.match(/^\/(?:shorts|embed)\/([^/]+)$/)?.[1];
    if (playlist && u.pathname === '/playlist' && /^[\w-]{10,100}$/.test(u.searchParams.get('list') || '')) return u.href;
    if (!/^[\w-]{11}$/.test(id || '')) throw new Error('Invalid YouTube video ID');
    return `https://www.youtube.com/watch?v=${id}`;
  }
  if (!/^\/[\w-]+\/[\w-]+\/?$/.test(u.pathname)) throw new Error('Invalid SoundCloud track URL');
  return `https://soundcloud.com${u.pathname}`;
}

export async function readJson(req, max = 1024 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > max) throw new Error('Request body too large');
    chunks.push(chunk);
  }
  const result = JSON.parse(Buffer.concat(chunks).toString() || '{}');
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('JSON object required');
  return result;
}
