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
    function open(title) { panel.classList.remove('hidden'); panel.replaceChildren(); const header = document.createElement('header'); header.className = 'riffify-panel-header'; const h = document.createElement('h2'); h.textContent = title; header.append(h); const close = document.createElement('button'); close.className = 'btn-outline-pill'; close.textContent = 'Close'; close.onclick = () => { panel.classList.add('hidden'); clearInterval(poll); poll = null; }; header.append(close); panel.append(header); return panel; }
    function element(tag, text, parent, cls = '') { const node = document.createElement(tag); if (text != null) node.textContent = text; node.className = cls; parent?.append(node); return node; }
    function button(text, parent, fn) { const b = element('button', text, parent, 'btn-outline-pill'); b.onclick = async () => { try { await fn(); } catch (e) { showToast(e.message, 'error'); } }; return b; }
    function input(label, parent, type = 'text', value = '') { const wrap = element('label', label, parent, 'riffify-field'); const node = document.createElement('input'); node.type = type; node.value = value; wrap.append(node); return node; }
    async function stats() {
      view = 'stats'; open('Riff Wrapped · unofficial personal stats');
      const controls = element('div', null, panel, 'riffify-controls');
      const select = (values, selected) => { const s = element('select', null, controls); for (const [value, text] of values) { const option = element('option', text, s); option.value = value; } s.value = selected; return s; };
      const period = select([['today','Today'],['yesterday','Yesterday'],['week','This week'],['lastweek','Last week'],['7days','Last 7 days'],['30days','Last 30 days'],['month','This month'],['year','This year'],['all','All time'],['custom','Custom range']], 'week');
      const scope = select([['all','All Sources'],['spotify','Spotify only']], 'all');
      const rank = select([['plays','Rank by plays'],['time','Rank by measured time']], 'plays');
      const config = await riffifyApi('config');
      const zone = input('Timezone', controls, 'text', config.timezone);
      const from = input('From', controls, 'date'); const to = input('To', controls, 'date');
      const summary = element('div', null, panel, 'riffify-metrics'), coverage = element('p', null, panel), charts = element('div', null, panel, 'riffify-charts');
      let current = null, version = 0;
      const refresh = async () => {
        const request = ++version;
        const query = new URLSearchParams({ period: period.value, scope: scope.value, rank: rank.value, timezone: zone.value, from: from.value, to: to.value });
        const data = await riffifyApi(`stats?${query}`); if (request !== version || view !== 'stats') return; current = data;
        summary.replaceChildren(); for (const [label, value] of [['Measured listening time', `${(data.measured / 60000).toFixed(1)} min`], ['Verified Last.fm scrobbles', data.scrobbles], ['Qualified plays / scrobbles', data.plays], ['Estimated historical time', data.estimated===null?'Unknown — resolve duration metadata':`${(data.estimated/60000).toFixed(1)} min (${data.missingDurations} unknown)`],['Unique tracks / artists / albums',`${data.uniqueTracks} / ${data.uniqueArtists} / ${data.uniqueAlbums}`],['Active days / longest streak',`${data.activeDays} / ${data.longestStreak} days`],['Longest measured session',`${(data.longestSession/60000).toFixed(1)} min`],['First recorded artists',data.firstRecordedArtists]]) { const card = element('div', null, summary, 'riffify-card'); element('span', label, card); element('strong', String(value), card); }
        coverage.textContent = `Last.fm history since ${data.coverage.earliest ? new Date(data.coverage.earliest).toLocaleDateString() : 'not imported'} · ${data.coverage.imported} imported · Last synced ${data.sync?.syncedAt ? new Date(data.sync.syncedAt).toLocaleString() : 'never'} · ${data.sync?.complete ? 'Backfill completed' : 'Partial coverage'} · Unmatched Last.fm provider unknown`;
        charts.replaceChildren();
        for (const [title, rows] of [['Top artists', data.artists], ['Top tracks', data.tracks], ['Top albums', data.albums], ['Top playback contexts',data.contexts], ['Sources', data.providers]]) {
          const card = element('section', null, charts, 'riffify-card'); element('h3', title, card);
          if (!rows.length) element('p', 'No records for this period. Import history or listen with tracking enabled.', card);
          const maximum = Math.max(1, ...rows.map(x => rank.value === 'time' ? x.measured : x.plays));
          rows.slice(0, 10).forEach((row, i) => { const line = element('div', null, card, 'riffify-ranking'); line.style.animationDelay = `${i * 40}ms`; element('span', row.name, line); element('span', rank.value === 'time' ? `${(row.measured / 60000).toFixed(1)} min` : `${row.plays} plays`, line); const bar = element('i', null, line); bar.style.width = `${100 * (rank.value === 'time' ? row.measured : row.plays) / maximum}%`; });
        }
        const activity = element('section', null, charts, 'riffify-card'); element('h3', 'Listening activity · measured time / scrobbles', activity); const row = element('div', null, activity, 'riffify-activity');
        for (const day of data.daily.slice(-180)) { const bar = element('div', null, row); bar.title = `${day.date}: ${(day.measured / 60000).toFixed(1)} min / ${day.plays} counted listens`; bar.style.height = `${Math.max(5, Math.min(100, day.measured / 60000 + day.plays))}px`; element('span', day.date.slice(5), bar); }
        if(data.daily.length>180)element('p','Chart shows the last 180 active dates; totals include the full selected period.',activity);
        const hourly=element('section',null,charts,'riffify-card');element('h3','Hour of day · measured time / scrobble timestamps',hourly);const hourRow=element('div',null,hourly,'riffify-activity');
        const hourValues=rank.value==='time'?data.hours.map(ms=>ms/60000):data.hourlyScrobbles,maximum=Math.max(1,...hourValues);
        hourValues.forEach((value,hour)=>{const bar=element('div',null,hourRow);bar.title=`${hour}:00 · ${(data.hours[hour]/60000).toFixed(1)} measured min / ${data.hourlyScrobbles[hour]} scrobbles`;bar.style.height=`${Math.max(3,100*value/maximum)}px`;element('span',String(hour),bar);});
        element('p',`Average per active day: ${(data.averageDailyMeasured/60000).toFixed(1)} measured min · Peak day: ${data.peakDay?.date||'Unknown'} · Previous equal-length period: ${data.previousScrobbles??'Unavailable for Spotify scope'} scrobbles · Genres: ${data.genres}`,panel);
      };
      for (const control of [period, scope, rank, zone, from, to]) control.onchange = () => refresh().catch(e => showToast(e.message, 'error'));
      const actions = element('div', null, panel, 'riffify-controls');
      button('Refresh', actions, refresh);
      button('Browse recap', actions, () => {
        if (!current || !current.plays && !current.measured) throw new Error('No recorded listening for this period');
        const cards = [`${current.period}: ${(current.measured / 3600000).toFixed(2)} measured hours`, `Your #1 artist: ${current.artists[0]?.name || 'Unknown'}`, `On repeat: ${current.tracks[0]?.name || 'Unknown'}`, `Top five: ${current.artists.slice(0, 5).map(x => x.name).join(', ')}`, `${current.activeDays} active recorded days`, `${current.scrobbles} verified scrobbles`, `Sources: ${current.providers.map(x => x.name).join(', ')}`, 'Riff Wrapped · unofficial personal stats'];
        const overlay = element('div', null, panel, 'riffify-card riffify-recap'); const text = element('h2', cards[recapIndex % cards.length], overlay);
        button('Previous', overlay, () => { recapIndex = (recapIndex + cards.length - 1) % cards.length; text.textContent = cards[recapIndex]; }); button('Next', overlay, () => { recapIndex = (recapIndex + 1) % cards.length; text.textContent = cards[recapIndex]; }); button('Close recap', overlay, () => overlay.remove());
      });
      button('Save recap PNG', actions, () => {
        if (!current) return; const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 800; const context = canvas.getContext('2d'); const style = getComputedStyle(document.body); context.fillStyle = style.getPropertyValue('--md-sys-color-surface').trim() || '#141218'; context.fillRect(0, 0, 1200, 800); context.fillStyle = style.getPropertyValue('--md-sys-color-primary').trim() || '#d0bcff'; context.font = '48px "Google Sans",sans-serif'; context.fillText('Riff Wrapped', 80, 110); context.font = '26px "Google Sans",sans-serif'; const lines = [current.period, `${(current.measured / 60000).toFixed(1)} measured minutes`, `${current.scrobbles} verified Last.fm scrobbles`, ...current.artists.slice(0,5).map((x,i) => `${i+1}. ${x.name} — ${x.plays} plays`), 'Unofficial personal stats · Historical durations unknown']; lines.forEach((line,i) => context.fillText(line.slice(0, 75), 80, 180 + i * 55)); canvas.toBlob(blob => saveBlob(blob, 'riff-wrapped.png'));
      });
      button(config.tracking ? 'Pause tracking' : 'Resume tracking', actions, async () => { await riffifyApi('config', { tracking: !config.tracking }); await stats(); });
      button('Export JSON', actions, async () => saveBlob(new Blob([JSON.stringify(await riffifyApi('export'), null, 2)], { type: 'application/json' }), 'riffify-history.json'));
      const historyFile=input('Import Riffify JSON history (16 MB maximum)',actions,'file');historyFile.accept='.json,application/json';
      historyFile.onchange=async()=>{try{const file=historyFile.files[0];if(!file)return;if(file.size>16*1024*1024)throw new Error('History export exceeds 16 MB');await riffifyApi('history/import',JSON.parse(await file.text()));showToast('History imported locally');await refresh();}catch(error){showToast(error.message,'error');}finally{historyFile.value='';}};
      button('Export scrobbles CSV', actions, async () => { const data = await riffifyApi('export'); const quote = x => `"${String(x ?? '').replaceAll('"','""')}"`; const rows = [['timestamp','artist','track','album','source'], ...data.scrobbles.map(x => [x.timestamp,x.artist,x.title,x.album,'lastfm'])]; saveBlob(new Blob([rows.map(row => row.map(quote).join(',')).join('\r\n')], { type:'text/csv' }), 'riffify-scrobbles.csv'); });
      const deleteButton = button('Delete local history', actions, () => { deleteButton.textContent = 'Confirm delete local history'; deleteButton.onclick = async () => { await riffifyApi('history', { confirm: true }, 'DELETE'); await stats(); }; });
      const setup = element('section', null, panel, 'riffify-card'); element('h3', 'Connect Last.fm history', setup); element('p', 'Read-only import. Your API key stays in local user configuration. No Last.fm password needed.', setup);
      const profile = element('a', 'Create your own Last.fm API key', setup); profile.href = 'https://www.last.fm/api/account/create'; profile.target = '_blank'; profile.rel = 'noreferrer noopener';
      const username = input('Last.fm username', setup, 'text', config.username); const key = input(config.hasKey ? 'API key saved · leave empty to keep' : 'Last.fm API key', setup, 'password');
      const account=element('a',`Last.fm profile: ${config.username}`,setup);account.href=`https://www.last.fm/user/${encodeURIComponent(config.username)}`;account.target='_blank';account.rel='noreferrer noopener';
      const status = element('p', null, setup);
      button('Save and sync / resume', setup, async () => { await riffifyApi('config', { username: username.value, ...(key.value ? { apiKey: key.value } : {}), timezone: zone.value }); key.value = ''; await riffifyApi('sync', {}); });
      button('Pause sync', setup, () => riffifyApi('sync/pause', {}));
      button('Resolve historical durations (50 tracks)',setup,async()=>{const result=await riffifyApi('durations',{});showToast(`${result.resolved} metadata lookups completed; historical time remains estimated`);await refresh();});
      button('Detach Last.fm', setup, async () => { await riffifyApi('config', { apiKey: '' }); await stats(); });
      clearInterval(poll); poll = setInterval(async () => { try { const s = await riffifyApi('sync'); status.textContent = `${s.running ? 'Syncing' : 'Idle'} · ${s.retrieved || 0} / ${s.total || '?'} scrobbles · page ${s.page || 0}/${s.pages || '?'} ${s.profile?`· ${s.profile.name}: ${s.profile.playcount} reported scrobbles · registered ${s.profile.registered?new Date(s.profile.registered*1000).toLocaleDateString():'unknown'}`:''} ${s.error || ''}`; if (s.running || state.isPlaying) await refresh(); } catch (e) { status.textContent = e.message; } }, 2000);
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
    const exit = document.createElement('button'); exit.className = 'titlebar-btn riffify-exit'; exit.textContent = 'Exit Riffify'; exit.title = 'Return to Spotify'; exit.onclick = () => call('exit'); document.querySelector('.titlebar-controls')?.prepend(exit);
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
