import { readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const roots=['companion','src','scripts','spicetify','tests'];
let count=0;
for(const root of roots)for(const file of readdirSync(root))if(/\.(mjs|js)$/.test(file)) {
  const name=path.join(root,file); if(file==='integration.js')continue;
  const result=spawnSync(process.execPath,['--check',name],{encoding:'utf8'});if(result.status!==0)throw new Error(result.stderr);count++;
}
for(const file of ['dist/ui/app.js','dist/ui/server.js','dist/ui/prelude.js','dist/spicetify/riffify/bridge.js']) {
  const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(result.status!==0)throw new Error(result.stderr);count++;
}
const html=readFileSync('dist/ui/index.html','utf8');
if(!html.includes('platform-spotify')||!html.includes('prelude.js'))throw new Error('UI patch missing');
console.log(`${count} JavaScript files parse; authentic UI hooks present.`);
