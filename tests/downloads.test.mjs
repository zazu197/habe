import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Downloads } from '../companion/downloads.mjs';
test('downloads require explicit authorization and bounded input',()=>{
  const root=mkdtempSync(path.join(os.tmpdir(),'riffify-download-')), downloads=new Downloads(root,()=>{throw new Error('Tool not installed');});
  try {
    const input={url:'https://youtu.be/abcdefghijk',kind:'video',format:'18',filename:'test'};
    assert.throws(()=>downloads.create(input),/Confirm/);assert.throws(()=>downloads.create({...input,authorized:true,format:'--exec'}),/format/);assert.throws(()=>downloads.create({...input,authorized:true,destination:'CON'}),/safe folder/);
    const job=downloads.create({...input,authorized:true});assert.equal(job.state,'failed');assert.match(job.error,/Tool not installed/);
    const restored=new Downloads(root,()=>{throw new Error('Tool not installed');});assert.equal(restored.list().length,1);
  } finally {downloads.close();rmSync(root,{recursive:true,force:true});}
});
test('cancel waits for old child exit before retry; command arguments stay bounded',async()=>{
  const root=mkdtempSync(path.join(os.tmpdir(),'riffify-cancel-'));let passed=[];
  const downloads=new Downloads(root,args=>{passed=args;return {bin:process.execPath,args:['-e','setTimeout(()=>{},5000)']};});
  try {
    const job=downloads.create({url:'https://youtu.be/abcdefghijk',kind:'video',format:'18',filename:'test',authorized:true});
    assert.equal(passed.includes('--no-config'),true);assert.equal(passed.at(-2),'--');assert.equal(passed.at(-1),'https://www.youtube.com/watch?v=abcdefghijk');
    downloads.cancel(job.id);assert.throws(()=>downloads.retry(job.id),/Wait/);
    const deadline=Date.now()+3000;while(downloads.jobs.get(job.id).proc && Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,20));
    assert.equal(downloads.jobs.get(job.id).proc,undefined);assert.equal(downloads.jobs.get(job.id).state,'canceled');
  } finally { downloads.close();rmSync(root,{recursive:true,force:true}); }
});
