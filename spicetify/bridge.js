(() => {
  let readyTimer;
  async function start() {
    const S = window.Spicetify, connection = window.RiffifyConnection;
    if (!S?.Player?.origin || !S.Platform?.LibraryAPI || !connection) { readyTimer = setTimeout(start, 500); return; }
    const P = S.Player;
    let activeCommand = Promise.resolve(), sampling = false, wasPlaying = false, managedUri=null, lastSnapshot=null, handlingEnd=false;
    const check = value => { if (value?.error || Number(value?.code) >= 400) throw new Error(value.message || value.error?.message || 'Spotify API unavailable'); return value; };
    const image = value => { if (typeof value !== 'string') return ''; return value.startsWith('spotify:image:') ? `https://i.scdn.co/image/${value.slice(14)}` : /^https:\/\//.test(value) ? value : ''; };
    const normalize = input => {
      const t = input.track || input, m = t.metadata || {}, uri = t.uri || (t.id ? `spotify:track:${t.id}` : '');
      if (!/^spotify:(track|episode):[A-Za-z0-9]{22}$/.test(uri)) return null;
      return { id: uri, uri, platform:'spotify', title:t.name || m.title || '', artist: t.artists?.[0]?.name || m.artist_name || '',artists:t.artists||[{name:m.artist_name||'',uri:m.artist_uri||''}],artistUri:t.artists?.[0]?.uri||m.artist_uri||null, album:t.album?.name || m.album_title || '', thumbnail:image(t.album?.images?.[0]?.url || t.images?.[0]?.url || m.image_url), duration:Number(t.duration_ms || t.duration?.milliseconds || m.duration || 0)/1000, url:`https://open.spotify.com/${uri.split(':')[1]}/${uri.split(':')[2]}`, available:t.isPlayable ?? t.is_playable ?? true };
    };
    const snapshot = () => { const track = P.data?.item ? normalize(P.data.item) : null;const duration=track?P.getDuration()||0:0;if(track && !track.duration)track.duration=duration/1000;return { track, position:track?P.getProgress() || 0:0, duration, playing:Boolean(track && !P.data?.isPaused), volume:track?P.getVolume():.85, shuffle:track?P.getShuffle():false, repeat:track?P.getRepeat():0 }; };
    async function spotifyGet(url) { if(!url.startsWith('https://api.spotify.com/v1/'))throw new Error('Invalid Spotify endpoint');return check(await S.CosmosAsync.get(url)); }
    const post = value => window.RiffifyFrame?.contentWindow?.postMessage({ riffify:1, ...value }, connection.origin);
    async function request(method, args) {
      switch (method) {
        case 'snapshot': post({ snapshot:snapshot() }); return true;
        case 'play': {
          if (!/^spotify:(track|episode):[A-Za-z0-9]{22}$/.test(args.uri || '')) throw new Error('Invalid Spotify URI');managedUri=args.managed?args.uri:null;await P.playUri(args.uri);
          const deadline=Date.now()+10000;while(P.data?.item?.uri!==args.uri&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,50));
          if(P.data?.item?.uri!==args.uri){managedUri=null;throw new Error('Spotify did not confirm the requested track. Check device, availability and connection.');}return true;
        }
        case 'pause': {
          if(P.data && !P.data.isPaused)P.pause(); const deadline=Date.now()+3000;
          while(P.data && !P.data.isPaused && Date.now()<deadline) await new Promise(resolve=>setTimeout(resolve,50));
          if(P.data && !P.data.isPaused)throw new Error('Spotify did not pause; external playback was stopped to prevent overlap'); return true;
        }
        case 'toggle': P.togglePlay(); return true;
        case 'next': P.next(); return true;
        case 'previous': P.back(); return true;
        case 'seek': if (!Number.isFinite(args.position) || args.position < 0) throw new Error('Invalid seek'); P.seek(Math.round(args.position)); return true;
        case 'volume': if (!Number.isFinite(args.value) || args.value < 0 || args.value > 1) throw new Error('Invalid volume'); P.setVolume(args.value); return true;
        case 'shuffle': P.setShuffle(Boolean(args.value)); return true;
        case 'repeat': if (![0,1,2].includes(args.value)) throw new Error('Invalid repeat mode'); P.setRepeat(args.value); return true;
        case 'search': {
          if (typeof args.query !== 'string' || args.query.length > 300) throw new Error('Invalid search');
          const response = check(await S.CosmosAsync.get(`https://api.spotify.com/v1/search?q=${encodeURIComponent(args.query)}&type=track&limit=50`));
          return { success:true, tracks:(response.tracks?.items || []).map(normalize).filter(Boolean) };
        }
        case 'library': {
          const tracks = check(await S.Platform.LibraryAPI.getTracks({ limit:10000 }));
          const root = check(await S.Platform.RootlistAPI.getContents());
          const playlists = []; const collect = rows => { for (const row of rows || []) { if (row.type === 'playlist') playlists.push({name:row.name,uri:row.uri}); if (row.items) collect(row.items); } }; collect(root.items);
          return { tracks:(tracks.items || []).map(normalize).filter(Boolean), playlists };
        }
        case 'playlist': {
          if (!/^spotify:playlist:[A-Za-z0-9]{22}$/.test(args.uri || '')) throw new Error('Invalid playlist URI');
          const result = check(await S.Platform.PlaylistAPI.getContents(args.uri, { limit:10000 }));
          return { tracks:(result.items || []).map(normalize).filter(Boolean) };
        }
        case 'favorite': {
          if (!/^spotify:track:[A-Za-z0-9]{22}$/.test(args.uri || '')) throw new Error('Invalid track URI');
          const contains = await S.Platform.LibraryAPI.contains(args.uri);
          await S.Platform.LibraryAPI[contains[0] ? 'remove' : 'add']({ uris:[args.uri] }); return true;
        }
        case 'albums': {
          let url='https://api.spotify.com/v1/me/albums?limit=50';const items=[];
          for(let page=0;url&&page<200;page++){if(!url.startsWith('https://api.spotify.com/v1/me/albums?'))throw new Error('Invalid album pagination');const result=await spotifyGet(url);items.push(...(result.items||[]).map(x=>({uri:x.album.uri,name:x.album.name,artist:x.album.artists?.map(a=>a.name).join(', ')})));url=result.next;}return {items,next:url};
        }
        case 'artists': {let url='https://api.spotify.com/v1/me/following?type=artist&limit=50';const items=[];for(let page=0;url&&page<200;page++){if(!url.startsWith('https://api.spotify.com/v1/me/following?'))throw new Error('Invalid artist pagination');const result=await spotifyGet(url);items.push(...(result.artists?.items||[]).map(x=>({uri:x.uri,name:x.name})));url=result.artists?.next;}return {items,next:url};}
        case 'album': {
          if(!/^spotify:album:[A-Za-z0-9]{22}$/.test(args.uri||''))throw new Error('Invalid album URI');
          const id=args.uri.split(':')[2],album=await spotifyGet(`https://api.spotify.com/v1/albums/${id}`),tracks=[...(album.tracks?.items||[])];let url=album.tracks?.next;
          for(let page=0;url&&page<200;page++){if(!url.startsWith(`https://api.spotify.com/v1/albums/${id}/tracks?`))throw new Error('Invalid album pagination');const result=await spotifyGet(url);tracks.push(...(result.items||[]));url=result.next;}if(url)throw new Error('Album exceeds pagination limit');return {tracks:tracks.map(t=>normalize({...t,album})).filter(Boolean)};
        }
        case 'artist': {
          if(!/^spotify:artist:[A-Za-z0-9]{22}$/.test(args.uri||''))throw new Error('Invalid artist URI');
          const result=await spotifyGet(`https://api.spotify.com/v1/artists/${args.uri.split(':')[2]}/top-tracks`);return {tracks:(result.tracks||[]).map(normalize).filter(Boolean)};
        }
        case 'artistProfile': {
          let uri=args.uri;
          if(!/^spotify:artist:[A-Za-z0-9]{22}$/.test(uri||'')) {
            if(typeof args.name!=='string'||args.name.length>300)throw new Error('Artist name required');
            const result=await spotifyGet(`https://api.spotify.com/v1/search?type=artist&limit=50&q=${encodeURIComponent(args.name)}`),match=result.artists?.items?.find(a=>a.name.toLocaleLowerCase()===args.name.toLocaleLowerCase());if(!match)throw new Error('Spotify artist not found');uri=match.uri;
          }
          const artist=await spotifyGet(`https://api.spotify.com/v1/artists/${uri.split(':')[2]}`),songs=await request('artist',{uri});
          return {success:true,artist:{name:artist.name,avatar:image(artist.images?.[0]?.url),bio:artist.genres?.length?`Spotify genres: ${artist.genres.join(', ')}`:'Spotify artist · biography unavailable through this API',isVerified:false,tracks:songs.tracks,uri}};
        }
        case 'createPlaylist': {
          if(typeof args.name!=='string'||!args.name.trim()||args.name.length>100)throw new Error('Playlist name required');
          const result=check(await S.CosmosAsync.post('https://api.spotify.com/v1/me/playlists',{name:args.name,public:false}));return {uri:result.uri,name:result.name};
        }
        case 'addPlaylist': {
          if(!/^spotify:playlist:[A-Za-z0-9]{22}$/.test(args.playlist||'')||!/^spotify:track:[A-Za-z0-9]{22}$/.test(args.uri||''))throw new Error('Valid Spotify playlist and track required');
          return check(await S.CosmosAsync.post(`https://api.spotify.com/v1/playlists/${args.playlist.split(':')[2]}/items`,{uris:[args.uri]}));
        }
        case 'removePlaylist': {
          if(!/^spotify:playlist:[A-Za-z0-9]{22}$/.test(args.playlist||'')||!/^spotify:track:[A-Za-z0-9]{22}$/.test(args.uri||''))throw new Error('Valid Spotify playlist and track required');
          return check(await S.CosmosAsync.del(`https://api.spotify.com/v1/playlists/${args.playlist.split(':')[2]}/items`,{items:[{uri:args.uri}]}));
        }
        case 'queue': if (!/^spotify:track:[A-Za-z0-9]{22}$/.test(args.uri || '')) throw new Error('Invalid track URI'); await S.addToQueue([{uri:args.uri}]); return true;
        case 'lyrics': {
          if (!/^spotify:track:[A-Za-z0-9]{22}$/.test(args.uri || '')) return null;
          const result = check(await S.CosmosAsync.get(`https://spclient.wg.spotify.com/color-lyrics/v2/track/${args.uri.split(':')[2]}?format=json&vocalRemoval=false&market=from_token`));
          if (!result.lyrics?.lines?.length) return null;
          const synced = result.lyrics.syncType === 'LINE_SYNCED';
          return { success:true, source:'Spotify', lyrics:result.lyrics.lines.map(line => { if (!synced) return line.words; const seconds=Number(line.startTimeMs)/1000; return `[${Math.floor(seconds/60)}:${(seconds%60).toFixed(2).padStart(5,'0')}]${line.words}`; }).join('\n') };
        }
        case 'exit': S.Platform.History.push('/'); return true;
        default: throw new Error('Unsupported bridge operation');
      }
    }
    window.addEventListener('message', async event => {
      const message = event.data;
      if (event.origin !== connection.origin || event.source !== window.RiffifyFrame?.contentWindow || message?.riffify !== 1 || !Number.isSafeInteger(message.id)) return;
      try {
        let value;
        if (['play','pause','toggle','seek'].includes(message.method)) { activeCommand = activeCommand.catch(() => {}).then(() => request(message.method, message.args || {})); value = await activeCommand; }
        else value = await request(message.method, message.args || {});
        post({ id:message.id,value });
      } catch (error) { post({ id:message.id,error:String(error.message || 'Spotify operation failed') }); }
    });
    const report = async () => {
      if(handlingEnd)return;
      const data = snapshot(); post({ snapshot:data });
      data.sampledAt=performance.now();
      lastSnapshot=data;
      if (!data.track || sampling || !data.playing && !wasPlaying) return;
      wasPlaying=data.playing;
      sampling = true;
      try { await fetch(`${connection.origin}/session/${connection.token}/api/riffify/sample`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ ...data, rate:1,context:P.data?.context?.uri||'' }), signal:AbortSignal.timeout(3000) }); } catch (_) {} finally { sampling = false; }
    };
    const song = async () => {
      const current=snapshot();
      // shortcut: songchange exposes no verified end reason; use observed progress until a supported completion signal exists.
      const expectedProgress=lastSnapshot?.position+(lastSnapshot?.playing?Math.max(0,performance.now()-(lastSnapshot.sampledAt||performance.now())):0);
      if(window.RiffifyFrame && managedUri && lastSnapshot?.track?.uri===managedUri && current.track?.uri!==managedUri && lastSnapshot.duration>0 && expectedProgress>=lastSnapshot.duration-1500) {
        const ended=managedUri;managedUri=null;handlingEnd=true;
        try {await request('pause',{});post({ended});}catch(error){post({error:error.message});}finally{handlingEnd=false;}
        return;
      }
      if(managedUri && current.track?.uri!==managedUri)managedUri=null;
      report();
    }; P.addEventListener('songchange',song); P.addEventListener('onplaypause',report);
    const progress=()=>{if(handlingEnd||!window.RiffifyFrame)return;const data=snapshot();data.sampledAt=performance.now();lastSnapshot=data;post({snapshot:data});};P.addEventListener('onprogress',progress);
    const timer = setInterval(report,1000);
    window.addEventListener('beforeunload', () => { clearInterval(timer); clearTimeout(readyTimer); P.removeEventListener('songchange',song); P.removeEventListener('onplaypause',report);P.removeEventListener('onprogress',progress); });
    S.Platform.History.push('/riffify');
    report();
  }
  start();
})();
