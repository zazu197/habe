// Optional headless contract test. Fixture Spotify data is used only here, never in production.
import { readFileSync, mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { startCompanion } from '../companion/server.mjs';
const module=process.env.RIFFIFY_PLAYWRIGHT_MODULE;
const { chromium }=await import(module?pathToFileURL(module).href:'playwright');
const data=mkdtempSync(path.join(os.tmpdir(),'riffify-ui-'));
const config={token:'b'.repeat(64),port:38473,username:'zazafent',timezone:'Europe/Stockholm',apiKey:'',tracking:true};
const app=await startCompanion({port:0,data,config}),origin=`http://127.0.0.1:${app.server.address().port}`;
const browser=await chromium.launch({headless:true,...(process.env.RIFFIFY_BROWSER_CHANNEL?{channel:process.env.RIFFIFY_BROWSER_CHANNEL}:{})});
const errors=[],failures=[];
const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
page.on('pageerror',error=>errors.push(error.message));
page.on('requestfailed',request=>failures.push({url:request.url().replace(/\/session\/[a-f0-9]{64}/g,'/session/[redacted]'),error:request.failure()?.errorText}));
const bridge=readFileSync('spicetify/bridge.js','utf8');
const harness=`<!doctype html><style>body{margin:0}iframe{width:100vw;height:100vh;border:0}</style><script>
window.fixtureCalls=[];
const item={uri:'spotify:track:0123456789012345678901',metadata:{title:'Fixture track',artist_name:'Fixture artist',album_title:'Fixture album',duration:'120000'}};
window.RiffifyConnection=${JSON.stringify({origin,token:config.token})};
window.Spicetify={Player:{origin:{},data:{item,isPaused:true},getProgress:()=>0,getDuration:()=>120000,getVolume:()=>.5,getShuffle:()=>false,getRepeat:()=>0,
playUri:async uri=>{fixtureCalls.push(['play',uri]);Spicetify.Player.data.item={...item,uri};Spicetify.Player.data.isPaused=false;},pause:()=>{fixtureCalls.push(['pause']);Spicetify.Player.data.isPaused=true;},togglePlay:()=>{fixtureCalls.push(['toggle']);Spicetify.Player.data.isPaused=!Spicetify.Player.data.isPaused;},next:()=>fixtureCalls.push(['next']),back:()=>fixtureCalls.push(['previous']),seek:x=>fixtureCalls.push(['seek',x]),setVolume:x=>fixtureCalls.push(['volume',x]),setShuffle:x=>fixtureCalls.push(['shuffle',x]),setRepeat:x=>fixtureCalls.push(['repeat',x]),addEventListener:()=>{},removeEventListener:()=>{}},Platform:{History:{push:()=>{}},LibraryAPI:{getTracks:async()=>({items:[item]}),contains:async()=>[false],add:async()=>{},remove:async()=>{}},RootlistAPI:{getContents:async()=>({items:[{type:'playlist',name:'Fixture playlist',uri:'spotify:playlist:0123456789012345678901'}]})},PlaylistAPI:{getContents:async()=>({items:[item]})}},CosmosAsync:{get:async url=>url.includes('/search')?{tracks:{items:[item]}}:{lyrics:{syncType:'LINE_SYNCED',lines:[{startTimeMs:'0',words:'Fixture lyric'}]}}}};
</script><iframe id="fixture-frame" src="${origin}/session/${config.token}/ui/"></iframe><script>window.RiffifyFrame=document.getElementById('fixture-frame');${bridge}</script>`;
await page.route('https://xpui.app.spotify.com/harness',route=>route.fulfill({contentType:'text/html',body:harness}));
try {
  await page.goto('https://xpui.app.spotify.com/harness');
  const frame=page.frameLocator('#fixture-frame');
  await frame.locator('#platform-spotify.active').waitFor();
  await frame.getByText('Fixture playlist',{exact:true}).waitFor();
  mkdirSync('docs/screenshots',{recursive:true});
  await page.screenshot({path:'docs/screenshots/fixture-shell-1920.png'});
  await frame.locator('#search-input').fill('Fixture');await frame.locator('#search-input').press('Enter');
  await frame.locator('#search-tracks-list .track-row').first().waitFor();
  await frame.locator('#search-tracks-list .track-row').first().click();
  await page.waitForFunction(()=>fixtureCalls.some(x=>x[0]==='play'));
  await frame.locator('#btn-play-pause').click();
  await page.waitForFunction(()=>fixtureCalls.some(x=>x[0]==='toggle'));
  await frame.getByRole('button',{name:'Stats / Wrapped',exact:true}).click();
  await frame.getByText('Connect Last.fm history',{exact:true}).waitFor();
  await page.screenshot({path:'docs/screenshots/fixture-wrapped-1920.png'});
  await frame.locator('.riffify-panel-header button').click();
  await frame.locator('#nav-settings').click();
  await page.screenshot({path:'docs/screenshots/fixture-settings-1920.png'});
  if(errors.length)throw new Error(errors.join('\n'));
  const calls=await page.evaluate(()=>fixtureCalls);
  writeFileSync('docs/screenshots/fixture-test.json',JSON.stringify({kind:'headless fixture contract; not native Spotify verification',viewport:'1920x1080',errors,calls},null,2));
  console.log('Headless fixture: authentic UI boot, Spotify-first selector, library, search, native URI command, toggle, Stats and settings passed.');
} catch(error) {
  mkdirSync('work',{recursive:true});await page.screenshot({path:'work/ui-failure.png'});console.error(JSON.stringify({errors,failures,frames:page.frames().map(f=>f.url().replace(/\/session\/[a-f0-9]{64}/g,'/session/[redacted]'))},null,2));throw error;
} finally {await browser.close();await app.close();rmSync(data,{recursive:true,force:true});}
