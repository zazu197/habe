  const Riffify = (() => {
    const pending = new Map();
    let requestId = 0, snapshot = null, engine = 'spotify', generation = 0, switching = false,expectedUri=null;
    const originalAudio = el.nativeAudio;
    const call = (method, args = {}) => new Promise((resolve, reject) => {
      const id = ++requestId;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('Spotify bridge unavailable. Open Riffify inside Spotify.')); }, 15000);
      pending.set(id, { resolve, reject, timer });
      parent.postMessage({ riffify: 1, id, method, args }, 'https://xpui.app.spotify.com');
    });
    const media = {
      get currentTime() { return engine === 'spotify' ? (snapshot?.position || 0) / 1000 : originalAudio.currentTime; },
      set currentTime(seconds) { if (engine === 'spotify') call('seek', { position: Math.round(seconds * 1000) }).catch(e => showToast(e.message)); else originalAudio.currentTime = seconds; },
      get duration() { return engine === 'spotify' ? (snapshot?.duration || 0) / 1000 : originalAudio.duration; },
      get paused() { return engine === 'spotify' ? !snapshot?.playing : originalAudio.paused; }
    };
    window.addEventListener('message', event => {
      if (event.source !== parent || event.origin !== 'https://xpui.app.spotify.com' || event.data?.riffify !== 1) return;
      const message = event.data;
      if(message.error && !message.id) {showToast(message.error,'error');return;}
      if(message.ended && engine==='spotify' && state.currentTrack?.uri===message.ended) { if(state.isRepeat)playTrack(state.currentTrack);else playNext();return; }
      if (message.id && pending.has(message.id)) {
        const item = pending.get(message.id); pending.delete(message.id); clearTimeout(item.timer);
        message.error ? item.reject(new Error(message.error)) : item.resolve(message.value);
      }
      if (message.snapshot) {
        snapshot = message.snapshot;
        if (switching) return;
        if(engine==='spotify'&&expectedUri&&snapshot.track?.uri!==expectedUri)return;
        if(snapshot.track?.uri===expectedUri)expectedUri=null;
        if (engine !== 'spotify' && snapshot.playing) { originalAudio.pause(); engine = 'spotify';setEffectAvailability('spotify'); }
        if (engine !== 'spotify' || !snapshot.track) return;
        if (!isSameTrack(state.currentTrack, snapshot.track)) {
          state.currentTrack = snapshot.track; state.loadToken++; updateNowPlayingUI(snapshot.track);
          loadSyncedLyrics(snapshot.track.title, snapshot.track.artist, state.loadToken);
        }
        state.isPlaying = snapshot.playing; updatePlayPauseButton(snapshot.playing);
        if (!animationFrameId) startVisualizers();
        document.body.classList.toggle('is-playing', snapshot.playing);
        state.isShuffle = snapshot.shuffle; state.isRepeat = snapshot.repeat === 2;
        el.btnShuffle?.classList.toggle('active',state.isShuffle); el.btnRepeat?.classList.toggle('active',state.isRepeat);
        const progress = media.duration ? Math.max(0,Math.min(1,media.currentTime/media.duration)) : 0;
        if (el.scrubberTrack) { const fill=el.scrubberTrack.querySelector('.scrubber-fill,.progress-fill'); if(fill)fill.style.width=`${progress*100}%`; const knob=el.scrubberTrack.querySelector('.scrubber-knob'); if(knob)knob.style.left=`${progress*100}%`; }
        if (el.timeCurrent) el.timeCurrent.textContent = formatDuration(media.currentTime);
        if (el.timeDuration) el.timeDuration.textContent = formatDuration(media.duration);
        updateSyncedLyricsHighlight(media.currentTime);
        originalAudio.dispatchEvent(new Event('timeupdate'));
      }
    });
    async function activate(track) {
      const current = ++generation;
      switching = true;
      originalAudio.pause();
      const next = track.platform === 'spotify' ? 'spotify' : 'riff';
      expectedUri=next==='spotify'?track.uri||track.id:null;
      try { if (next === 'riff') await call('pause'); } finally { if(current===generation)switching=false; }
      if (current !== generation) return false;
      engine = next;
      setEffectAvailability(next);
      return true;
    }
    function setEffectAvailability(next) { document.querySelectorAll('#slider-speed,#slider-speed-pitch,#slider-pitch,#slider-reverb,#slider-distortion,#slider-echo,#slider-eq-low,#slider-eq-mid,#slider-eq-high,#slider-crossfade,#toggle-hq-audio,#btn-toggle-presets-drawer').forEach(control=>{control.disabled=next==='spotify';control.title=next==='spotify'?'Audio effects apply to external and local audio only':'';}); }
    setEffectAvailability(engine);
    const lrc=document.createElement('button');lrc.className='lyrics-action-btn';lrc.title='Import local LRC lyrics';lrc.setAttribute('aria-label','Import local LRC lyrics');lrc.textContent='LRC';
    lrc.onclick=()=>{if(!state.currentTrack){showToast('Choose a track first');return;}const picker=document.createElement('input');picker.type='file';picker.accept='.lrc,.txt';picker.onchange=async()=>{try{const file=picker.files[0];if(!file)return;if(file.size>1024*1024)throw new Error('Lyrics file must be under 1 MB');openCustomLyricsEditor();el.customLyricsTextarea.value=await file.text();showToast('Imported lyrics into editor. Save to apply your explicit local override.');}catch(e){showToast(e.message,'error');}};picker.click();};document.querySelector('.lyrics-header-actions')?.append(lrc);
    async function refreshLibrary() {
      try {
        const data = await call('library');
        state.favorites = [...data.tracks, ...state.favorites.filter(t => t.platform !== 'spotify')];
        updateFavoritesBadge(); updateFavoriteIcon();
        const grid = document.getElementById('home-vibe-grid');
        if (grid) { myWaveCurrentTracks=data.tracks.slice(0,50);currentWaveFocusedIndex=0;renderSpotifyWave(grid,document.getElementById('my-wave-focused-meta')); }
        const heading = document.getElementById('section-my-wave');
        if (heading) { const title = heading.querySelector('h2,h3'); if (title) title.textContent = 'Your Spotify library'; }
        const quick = document.getElementById('home-quick-play-row');
        if (quick) {
          quick.replaceChildren();
          const browse=document.createElement('button');browse.className='quick-play-pill';browse.innerHTML='<span class="quick-play-pill-title">Browse Spotify library</span>';browse.onclick=()=>library().catch(e=>showToast(e.message,'error'));quick.append(browse);
          for (const playlist of data.playlists) {
            const button = document.createElement('button'); button.className = 'quick-play-pill'; const text=document.createElement('span');text.className='quick-play-pill-title';text.textContent=playlist.name;button.append(text);
            button.addEventListener('click', async () => {
              try { const songs = await call('playlist', { uri: playlist.uri }); switchView('discover'); if (el.discoverEmpty) el.discoverEmpty.classList.add('hidden'); el.searchResultsContainer?.classList.remove('hidden'); if (el.resultsTitle) el.resultsTitle.textContent = playlist.name; renderTracks(el.searchTracksList, songs.tracks, playlist.uri); }
              catch (e) { showToast(e.message, 'error'); }
            }); quick.append(button);
          }
        }
        if (state.currentView === 'favorites') renderFavoritesView();
      } catch (error) { showToast(error.message, 'error'); }
    }
    const unavailable = ['btn-minimize', 'btn-maximize', 'btn-close', 'btn-mini-player', 'btn-change-music-folder', 'btn-change-download-folder', 'btn-reset-download-folder', 'btn-install-tools', 'btn-open-spotify-import','btn-tray-on-close','btn-multi-instance','btn-discord-rpc','btn-win-media-keys'];
    for (const id of unavailable) { const button = document.getElementById(id); if (button) { button.disabled = true; button.title = 'Unavailable inside Spotify. See compatibility documentation.'; } }
    document.querySelector('.titlebar-controls')?.setAttribute('aria-label', 'Native Spotify window controls remain outside Riffify');
    const sidebar = document.querySelector('.sidebar-nav');
    const panel = document.createElement('div'); panel.className = 'riffify-panel hidden'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Riffify statistics and downloads');
    document.body.append(panel);
    let view = null, poll = null, recapIndex = 0;
    function open(title) { clearInterval(poll); poll=null;panel.classList.remove('hidden','riffify-wrapped'); panel.replaceChildren(); const header = document.createElement('header'); header.className = 'riffify-panel-header'; const h = document.createElement('h2'); h.textContent = title; header.append(h); const close = document.createElement('button'); close.className = 'btn-outline-pill'; close.textContent = 'Close'; close.onclick = () => { panel.classList.add('hidden');view=null; clearInterval(poll); poll = null; }; header.append(close); panel.append(header); return panel; }
    function element(tag, text, parent, cls = '') { const node = document.createElement(tag); if (text != null) node.textContent = text; node.className = cls; parent?.append(node); return node; }
    function button(text, parent, fn) { const b = element('button', text, parent, 'btn-outline-pill'); b.onclick = async () => { try { await fn(); } catch (e) { showToast(e.message, 'error'); } }; return b; }
    function input(label, parent, type = 'text', value = '') { const wrap = element('label', label, parent, 'riffify-field'); const node = document.createElement('input'); node.type = type; node.value = value; wrap.append(node); return node; }
    const spotifySetting = element('div', null, null, 'setting-item');
    const spotifySettingTop = element('div', null, spotifySetting, 'setting-item-top');
    element('span', 'Spotify interface', spotifySettingTop, 'setting-name');
    const spotifyButton = button('Show Spotify UI', spotifySettingTop, () => call('exit'));
    spotifyButton.id = 'btn-show-spotify-ui';
    element('p', 'Leave Riffify and return to Spotify. Reopen Riffify from the sidebar.', spotifySetting, 'setting-hints');
    document.querySelector('.settings-section[data-cat="interface"] .m3-group')?.prepend(spotifySetting);
    async function stats() {
      view = 'stats'; open('Riff Wrapped'); panel.classList.add('riffify-wrapped');
      element('p', 'Your music, in perspective. Unofficial personal stats.', panel.querySelector('header'), 'wrapped-subtitle');
      const config = await riffifyApi('config');
      const toolbar = element('div', null, panel, 'wrapped-toolbar');
      const select = (label, values, selected) => {
        const wrap = element('label', label, toolbar, 'wrapped-filter');
        const control = element('select', null, wrap); control.setAttribute('aria-label', label);
        for (const [value, text] of values) { const option = element('option', text, control); option.value = value; }
        control.value = selected; return control;
      };
      const period = select('Period', [['today','Today'],['yesterday','Yesterday'],['week','This week'],['lastweek','Last week'],['7days','Last 7 days'],['30days','Last 30 days'],['month','This month'],['year','This year'],['all','All time'],['custom','Custom range']], 'week');
      const scope = select('Sources', [['all','All Sources'],['spotify','Spotify only']], 'all');
      const rank = select('Rank by', [['plays','Counted listens'],['time','Measured time']], 'plays');
      const range = element('div', null, toolbar, 'wrapped-custom-range hidden');
      const from = input('From', range, 'date'), to = input('To', range, 'date');
      const hero = element('section', null, panel, 'wrapped-hero');
      const summary = element('div', null, panel, 'wrapped-summary');
      const coverage = element('p', null, panel, 'wrapped-coverage');
      const charts = element('div', null, panel, 'wrapped-grid');
      let current = null, version = 0, recap = null, loading = false;
      const readableTime = ms => { const minutes = Math.floor(ms / 60000); return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${(ms / 60000).toFixed(ms > 0 && ms < 60000 ? 1 : 0)}m`; };
      const count = value => Number(value || 0).toLocaleString();
      const tools = element('details', null, panel, 'wrapped-tools');
      element('summary', 'History & settings', tools);
      const setup = element('section', null, tools, 'wrapped-setup');
      element('h3', 'Connect Last.fm history', setup);
      element('p', 'Bring your past listening into view. Read-only sync; your API key stays on this computer.', setup);
      const setupControls = element('div', null, setup, 'riffify-controls');
      const username = input('Last.fm username', setupControls, 'text', config.username);
      const key = input(config.hasKey ? 'API key saved · leave empty to keep' : 'Last.fm API key', setupControls, 'password');
      const zone = input('Timezone', setupControls, 'text', config.timezone);
      const profile = element('a', 'Create an API key', setup); profile.href = 'https://www.last.fm/api/account/create'; profile.target = '_blank'; profile.rel = 'noreferrer noopener';
      const account = element('a', `View ${config.username} on Last.fm`, setup); account.href = `https://www.last.fm/user/${encodeURIComponent(config.username)}`; account.target = '_blank'; account.rel = 'noreferrer noopener';
      const status = element('p', config.hasKey ? 'Ready to sync.' : 'No API key connected yet.', setup, 'wrapped-sync-status'); status.setAttribute('role', 'status');
      const refresh = async () => {
        const request = ++version;
        range.classList.toggle('hidden', period.value !== 'custom');
        if (period.value === 'custom' && (!from.value || !to.value)) return;
        const query = new URLSearchParams({period:period.value, scope:scope.value, rank:rank.value, timezone:zone.value, from:from.value, to:to.value});
        const data = await riffifyApi(`stats?${query}`);
        if (request !== version || view !== 'stats' || panel.classList.contains('hidden')) return;
        current = data;
        hero.replaceChildren();
        const main = element('div', null, hero, 'wrapped-hero-main');
        element('span', period.selectedOptions[0].textContent.toUpperCase(), main, 'wrapped-eyebrow');
        const time = element('div', null, main, 'wrapped-time'); element('strong', readableTime(data.measured), time);
        element('p', 'Measured listening time', main, 'wrapped-time-label');
        element('p', data.plays || data.measured ? `${count(data.plays)} counted listens. ${count(data.activeDays)} active days. A little more of what you love.` : 'Your story starts with a listen.', main, 'wrapped-hero-description');
        const heroActions = element('div', null, main, 'wrapped-hero-actions');
        const recapButton = button('View your recap', heroActions, showRecap); recapButton.disabled = !data.plays && !data.measured;
        if (!config.hasKey) button('Connect Last.fm', heroActions, () => { tools.open = true; setup.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'}); key.focus({preventScroll:true}); });
        const spotlight = element('div', null, hero, 'wrapped-spotlights');
        for (const [label, name, value] of [['TOP ARTIST', data.artists[0]?.name, data.artists[0]?.plays], ['ON REPEAT', data.tracks[0]?.name, data.tracks[0]?.plays]]) {
          const card = element('div', null, spotlight, 'wrapped-spotlight'); element('span', label, card, 'wrapped-eyebrow');
          element('h3', name || 'Still to discover', card); element('p', name ? `${count(value)} counted listens` : 'Listen or sync history to reveal yours.', card);
        }
        summary.replaceChildren();
        for (const [label, value, note] of [['Counted listens',count(data.plays),`${count(data.scrobbles)} verified Last.fm scrobbles`],['Artists in rotation',count(data.uniqueArtists),`${count(data.uniqueTracks)} tracks · ${count(data.uniqueAlbums)} albums`],['Longest streak',`${count(data.longestStreak)} days`,`${count(data.activeDays)} active days in this period`],['Historical estimate',data.estimated===null?'Not available':readableTime(data.estimated),data.estimated===null?'Resolve duration metadata after syncing.':`${count(data.missingDurations)} scrobbles have unknown duration`]]) {
          const card = element('div', null, summary, 'wrapped-stat'); element('span', label, card); element('strong', value, card); element('small', note, card);
        }
        coverage.textContent = data.coverage.imported ? `${count(data.coverage.imported)} scrobbles imported · history since ${new Date(data.coverage.earliest).toLocaleDateString()} · ${data.sync?.complete?'Backfill complete':'Partial coverage'} · Last sync ${data.sync?.syncedAt?new Date(data.sync.syncedAt).toLocaleString():'not completed'}` : 'Private by default. Listen with tracking enabled, or connect Last.fm to bring in your history.';
        charts.replaceChildren();
        const ranking = (title, rows, cls = '') => {
          const card = element('section', null, charts, `wrapped-chart ${cls}`); element('h3', title, card);
          const maximum = Math.max(1, ...rows.map(row => rank.value === 'time' ? row.measured : row.plays));
          rows.slice(0,5).forEach((row,index) => {
            const line = element('div', null, card, 'wrapped-ranking'); line.style.setProperty('--row',index);
            element('span', String(index + 1).padStart(2,'0'), line, 'wrapped-rank');
            const name = element('div', null, line, 'wrapped-rank-name'); element('span', row.name, name);
            const track = element('div', null, name, 'wrapped-rank-track'); const fill = element('i', null, track); fill.style.width = `${100 * (rank.value === 'time' ? row.measured : row.plays) / maximum}%`;
            element('strong', rank.value === 'time' ? readableTime(row.measured) : count(row.plays), line, 'wrapped-rank-value');
          }); return card;
        };
        if (data.artists.length || data.tracks.length) { ranking('Your top artists',data.artists,'wrapped-half'); ranking('Tracks you come back to',data.tracks,'wrapped-half'); }
        else {
          const empty = element('section', null, charts, 'wrapped-empty'); element('span','♪',empty,'wrapped-empty-symbol');
          element('h3','Make room for your music.',empty); element('p','Your artists, favorite tracks and listening patterns will appear here as real records arrive.',empty);
        }
        if (data.daily.length) {
          const activity = element('section', null, charts, 'wrapped-chart wrapped-activity-card'); element('h3','Your listening rhythm',activity);
          element('p',rank.value==='time'?'Measured minutes per active date':'Counted listens per active date',activity,'wrapped-chart-note');
          const row = element('div',null,activity,'riffify-activity'); const days = data.daily.slice(-90);
          const values = days.map(day => rank.value==='time'?day.measured/60000:day.plays), maximum = Math.max(1,...values);
          days.forEach((day,index)=>{const bar=element('div',null,row);bar.title=`${day.date}: ${readableTime(day.measured)} measured · ${day.plays} counted listens`;bar.style.height=`${Math.max(3,100*values[index]/maximum)}px`;element('span',day.date.slice(5),bar);});
          if(data.daily.length>90)element('p','Last 90 active dates shown; totals include the full period.',activity,'wrapped-chart-note');
          const hourly=element('section',null,charts,'wrapped-chart wrapped-hours-card');element('h3','When you tune in',hourly);element('p','Scrobble timestamps / measured time',hourly,'wrapped-chart-note');
          const hourRow=element('div',null,hourly,'riffify-activity wrapped-hours');const hourValues=rank.value==='time'?data.hours.map(ms=>ms/60000):data.hourlyScrobbles, maxHour=Math.max(1,...hourValues);
          hourValues.forEach((value,hour)=>{const bar=element('div',null,hourRow);bar.title=`${hour}:00 · ${readableTime(data.hours[hour])} measured · ${data.hourlyScrobbles[hour]} scrobbles`;bar.style.height=`${Math.max(3,100*value/maxHour)}px`;if(hour%6===0)element('span',`${hour}:00`,bar);});
        }
        for(const [title,rows] of [['Albums',data.albums],['Playback contexts',data.contexts],['Sources',data.providers]])if(rows.length)ranking(title,rows,'wrapped-third');
        const details=element('details',null,charts,'wrapped-methodology');element('summary','Behind the numbers',details);
        element('p',`Measured time comes from validated playback intervals. Historical estimates use known track durations, not exact past listening. Unmatched Last.fm provider is unknown. First recorded artists: ${data.firstRecordedArtists}. Longest measured session: ${readableTime(data.longestSession)}. Average per active day: ${readableTime(data.averageDailyMeasured)}. Peak date: ${data.peakDay?.date||'not available'}. Previous equal-length period: ${data.previousScrobbles??'unavailable for Spotify scope'} scrobbles. Genre: ${data.genres}.`,details);
      };
      function showRecap() {
        if(!current || !current.plays && !current.measured)throw new Error('No recorded listening for this period');
        recap?.remove();recapIndex=0;
        const cards=[['Your listening story',readableTime(current.measured),'Measured listening time'],['Your #1 artist',current.artists[0]?.name||'Still to discover','From your recorded listening'],['On repeat',current.tracks[0]?.name||'Still to discover','The track you came back to'],['Your top five',current.artists.slice(0,5).map(row=>row.name).join(' · '),'Artists in rotation'],['Days with music',`${current.activeDays} days`,`${current.longestStreak}-day longest streak`],['Your history',count(current.scrobbles),'Verified Last.fm scrobbles'],['Your sources',current.providers.map(row=>row.name).join(' · '),'Unmatched historical provider stays unknown'],['Made of your music',`${count(current.plays)} listens`,'Riff Wrapped · unofficial personal stats']];
        recap=element('section',null,panel,'wrapped-story');recap.setAttribute('role','dialog');recap.setAttribute('aria-label','Listening recap');
        const progress=element('div',null,recap,'wrapped-story-progress');cards.forEach(()=>element('i',null,progress));
        const heading=element('p',null,recap,'wrapped-eyebrow'),fact=element('h2',null,recap),note=element('p',null,recap,'wrapped-story-note');
        const navigation=element('div',null,recap,'wrapped-story-navigation');
        const render=()=>{const card=cards[recapIndex];heading.textContent=card[0];fact.textContent=card[1];note.textContent=card[2];progress.childNodes.forEach((node,index)=>node.classList.toggle('active',index<=recapIndex));recap.style.setProperty('--story',recapIndex);};
        button('Previous',navigation,()=>{recapIndex=(recapIndex+cards.length-1)%cards.length;render();});button('Next',navigation,()=>{recapIndex=(recapIndex+1)%cards.length;render();});button('Close recap',navigation,()=>{recap.remove();recap=null;});render();recap.scrollIntoView({block:'center',behavior:'instant'});
      }
      const setupActions=element('div',null,setup,'riffify-controls');
      button('Save and sync / resume',setupActions,async()=>{await riffifyApi('config',{username:username.value,...(key.value?{apiKey:key.value}:{}),timezone:zone.value});key.value='';await riffifyApi('sync',{});});
      button('Pause sync',setupActions,()=>riffifyApi('sync/pause',{}));
      button('Resolve historical durations (50 tracks)',setupActions,async()=>{const result=await riffifyApi('durations',{});showToast(`${result.resolved} metadata lookups completed; historical time remains estimated`);await refresh();});
      button('Detach Last.fm',setupActions,async()=>{await riffifyApi('config',{apiKey:''});await stats();});
      const actions=element('div',null,tools,'riffify-controls wrapped-data-actions');
      button('Refresh',actions,refresh);
      button(config.tracking?'Pause tracking':'Resume tracking',actions,async()=>{await riffifyApi('config',{tracking:!config.tracking});await stats();});
      button('Export JSON',actions,async()=>saveBlob(new Blob([JSON.stringify(await riffifyApi('export'),null,2)],{type:'application/json'}),'riffify-history.json'));
      button('Export scrobbles CSV',actions,async()=>{const data=await riffifyApi('export');const quote=x=>`"${String(x??'').replaceAll('"','""')}"`;const rows=[['timestamp','artist','track','album','source'],...data.scrobbles.map(x=>[x.timestamp,x.artist,x.title,x.album,'lastfm'])];saveBlob(new Blob([rows.map(row=>row.map(quote).join(',')).join('\r\n')],{type:'text/csv'}),'riffify-scrobbles.csv');});
      const historyFile=input('Import Riffify JSON history (16 MB maximum)',actions,'file');historyFile.accept='.json,application/json';
      historyFile.onchange=async()=>{try{const file=historyFile.files[0];if(!file)return;if(file.size>16*1024*1024)throw new Error('History export exceeds 16 MB');await riffifyApi('history/import',JSON.parse(await file.text()));showToast('History imported locally');await refresh();}catch(error){showToast(error.message,'error');}finally{historyFile.value='';}};
      const deleteButton=button('Delete local history',actions,()=>{deleteButton.textContent='Confirm delete local history';deleteButton.onclick=async()=>{try{await riffifyApi('history',{confirm:true},'DELETE');await stats();}catch(error){showToast(error.message,'error');}};});
      const png=button('Save recap PNG',toolbar,()=>{
        if(!current)return;
        const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=800;const context=canvas.getContext('2d');
        const style=getComputedStyle(panel),color=name=>style.getPropertyValue(name).trim();
        context.fillStyle=color('--md-sys-color-surface')||'#141218';context.fillRect(0,0,1200,800);
        const gradient=context.createLinearGradient(0,0,1200,800);gradient.addColorStop(0,color('--md-sys-color-primary-container')||'#4f378b');gradient.addColorStop(1,color('--md-sys-color-surface-container')||'#1e1f22');context.fillStyle=gradient;context.fillRect(32,32,1136,736);
        context.fillStyle=color('--md-sys-color-on-surface')||'#e6e6e8';context.font='24px "Google Sans",sans-serif';context.fillText('RIFF WRAPPED · '+period.selectedOptions[0].textContent.toUpperCase(),80,105);
        context.font='96px "Google Sans",sans-serif';context.fillText(readableTime(current.measured),80,225);context.font='22px "Google Sans",sans-serif';context.fillText('Measured listening time',80,265);
        context.fillText(`${count(current.plays)} counted listens · ${count(current.scrobbles)} Last.fm scrobbles`,80,330);
        context.font='28px "Google Sans",sans-serif';current.artists.slice(0,5).forEach((row,index)=>context.fillText(`${String(index+1).padStart(2,'0')}   ${row.name}`.slice(0,60),80,410+index*52));
        context.font='18px "Google Sans",sans-serif';context.fillText('Unofficial personal stats · Historical time is estimated or unknown',80,720);canvas.toBlob(blob=>saveBlob(blob,'riff-wrapped.png'));
      });png.classList.add('wrapped-export');
      for(const control of [period,scope,rank,zone,from,to])control.onchange=()=>refresh().catch(error=>showToast(error.message,'error'));
      clearInterval(poll);poll=setInterval(async()=>{
        if(loading || panel.classList.contains('hidden'))return;loading=true;
        try{const s=await riffifyApi('sync');if(view!=='stats')return;status.textContent=`${s.running?'Syncing':'Idle'} · ${s.retrieved||0} / ${s.total||'?'} scrobbles · page ${s.page||0}/${s.pages||'?'} ${s.profile?`· ${s.profile.name}: ${s.profile.playcount} reported scrobbles`:''} ${s.error||''}`;if(s.running||state.isPlaying)await refresh();}catch(error){status.textContent=error.message;}finally{loading=false;}
      },2000);
      await refresh();
    }

    function saveBlob(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
    async function library() {
      view='library';open('Your Spotify library');const controls=element('div',null,panel,'riffify-controls'),list=element('div',null,panel);
      async function tracks(items,label,context='spotify-library') {panel.classList.add('hidden');view=null;switchView('discover');el.discoverEmpty?.classList.add('hidden');el.searchResultsContainer?.classList.remove('hidden');if(el.resultsTitle)el.resultsTitle.textContent=label;renderTracks(el.searchTracksList,items,context);}
      const liked=await call('library');
      button('Liked songs',controls,()=>tracks(liked.tracks,'Liked songs'));
      async function entities(kind) {const data=await call(kind);list.replaceChildren();for(const item of data.items){const row=element('div',null,list,'riffify-card');button(`${item.name}${item.artist?' · '+item.artist:''}`,row,async()=>{const result=await call(kind==='albums'?'album':'artist',{uri:item.uri});await tracks(result.tracks,item.name);});}if(data.next)element('p','Pagination reached 10,000 items. Open Spotify library for remaining items.',list);}
      button('Saved albums',controls,()=>entities('albums'));button('Followed artists',controls,()=>entities('artists'));
      button('Playlists',controls,()=>{list.replaceChildren();for(const playlist of liked.playlists){const row=element('div',null,list,'riffify-card');button(playlist.name,row,async()=>{const result=await call('playlist',{uri:playlist.uri});await tracks(result.tracks,playlist.name,playlist.uri);});if(state.currentTrack?.platform==='spotify')button('Add current Spotify track',row,async()=>{await call('addPlaylist',{playlist:playlist.uri,uri:state.currentTrack.uri});showToast('Track added to Spotify playlist');});}});
      const name=input('New private Spotify playlist',controls);button('Create playlist',controls,async()=>{const result=await call('createPlaylist',{name:name.value});showToast(`Created ${result.name}`);await library();});
      element('p',`${liked.tracks.length} liked songs · ${liked.playlists.length} playlists. Choose a view above.`,list);
    }
    async function openDownloads(track) {
      view = 'downloads'; open('Downloads · external sources only');
      const url = input('Supported YouTube / SoundCloud URL', panel, 'url', track?.url || ''); const filename = input('Filename', panel, 'text', track?.title || 'media');
      const kind = element('select', null, panel); for (const k of ['video','audio']) { const option = element('option', `Save ${k}`, kind); option.value = k; }
      const playlist=input('Download playlist (up to 100 videos)',panel,'checkbox');const destination=input('Destination subfolder inside private downloads',panel);const metadata=input('Embed metadata and artwork',panel,'checkbox');
      const conversion=element('select',null,panel);for(const value of ['source','m4a','mp3','flac','opus']) {const option=element('option',value==='source'?'Keep source audio format':`Convert audio to ${value}`,conversion);option.value=value;}
      const format = element('select', null, panel); const authorized = input('I have download rights and source permission', panel, 'checkbox');
      const info = element('p', 'Destination: private Riffify downloads directory. Install verified yt-dlp and FFmpeg first.', panel);
      button('Load available formats', panel, async () => { const data = await riffifyApi(`formats?url=${encodeURIComponent(url.value)}&playlist=${playlist.checked}`); format.replaceChildren(); for (const f of data.formats.filter(f => kind.value === 'video' ? f.video : f.audio && !f.video)) { const option = element('option', `${f.ext} ${f.height ? `${f.height}p` : 'audio'} ${f.size ? `${(f.size / 1048576).toFixed(1)} MB` : 'size unknown'}`, format); option.value = f.id; } info.textContent = data.title+(data.playlistCount?` · ${data.playlistCount} entries · Formats are based on first accessible video. Other entries must support the selected format.`:''); });
      button('Start download', panel, async () => { await riffifyApi('downloads', { url: url.value, filename: filename.value, kind: kind.value, format: format.value, authorized: authorized.checked,playlist:playlist.checked,conversion:conversion.value,destination:destination.value,metadata:metadata.checked }); await refreshDownloads(); });
      const list = element('div', null, panel);
      async function refreshDownloads() { if (view !== 'downloads') return; const jobs = await riffifyApi('downloads'); list.replaceChildren(); for (const job of jobs) { const row = element('section', null, list, 'riffify-card'); element('p', `${job.filename} · ${job.state} · ${job.percent.toFixed(1)}% · ${job.speed || ''} · ETA ${job.eta || 'unknown'} ${job.error}`, row); if (['running','queued'].includes(job.state)) button('Cancel', row, () => riffifyApi(`downloads/${job.id}/cancel`, {})); if (['failed','canceled'].includes(job.state)) button('Retry', row, () => riffifyApi(`downloads/${job.id}/retry`, {})); for (const file of job.files || []) { const a = element('a', file, row); a.href = `../api/riffify/downloads/${job.id}/file?name=${encodeURIComponent(file)}`; a.download = file;button('Open file',row,()=>riffifyApi(`downloads/${job.id}/open`,{name:file}));button('Open folder',row,()=>riffifyApi(`downloads/${job.id}/folder`,{name:file}));if(/\.(mp3|m4a|flac|wav|ogg|opus)$/i.test(file))button('Import into local library',row,async()=>{const item=await riffifyApi(`downloads/${job.id}/import`,{name:file});await fetch(`${location.origin}${window.riffifyPrefix}/api/library-add`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:[item]})});showToast('Audio imported into local library');}); } } }
      clearInterval(poll); poll = setInterval(() => refreshDownloads().catch(e => { info.textContent = e.message; }), 1000); await refreshDownloads();
    }
    for (const [label, fn, svg] of [['Stats / Wrapped',stats,'<path d="M5 20V10m7 10V4m7 16v-8"/>'],['Downloads',openDownloads,'<path d="M12 3v12m-5-5 5 5 5-5M4 18v3h16v-3"/>']]) {
      const b = document.createElement('button'); b.className = 'nav-item'; b.title = label; b.setAttribute('aria-label', label); b.innerHTML = `<div class="nav-indicator"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${svg}</svg></div>`; b.onclick = () => fn().catch(e => showToast(e.message, 'error')); sidebar?.append(b);
    }
    window.electronAPI.importAudioFiles = async () => { uploadLocal(); return []; };
    async function uploadLocal() {
      const picker = document.createElement('input'); picker.type = 'file'; picker.accept = '.mp3,.m4a,.flac,.wav,.ogg,.opus'; picker.multiple = true;
      picker.onchange = async () => { for (const file of picker.files) { try { const response = await fetch(`../api/riffify/import?name=${encodeURIComponent(file.name)}`, { method: 'POST', body: file }); const result = await response.json(); if (!response.ok) throw new Error(result.error); await fetch(`http://127.0.0.1:${state.serverPort}/api/library-add`, { method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:[result]}) }); } catch (e) { showToast(e.message,'error'); } } renderLocalView(); }; picker.click();
    }
    let sampleTimer = setInterval(() => {
      if (engine !== 'riff' || !state.currentTrack) return;
      riffifyApi('sample', { track: state.currentTrack, playing: !originalAudio.paused && !originalAudio.ended, position: originalAudio.currentTime * 1000, rate: originalAudio.playbackRate }).catch(() => {});
    }, 1000);
    window.addEventListener('pagehide', () => { clearInterval(sampleTimer); clearInterval(poll); originalAudio.pause(); for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new Error('Riffify closed')); } });
    call('snapshot').catch(() => {});
    async function removePlaylistTrack(track,playlist,tracks,container) {await call('removePlaylist',{playlist,uri:track.uri});for(let i=tracks.length-1;i>=0;i--)if(tracks[i].uri===track.uri)tracks.splice(i,1);renderTracks(container,tracks,playlist);showToast('Removed from Spotify playlist');}
    function clearExpected(track){if(expectedUri===(track.uri||track.id)){expectedUri=null;call('snapshot').catch(()=>{});}}
    return { call, media, activate, refreshLibrary, openDownloads,removePlaylistTrack,clearExpected };
  })();
