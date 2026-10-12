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
    assert.throws(()=>downloads.create(input),/Confirm/);assert.throws(()=>downloads.create({...input,authorized:true,format:'--exec'}),/format/);
    const job=downloads.create({...input,authorized:true});assert.equal(job.state,'failed');assert.match(job.error,/Tool not installed/);
    const restored=new Downloads(root,()=>{throw new Error('Tool not installed');});assert.equal(restored.list().length,1);
  } finally {downloads.close();rmSync(root,{recursive:true,force:true});}
});
