import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const require=createRequire(import.meta.url);
const platform=require('../dist/ui/platform.js');
const tools=require('../dist/ui/setup-tools.js');
const result=await tools.ensureTools();
if(!result.ytDlp || !result.ffmpeg)throw new Error(result.progress.error||'Media tools unavailable');
const entries=[];
for(const name of ['yt-dlp','ffmpeg']) {
  const file=platform.resolveBinary(name), run=spawnSync(file,[name==='ffmpeg'?'-version':'--version'],{encoding:'utf8',windowsHide:true});
  if(run.status!==0)throw new Error(`${name} could not start`);
  entries.push({name,path:file,version:run.stdout.split(/\r?\n/)[0],sha256:createHash('sha256').update(readFileSync(file)).digest('hex'),origin:file.startsWith(platform.BIN_DIR)?name==='yt-dlp'?'https://github.com/yt-dlp/yt-dlp/releases':'https://github.com/yt-dlp/FFmpeg-Builds/releases':'Existing user installation; upstream origin not verified'});
}
mkdirSync(platform.DATA_DIR,{recursive:true});writeFileSync(`${platform.DATA_DIR}/media-tools.json`,JSON.stringify(entries,null,2));
console.log(entries.map(x=>`${x.name}: ${x.version}`).join('\n'));
