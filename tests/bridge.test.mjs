import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
function runtime() {
  let clock=0,position=0;const messages=[],events=new Map(),listeners=new Map(),timers=[];const frame={postMessage:value=>messages.push(value)};
  const Player={origin:{},data:null,getProgress:()=>position,getDuration:()=>120000,getVolume:()=>.5,getShuffle:()=>false,getRepeat:()=>0,
    playUri:async uri=>{Player.data={item:{uri,metadata:{title:'Song',artist_name:'Artist',duration:'120000'}},isPaused:false};},pause:()=>{if(Player.data)Player.data.isPaused=true;},
    addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:()=>{}};
  const window={RiffifyConnection:{origin:'http://127.0.0.1:38473',token:'fixture'},RiffifyFrame:{contentWindow:frame},
    Spicetify:{Player,Platform:{LibraryAPI:{},History:{push:()=>{}}},CosmosAsync:{get:async()=>({tracks:{items:[]}})}},addEventListener:(name,fn)=>listeners.set(name,fn)};
  const context=vm.createContext({window,performance:{now:()=>clock},Date,console,setInterval:fn=>{timers.push(fn);return 1;},clearInterval:()=>{},setTimeout,clearTimeout,fetch:async()=>({ok:true}),AbortSignal});
  vm.runInContext(readFileSync('spicetify/bridge.js','utf8'),context);
  const send=async(method,args={},overrides={})=>listeners.get('message')({origin:window.RiffifyConnection.origin,source:frame,data:{riffify:1,id:1,method,args},...overrides});
  return {Player,messages,events,timers,send,cosmos:window.Spicetify.CosmosAsync,set:(time,progress)=>{clock=time;position=progress;}};
}
test('bridge starts without a current item and rejects wrong source/origin and malformed URI',async()=>{
  const r=runtime();assert.equal(r.events.has('songchange'),true);
  await r.send('play',{uri:'spotify:track:0123456789012345678901'},{origin:'https://evil.test'});assert.equal(r.Player.data,null);
  await r.send('play',{uri:'https://youtube.com/watch?v=abcdefghijk'});assert.match(r.messages.at(-1).error,/Invalid Spotify URI/);
  await r.send('search',{query:'niche recording'});assert.equal(r.messages.at(-1).value.success,true);
});
test('managed completion survives delayed progress polling and pauses native advancement',async()=>{
  const r=runtime(),uri='spotify:track:0123456789012345678901';await r.send('play',{uri,managed:true});
  r.set(1000,117000);await r.timers[0]();r.set(5000,0);r.Player.data.item.uri='spotify:track:1123456789012345678901';
  await r.events.get('songchange')();assert.equal(r.Player.data.isPaused,true);assert.equal(r.messages.some(m=>m.ended===uri),true);
});

test('playlist mutations use current user and item endpoints without source substitution',async()=>{
  const r=runtime(),calls=[],playlist='spotify:playlist:0123456789012345678901',uri='spotify:track:0123456789012345678901';
  r.cosmos.post=async(url,body)=>{calls.push({url,body});return {uri:playlist,name:'Private playlist'};};
  r.cosmos.del=async(url,body)=>{calls.push({url,body});return {snapshot_id:'new'};};
  await r.send('createPlaylist',{name:'Private playlist'});await r.send('addPlaylist',{playlist,uri});await r.send('removePlaylist',{playlist,uri});
  assert.equal(calls[0].url,'https://api.spotify.com/v1/me/playlists');assert.equal(calls[0].body.public,false);
  assert.equal(calls[1].url,'https://api.spotify.com/v1/playlists/0123456789012345678901/items');assert.equal(calls[1].body.uris[0],uri);
  assert.equal(calls[2].url,calls[1].url);assert.equal(calls[2].body.items[0].uri,uri);
});
