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
await page.context().grantPermissions(['local-network-access'],{origin:'https://xpui.app.spotify.com'});
page.on('pageerror',error=>errors.push(error.message));
page.on('requestfailed',request=>failures.push({url:request.url().replace(/\/session\/[a-f0-9]{64}/g,'/session/[redacted]'),error:request.failure()?.errorText}));
const bridge=readFileSync('spicetify/bridge.js','utf8');
const harness=`<!doctype html><style>body{margin:0}iframe{width:100vw;height:100vh;border:0}</style><script>
window.fixtureCalls=[];
const item={uri:'spotify:track:0123456789012345678901',metadata:{title:'Fixture track',artist_name:'Fixture artist',artist_uri:'spotify:artist:1123456789012345678901',album_title:'Fixture album',duration:'120000'}};
window.RiffifyConnection=${JSON.stringify({origin,token:config.token})};
window.Spicetify={Player:{origin:{},data:null,getProgress:()=>0,getDuration:()=>120000,getVolume:()=>.5,getShuffle:()=>false,getRepeat:()=>0,
playUri:async uri=>{fixtureCalls.push(['play',uri]);Spicetify.Player.data={item:{...item,uri},isPaused:false};},pause:()=>{fixtureCalls.push(['pause']);if(Spicetify.Player.data)Spicetify.Player.data.isPaused=true;},togglePlay:()=>{fixtureCalls.push(['toggle']);Spicetify.Player.data.isPaused=!Spicetify.Player.data.isPaused;},next:()=>fixtureCalls.push(['next']),back:()=>fixtureCalls.push(['previous']),seek:x=>fixtureCalls.push(['seek',x]),setVolume:x=>fixtureCalls.push(['volume',x]),setShuffle:x=>fixtureCalls.push(['shuffle',x]),setRepeat:x=>fixtureCalls.push(['repeat',x]),addEventListener:()=>{},removeEventListener:()=>{}},Platform:{History:{push:()=>{}},LibraryAPI:{getTracks:async()=>({items:[item]}),contains:async()=>[false],add:async()=>{},remove:async()=>{}},RootlistAPI:{getContents:async()=>({items:[{type:'playlist',name:'Fixture playlist',uri:'spotify:playlist:0123456789012345678901'}]})},PlaylistAPI:{getContents:async()=>({items:[item]})}},CosmosAsync:{get:async url=>url.includes('/top-tracks')?{tracks:[item]}:url.includes('/v1/artists/')?{name:'Fixture artist',images:[],genres:['Fixture genre']}:url.includes('/search')?{tracks:{items:[item]}}:{lyrics:{syncType:'LINE_SYNCED',lines:[{startTimeMs:'0',words:'Fixture lyric'}]}}}};
</script><iframe id="fixture-frame" src="${origin}/session/${config.token}/ui/"></iframe><script>window.RiffifyFrame=document.getElementById('fixture-frame');${bridge}</script>`;
await page.route('https://xpui.app.spotify.com/harness',route=>route.fulfill({contentType:'text/html',body:harness}));
try {
  await page.goto('https://xpui.app.spotify.com/harness');
  const frame=page.frameLocator('#fixture-frame');
  await frame.locator('#platform-spotify.active').waitFor();
  await frame.getByText('Fixture playlist',{exact:true}).waitFor();
  await page.waitForTimeout(600);
  if(await frame.locator('#home-vibe-grid .my-wave-track-card').count()!==1)throw new Error('Original carousel renderer missing');
  mkdirSync('docs/screenshots',{recursive:true});
  await page.screenshot({path:'docs/screenshots/fixture-shell-1920.png'});
  await frame.locator('#search-input').fill('Fixture');await frame.locator('#search-input').press('Enter');
  await frame.locator('#search-tracks-list .track-row').first().waitFor();
  await frame.locator('#search-tracks-list .track-row-artist').first().click();await frame.getByText('Spotify genres: Fixture genre',{exact:true}).waitFor();await frame.locator('#btn-back-artist').click();
  await frame.locator('#search-tracks-list .track-row').first().click();
  await page.waitForFunction(()=>fixtureCalls.some(x=>x[0]==='play'));
  await frame.locator('#btn-play-pause').click();
  await page.waitForFunction(()=>fixtureCalls.some(x=>x[0]==='toggle'));
  await frame.getByRole('button',{name:'Stats / Wrapped',exact:true}).click();
  await frame.getByText('Connect Last.fm history',{exact:true}).waitFor();
  await page.waitForTimeout(600);
  await page.screenshot({path:'docs/screenshots/fixture-wrapped-1920.png'});
  await frame.locator('.riffify-panel-header button').click();
  await frame.locator('#nav-settings').click();
  await page.waitForTimeout(600);
  await frame.locator('body').evaluate(async()=>{await document.fonts.ready;});
  await page.screenshot({path:'docs/screenshots/fixture-settings-1920.png'});
  const reference=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
  await reference.context().grantPermissions(['local-network-access'],{origin:'https://xpui.app.spotify.com'});
  const fixtureTrack={id:'spotify:track:0123456789012345678901',uri:'spotify:track:0123456789012345678901',title:'Fixture track',artist:'Fixture artist',album:'Fixture album',duration:120,platform:'spotify',thumbnail:''};
  const referenceApp=readFileSync('vendor/riff/app.js','utf8').replace('  loadHomePage();',`  state.currentTrack=${JSON.stringify(fixtureTrack)};state.favorites=[state.currentTrack];updateNowPlayingUI(state.currentTrack);updateFavoriteIcon();updateFavoritesBadge();\n  loadHomePage();`);
  await reference.route(`${origin}/session/${config.token}/ui/reference/**`,async route=>{const name=new URL(route.request().url()).pathname.split('/reference/')[1]||'index.html';if(name.includes('..'))throw new Error('Invalid reference asset');const content=name==='app.js'?referenceApp:readFileSync(path.join('vendor/riff',name));await route.fulfill({contentType:name.endsWith('.html')?'text/html':name.endsWith('.css')?'text/css':name.endsWith('.js')?'text/javascript':'application/octet-stream',body:content});});
  await reference.route('http://127.0.0.1:38472/api/**',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,tracks:[],ytDlp:true,ffmpeg:true,progress:{status:'idle'}})}));
  await reference.route('https://xpui.app.spotify.com/reference',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><style>body{margin:0}iframe{width:100vw;height:100vh;border:0}</style><iframe id="reference" src="${origin}/session/${config.token}/ui/reference/"></iframe>`}));
  await reference.goto('https://xpui.app.spotify.com/reference');const ref=reference.frameLocator('#reference');await ref.locator('#nav-settings').waitFor();await ref.locator('#search-input').fill('Fixture');await reference.waitForTimeout(1000);await ref.locator('#nav-settings').click();await reference.waitForTimeout(700);await ref.locator('body').evaluate(async()=>{await document.fonts.ready;});
  await reference.screenshot({path:'docs/screenshots/reference-settings-1920.png'});
  await reference.close();
  if(errors.length)throw new Error(errors.join('\n'));
  const calls=await page.evaluate(()=>fixtureCalls);
  writeFileSync('docs/screenshots/fixture-test.json',JSON.stringify({kind:'headless fixture contract; not native Spotify verification',viewport:'1920x1080',errors,calls},null,2));
  console.log('Headless fixture: authentic UI boot, Spotify-first selector, library, search, native URI command, toggle, Stats and settings passed.');
} catch(error) {
  mkdirSync('work',{recursive:true});await page.screenshot({path:'work/ui-failure.png'});console.error(JSON.stringify({errors,failures,frames:page.frames().map(f=>f.url().replace(/\/session\/[a-f0-9]{64}/g,'/session/[redacted]'))},null,2));throw error;
} finally {await browser.close();await app.close();rmSync(data,{recursive:true,force:true});}
