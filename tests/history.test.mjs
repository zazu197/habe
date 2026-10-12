import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Ledger, LastFmSync, periodBounds, qualifies,durationKey } from '../companion/history.mjs';
const track={id:'spotify:track:0123456789012345678901',platform:'spotify',title:'Song (Live)',artist:'Artist',album:'Album',duration:120};
const scrobble=(seconds,title=track.title)=>({name:title,artist:{'#text':'Artist'},album:{'#text':'Album'},date:{uts:String(seconds)}});

test('schema upgrade backs up the previous database and preserves history',()=>{
  const folder=mkdtempSync(path.join(tmpdir(),'riffify-migration-')),file=path.join(folder,'history.sqlite');
  try {
    const original=new Ledger(file);original.importScrobbles('zazafent',[scrobble(1700000000)],'old');original.db.exec('PRAGMA user_version=2');original.close();
    const upgraded=new Ledger(file);assert.equal(upgraded.db.prepare('PRAGMA user_version').get().user_version,3);assert.equal(upgraded.stats({period:'all'}).scrobbles,1);upgraded.close();
    assert.equal(existsSync(file+'.before-schema-3.sqlite'),true);const backup=new DatabaseSync(file+'.before-schema-3.sqlite',{readOnly:true});assert.equal(backup.prepare('PRAGMA user_version').get().user_version,2);assert.equal(backup.prepare('SELECT COUNT(*) n FROM scrobbles').get().n,1);backup.close();
  } finally {rmSync(folder,{recursive:true,force:true});}
});

test('history export imports once and rejects malformed records without partial writes',()=>{
  const source=new Ledger(':memory:'),target=new Ledger(':memory:');
  try {
    for(let i=0;i<=60;i++)source.sample({track,position:i*1000,playing:true},i*1000,1700000000000+i*1000);
    source.importScrobbles('zazafent',[scrobble(1700000000)],'export');const data=source.export();target.importHistory(data);target.importHistory(data);
    assert.equal(target.stats({period:'all'}).plays,1);assert.equal(target.stats({period:'all'}).measured,60000);
    const invalid=structuredClone(data);invalid.sessions[0].id='new-session';invalid.intervals[0].session_id='missing-session';
    assert.throws(()=>target.importHistory(invalid));assert.equal(target.db.prepare('SELECT COUNT(*) n FROM sessions').get().n,1);
  } finally {source.close();target.close();}
});

test('history import preserves monotonic listening across wall-clock corrections',()=>{
  const source=new Ledger(':memory:'),target=new Ledger(':memory:');
  try {source.sample({track,position:0,playing:true},0,1700000000000);source.sample({track,position:1000,playing:true},1000,1700000000500);target.importHistory(source.export());assert.equal(target.stats({period:'all'}).measured,1000);}
  finally {source.close();target.close();}
});

test('active time, pauses, seeks, duplicate events and qualification',()=>{
  const ledger=new Ledger(':memory:');
  for(let i=0;i<=60;i++)ledger.sample({track,position:i*1000,playing:true},i*1000,1700000000000+i*1000);
  ledger.sample({track,position:60000,playing:false},61000,1700000061000);
  ledger.sample({track,position:60000,playing:false},1861000,1700001861000);
  ledger.sample({track,position:110000,playing:true},1862000,1700001862000);
  ledger.sample({track,position:110000,playing:true},1862000,1700001862000);
  const stats=ledger.stats({period:'all',now:1700002000000});assert.equal(stats.measured,60000);assert.equal(stats.plays,1);assert.equal(stats.daily.reduce((n,d)=>n+d.plays,0),1);assert.equal(ledger.db.prepare('SELECT COUNT(*) n FROM intervals').get().n,1);assert.equal(qualifies(20000,120000),false);ledger.close();
});
test('Last.fm imports exclude now playing, deduplicate overlaps, preserve repeats and editions',()=>{
  const ledger=new Ledger(':memory:');
  const rows=[scrobble(1700000000),scrobble(1700000300),scrobble(1700000600,'Song (Studio)'),{...scrobble(1700000700),'@attr':{nowplaying:'true'}}];
  assert.equal(ledger.importScrobbles('zazafent',rows,'first'),3);assert.equal(ledger.importScrobbles('zazafent',rows,'second'),0);
  const all=ledger.stats({period:'all',now:1700001000000});assert.equal(all.scrobbles,3);assert.equal(all.tracks.length,2);assert.equal(all.measured,0);assert.equal(all.estimated,null);
  assert.equal(ledger.stats({period:'all',scope:'spotify',now:1700001000000}).scrobbles,0);ledger.close();
});
test('local and Last.fm evidence represent one listen',()=>{
  const ledger=new Ledger(':memory:');for(let i=0;i<=60;i++)ledger.sample({track,position:i*1000,playing:true},i*1000,1700000000000+i*1000);
  ledger.importScrobbles('zazafent',[scrobble(1700000000)],'batch');const s=ledger.stats({period:'all',now:1700001000000});assert.equal(s.scrobbles,1);assert.equal(s.plays,1);assert.equal(s.measured,60000);assert.equal(ledger.stats({period:'all',scope:'spotify',now:1700001000000}).scrobbles,1);ledger.close();
});
test('DST uses calendar days, ISO weeks, month/year boundaries',()=>{
  const spring=periodBounds('today','Europe/Stockholm',Date.parse('2026-03-29T12:00:00Z'));assert.equal(spring[1]-spring[0],23*3600000);
  const fall=periodBounds('today','Europe/Stockholm',Date.parse('2026-10-25T12:00:00Z'));assert.equal(fall[1]-fall[0],25*3600000);
  const week=periodBounds('week','Europe/Stockholm',Date.parse('2026-01-01T12:00:00Z'));assert.equal(new Date(week[0]).toISOString(),'2025-12-28T23:00:00.000Z');
  const month=periodBounds('month','Europe/Stockholm',Date.parse('2026-12-31T12:00:00Z'));assert.equal(new Date(month[1]).toISOString(),'2026-12-31T23:00:00.000Z');
});
test('measured interval splits at midnight',()=>{
  const ledger=new Ledger(':memory:'), wall=Date.parse('2026-10-11T21:59:59Z');ledger.sample({track,position:0,playing:true},0,wall);ledger.sample({track,position:2000,playing:true},2000,wall+2000);
  const stats=ledger.stats({period:'today',now:wall+2000});assert.equal(stats.measured,1000);ledger.close();
});
test('Last.fm pagination fixes upper boundary, saves cursor and resumes',async()=>{
  const ledger=new Ledger(':memory:');let fail=true;const calls=[];
  const fetcher=async url=>{const u=new URL(url);calls.push(Object.fromEntries(u.searchParams));if(u.searchParams.get('method')==='user.getInfo')return{ok:true,json:async()=>({user:{name:'zazafent',playcount:'2'}})};
    const page=Number(u.searchParams.get('page'));if(page===2 && fail)return{ok:true,json:async()=>({error:6})};return{ok:true,json:async()=>({recenttracks:{'@attr':{page:String(page),totalPages:'2',total:'2'},track:[scrobble(1700000000+page*300)]}})};};
  const sync=new LastFmSync(ledger,{username:'zazafent',apiKey:'test'},fetcher);await sync.run();assert.equal(ledger.get('sync:zazafent').page,2);fail=false;await sync.run();assert.equal(ledger.get('sync:zazafent').complete,true);assert.equal(ledger.stats({period:'all'}).scrobbles,2);assert.equal(calls.filter(x=>x.method==='user.getRecentTracks').every(x=>x.limit==='200'),true);ledger.close();
});
test('MBID corrections update records without multiplying scrobbles',()=>{const ledger=new Ledger(':memory:');const first={...scrobble(1700000000),mbid:'01234567-0123-0123-0123-012345678901'};assert.equal(ledger.importScrobbles('zazafent',[first],'a'),1);assert.equal(ledger.importScrobbles('zazafent',[{...first,name:'Corrected title'}],'b'),0);assert.equal(ledger.stats({period:'all',now:1700001000000}).scrobbles,1);ledger.close();});
test('known historical durations remain estimates',()=>{const ledger=new Ledger(':memory:');ledger.importScrobbles('zazafent',[scrobble(1700000000)],'a');ledger.db.prepare('INSERT INTO durations VALUES(?,?,?,?)').run(durationKey('Artist','Song (Live)'),120000,'Last.fm',0);const stats=ledger.stats({period:'all',now:1700001000000});assert.equal(stats.estimated,120000);assert.equal(stats.measured,0);assert.equal(stats.missingDurations,0);ledger.close();});
test('adding MBID to existing import preserves event identity',()=>{const ledger=new Ledger(':memory:');const row=scrobble(1700000000);ledger.importScrobbles('zazafent',[row],'legacy');assert.equal(ledger.importScrobbles('zazafent',[{...row,mbid:'01234567-0123-0123-0123-012345678901'}],'updated'),0);assert.equal(ledger.stats({period:'all',now:1700001000000}).scrobbles,1);ledger.close();});
test('coalesced intervals split at local hour and count live discoveries',()=>{const ledger=new Ledger(':memory:'),wall=Date.parse('2026-10-12T08:59:59Z');for(let i=0;i<=60;i++)ledger.sample({track,position:i*1000,playing:true},i*1000,wall+i*1000);const stats=ledger.stats({period:'all',now:wall+61000});assert.equal(stats.hours[10],1000);assert.equal(stats.hours[11],59000);assert.equal(stats.firstRecordedArtists,1);ledger.close();});
