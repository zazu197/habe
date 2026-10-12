import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startCompanion } from '../companion/server.mjs';
test('real companion rejects missing token, hostile Origin and unsafe operations; serves authentic UI',async()=>{
  const data=mkdtempSync(path.join(os.tmpdir(),'riffify-check-'));
  const config={token:'a'.repeat(64),port:38473,username:'zazafent',timezone:'Europe/Stockholm',apiKey:'',tracking:true};
  const app=await startCompanion({port:0,data,config}), base=`http://127.0.0.1:${app.server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/api/library`)).status,401);
    const paired=`${base}/session/${config.token}`;
    assert.equal((await fetch(`${paired}/api/riffify/config`,{headers:{Origin:'https://evil.test'}})).status,403);
    assert.equal((await fetch(`${paired}/api/tools-install`,{method:'POST'})).status,403);
    assert.equal((await fetch(`${paired}/ui/server.js`)).status,404);
    const ui=await fetch(`${paired}/ui/`);assert.equal(ui.status,200);assert.match(await ui.text(),/platform-spotify/);
    const settings=await(await fetch(`${paired}/api/riffify/config`)).json();assert.equal(settings.username,'zazafent');assert.equal('token' in settings,false);assert.equal('apiKey' in settings,false);
    assert.equal((await fetch(`${paired}/api/translate`,{method:'POST',body:JSON.stringify({texts:[null]})})).status,400);
    assert.equal((await fetch(`${paired}/api/riffify/stats?period=all`)).status,200);
    const upload=await fetch(`${paired}/api/riffify/import?name=test.wav`,{method:'POST',body:Buffer.alloc(100)});const item=await upload.json();assert.equal(upload.status,200);
    const added=await fetch(`${paired}/api/library-add`,{method:'POST',body:JSON.stringify({items:[item]})});assert.equal(added.status,200);
    const media=`${paired}/api/library-file?id=${item.id}`;
    const range=await fetch(media,{headers:{Range:'bytes=0-9'}});assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,10);
    assert.equal((await fetch(media,{headers:{Range:'bytes=1000-2000'}})).status,416);
  } finally { await app.close();rmSync(data,{recursive:true,force:true}); }
});
