import { useCallback, useEffect, useRef, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import {
  ChevronDown, CircleAlert, Download, ExternalLink, Film, FolderOpen, Gamepad2,
  Image as ImageIcon, Info, Library, MoreHorizontal, Play, Plus, RefreshCcw,
  Search, Settings, ShieldAlert, SlidersHorizontal, Trash2, Upload, X
} from 'lucide-react';
import type { Game, LaunchProfile, Library as LibraryData } from './types';
import { parseImportedProfile, resolvePresentation } from './profilePresentation';
import StorePanel from './StorePanel';
import ClientManager from './ClientManager';
import { fetchSteamMetadata, inDesktop, launchGame, readLibrary, writeLibrary } from './bridge';

const uid = () => crypto.randomUUID();
const initialLibrary: LibraryData = { schemaVersion: 1, games: [] };
const validUrl = (url?: string) => {
  if (!url) return undefined;
  try { const parsed = new URL(url); return parsed.protocol === 'https:' ? url : undefined; }
  catch { return undefined; }
};
const baseProfile = (): LaunchProfile => ({ id: uid(), name: 'Default', args: [], adapter: 'standard' });

function Artwork({ src, alt = '', className = '' }: { src?: string; alt?: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return <div className={'artwork ' + className}>
    {src && !failed ? <img src={src} alt={alt} onError={() => setFailed(true)} /> :
      <div className="art-fallback"><Gamepad2 size={32}/><span>DRIFT</span></div>}
  </div>;
}
function AddGame({ onClose, onAdd }: { onClose: () => void; onAdd: (game: Game) => void }) {
  const [title, setTitle] = useState('');
  const [path, setPath] = useState('');
  const [appId, setAppId] = useState('');
  const browse = async () => {
    if (!inDesktop) return;
    const value = await open({ multiple: false, directory: false });
    if (typeof value === 'string') setPath(value);
  };
  return <div className="modal-scrim" onMouseDown={onClose}><section className="dialog" onMouseDown={e => e.stopPropagation()}>
    <div className="dialog-heading"><h2>Add a game</h2><button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18}/></button></div>
    <p className="muted">Choose an installed game. Add a Steam App ID to automatically load its artwork and details.</p>
    <form onSubmit={e => { e.preventDefault(); if (!title.trim() || !path.trim()) return;
      const profile = baseProfile(); onAdd({ id: uid(), title: title.trim(), executable: path.trim(),
      steamAppId: appId ? Number(appId) : undefined, profiles: [profile], activeProfileId: profile.id, addedAt: new Date().toISOString() }); }}>
      <label>Game title<input value={title} onChange={e => setTitle(e.target.value)} required autoFocus placeholder="New World: Aeternum" /></label>
      <label>Game executable<div className="path-input"><input value={path} onChange={e => setPath(e.target.value)} required placeholder="C:\Games\Game\Game.exe"/><button className="subtle-btn" type="button" onClick={browse}><FolderOpen size={16}/> Browse</button></div></label>
      <label>Steam App ID <span className="optional">(optional)</span><input type="number" min="1" value={appId} onChange={e => setAppId(e.target.value)} placeholder="1063730"/></label>
      <div className="form-footer"><button type="button" className="subtle-btn" onClick={onClose}>Cancel</button><button type="submit" className="blue-btn"><Plus size={17}/> Add Game</button></div>
    </form>
  </section></div>;
}

function App() {
  const [library, setLibrary] = useState<LibraryData>(initialLibrary);
  const libRef = useRef<LibraryData>(initialLibrary);
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'general'|'profiles'|'details'|null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [status, setStatus] = useState('');
  const [working, setWorking] = useState(false);
  const [loadingIds, setLoadingIds] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [media, setMedia] = useState<{ type:'video'|'image'; src:string; name:string }|null>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const pendingRequests = useRef(new Set<string>());

  const save = useCallback(async (next: LibraryData) => {
    // Keep the state and queued saves in order even when multiple metadata requests complete.
    libRef.current = next;
    setLibrary(next);
    try { await writeLibrary(next); }
    catch (err) { setStatus('Could not save Drift library: ' + String(err)); }
  }, []);
  const updateGame = useCallback((gameId: string, update: (game: Game) => Game) => {
    const next = { ...libRef.current, games: libRef.current.games.map(g => g.id === gameId ? update(g) : g) };
    void save(next);
  }, [save]);

  const refresh = useCallback(async (gameId: string, steamAppId: number, silent = false) => {
    if (!inDesktop || pendingRequests.current.has(gameId)) return;
    pendingRequests.current.add(gameId);
    setLoadingIds(v => [...v, gameId]);
    try {
      const metadata = await fetchSteamMetadata(steamAppId);
      updateGame(gameId, g => g.steamAppId === steamAppId ? ({
        ...g,
        title: metadata.name || g.title,
        description: metadata.description || g.description,
        steamMetadata: { ...metadata, fetchedAt: new Date().toISOString() },
      }) : g);
      if (!silent) setStatus('Steam artwork and game details updated.');
    } catch (err) {
      setStatus('Steam metadata: ' + String(err));
    } finally {
      pendingRequests.current.delete(gameId);
      setLoadingIds(v => v.filter(id => id !== gameId));
    }
  }, [updateGame]);

  useEffect(() => {
    readLibrary().then(data => {
      libRef.current = data; setLibrary(data); setSelected(data.games[0]?.id ?? null);
      for (const game of data.games) {
        // Refresh older metadata once after upgrading so existing games gain inline videos,
        // supported languages and richer details without having to be re-added.
        if (game.steamAppId && (!game.steamMetadata || game.steamMetadata.mediaVersion !== 2)) {
          void refresh(game.id, game.steamAppId, true);
        }
      }
    }).catch(err => setStatus(String(err))).finally(() => setReady(true));
  }, [refresh]);

  const games = library.games;
  const active = games.find(g => g.id === selected) ?? games[0];
  const profile = active?.profiles.find(p => p.id === active.activeProfileId);
  const filtered = games.filter(g => g.title.toLowerCase().includes(search.toLowerCase())).sort((a,b) => a.title.localeCompare(b.title));
  const presentation = active ? resolvePresentation(active,profile) : undefined;
  const meta = presentation?.metadata;

  const addGame = (game: Game) => {
    void save({ ...libRef.current, games: [...libRef.current.games, game] });
    setSelected(game.id); setAdding(false);
    if (game.steamAppId) void refresh(game.id, game.steamAppId);
  };

  const play = async () => {
    if (!active) return;
    setWorking(true);
    try { await launchGame(active); setStatus('Launched ' + active.title); }
    catch (err) { setStatus(String(err)); }
    finally { setWorking(false); }
  };

  const importProfile = async (file?: File) => {
    if (!file || !active) return;
    try {
      const manifest = parseImportedProfile(await file.text());
      if (manifest.game?.steamAppId && manifest.game.steamAppId !== active.steamAppId)
        throw Error('This profile is for a different Steam game.');
      const p: LaunchProfile = {
        id: manifest.profile.id, name: manifest.profile.name, community: manifest.profile.publisher,
        adapter: manifest.launch?.adapter || 'standard',
        executable: manifest.launch?.executable, args: manifest.launch?.args || [],
        workingDirectory: manifest.launch?.workingDirectory, host: manifest.connection?.host,
        presentation: manifest.presentation, clientRequirement: manifest.client
      };
      if (active.profiles.some(existing => existing.id === p.id)) throw Error('Profile already installed.');
      updateGame(active.id, g => ({ ...g, profiles: [...g.profiles, p], activeProfileId: p.id }));
      setStatus('Installed '+p.name+'. Select a compatible game client under Community Profiles. Custom adapters are not supported yet.');
    } catch (err) { setStatus('Profile import failed: ' + String(err)); }
  };

  const removeGame = () => {
    if (!active || !confirm('Remove ' + active.title + ' from Drift? This will not uninstall the game.')) return;
    void save({ ...libRef.current, games: libRef.current.games.filter(g => g.id !== active.id) });
    setSelected(games.find(g => g.id !== active.id)?.id ?? null); setSettingsTab(null);
  };

  return <div className="drift-app">
    <header className="app-top"><div className="wordmark"><span className="drift-symbol">D</span><strong>DRIFT</strong></div>
      <nav className="top-links"><button className="top-active">LIBRARY</button><button onClick={() => setStatus('Community discovery is coming later.')}>COMMUNITY</button></nav>
      <div className="top-right"><span className="build-label">DEVELOPMENT</span><button className="icon-btn" title="About Drift" onClick={() => setSettingsTab('general')}><Settings size={18}/></button></div>
    </header>

    <aside className="game-sidebar">
      <div className="sidebar-header"><span>HOME</span><button className="icon-btn" title="Add game" onClick={() => setAdding(true)}><Plus size={18}/></button></div>
      <div className="searchbox"><Search size={15}/><input aria-label="Search games" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search games"/></div>
      <div className="library-sort"><span>GAMES ({filtered.length})</span><SlidersHorizontal size={15}/></div>
      <div className="games-list">{filtered.map(g => <button key={g.id} className={'library-entry ' + (active?.id === g.id ? 'selected' : '')} onClick={() => { setSelected(g.id); setMenuOpen(false); setSettingsTab(null); }}>
        <Artwork src={g.steamMetadata?.coverImage || g.artworkUrl || g.steamMetadata?.headerImage} className="list-art" />
        <span>{g.title}</span>
      </button>)}</div>
      <button className="add-bottom" onClick={() => setAdding(true)}><Plus size={15}/> Add a Game</button>
    </aside>

    <main className="game-main">
      {!ready ? <div className="blank-state">Loading your library…</div> : !active ?
        <div className="blank-state"><Gamepad2 size={54}/><h1>Your worlds. Your games.</h1><p>Add a game to your Drift library to get started.</p><button className="blue-btn" onClick={() => setAdding(true)}><Plus size={17}/> Add Your First Game</button></div> :
        <div className="game-scroll" key={active.id}>
          <div className="hero" style={{ backgroundImage: validUrl(presentation?.heroImage) ? 'linear-gradient(90deg,rgba(8,16,25,.68),transparent 66%),url("' + presentation?.heroImage + '")' : undefined }}>
            <div className="hero-shade"/>
            <div className="hero-title">
              <span className="hero-eyebrow">{presentation?.community ? 'COMMUNITY PROFILE · '+presentation.communityName : 'IN YOUR LIBRARY'}</span>
              <h1>{presentation?.title || active.title}</h1>
              {meta?.genres?.length ? <span className="hero-genres">{meta.genres.slice(0,3).join('  ·  ')}</span> : null}
            </div>
          </div>
          <div className="play-strip">
            <button className="play-main" onClick={play} disabled={working}><Play size={19} fill="currentColor"/>{working ? 'LAUNCHING' : 'PLAY'}</button>
            <div className="play-info"><small>INSTALLATION</small><strong>LOCAL GAME</strong></div>
            <button className="play-mode-button" onClick={() => setSettingsTab('profiles')} title="Switch game profile">
              <span><small>PLAY MODE</small><strong>{presentation?.community ? profile?.name : 'Default — Steam'}</strong></span>
              <ChevronDown size={15}/>
            </button>
            <div className="play-right">
              {active.steamAppId && <button className="strip-btn" title="Refresh Steam artwork & metadata" disabled={loadingIds.includes(active.id)} onClick={() => void refresh(active.id,active.steamAppId!)}><RefreshCcw size={18} className={loadingIds.includes(active.id)?'spin':''}/></button>}
              <div className="menu-anchor"><button className="strip-btn" title="Game options" onClick={() => setMenuOpen(!menuOpen)}><Settings size={19}/></button>
                {menuOpen && <div className="game-menu">
                  <button onClick={() => {setSettingsTab('profiles');setMenuOpen(false);}}><Gamepad2 size={16}/> Community Profiles</button>
                  <button onClick={() => {setSettingsTab('details');setMenuOpen(false);}}><SlidersHorizontal size={16}/> Game Properties</button>
                  {active.steamAppId && <button onClick={() => { void refresh(active.id,active.steamAppId!);setMenuOpen(false);}}><RefreshCcw size={16}/> Refresh Steam Details</button>}
                  <button className="menu-remove" onClick={() => {removeGame();setMenuOpen(false);}}><Trash2 size={16}/> Remove from Drift</button>
                </div>}
              </div>
            </div>
          </div>
          <div className="subnav"><span className="subnav-current">OVERVIEW</span><button onClick={() => setSettingsTab('profiles')}>COMMUNITIES</button><button onClick={() => setSettingsTab('details')}>PROPERTIES</button>
            {active.steamAppId && <a href={'https://store.steampowered.com/app/' + active.steamAppId + '/'} target="_blank" rel="noreferrer">STORE PAGE <ExternalLink size={12}/></a>}</div>
          <StorePanel
            game={active}
            metadata={meta}
            presentation={presentation}
            loading={loadingIds.includes(active.id)}
            onRefresh={() => { if (active.steamAppId) void refresh(active.id, active.steamAppId); }}
            onExpand={item => setMedia(item)}
          />
        </div>}
      <div className="app-status"> <span className="status-dot"/> Drift v0.1.0 · Development <span className="status-right">GAMES LIVE ON.</span></div>
    </main>

    {status && <div className="toast" role="status">{status}<button onClick={() => setStatus('')} aria-label="Dismiss"><X size={15}/></button></div>}
    {adding && <AddGame onClose={() => setAdding(false)} onAdd={addGame}/>}
    {media && <div className="media-backdrop" onMouseDown={() => setMedia(null)}><div className="media-dialog" onMouseDown={e=>e.stopPropagation()}><div className="media-header"><strong>{media.name}</strong><button onClick={() => setMedia(null)} className="icon-btn"><X size={20}/></button></div>{media.type === 'video' ? <video key={media.src} controls autoPlay playsInline src={media.src}/> : <img src={media.src} alt={media.name}/>}</div></div>}
    {settingsTab && <div className="modal-scrim" onMouseDown={() => setSettingsTab(null)}><section className="dialog settings-dialog" onMouseDown={e => e.stopPropagation()}>
      <div className="dialog-heading"><div><small className="eyebrow">DRIFT SETTINGS</small><h2>{settingsTab==='general'?'About Drift':settingsTab==='profiles'?'Community Profiles':'Game Properties'}</h2></div><button className="icon-btn" onClick={() => setSettingsTab(null)}><X size={20}/></button></div>
      {settingsTab==='general'?<div className="modal-copy"><p>Drift v0.1.0 · Development</p><p>Games live on. Drift organizes local games and will support community-maintained multiplayer integrations.</p><p>Custom native adapters and automatic Steam installation detection are not yet implemented.</p></div>:active && settingsTab==='profiles'?
      <div className="profiles-content"><p className="muted">Profiles are kept per game. Community-specific adapters are not yet available in this build.</p><label>Active profile<select value={active.activeProfileId} onChange={e=>updateGame(active.id,g=>({...g,activeProfileId:e.target.value}))}>{active.profiles.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <div className="profile-card"><strong>{profile?.name}</strong><span>Publisher: {profile?.community || 'Local'}</span><span>Adapter: {profile?.adapter || 'standard'}</span>{profile?.host && <span>Host: {profile.host}</span>}{profile?.presentation && <span>Custom game page: {profile.presentation.description ? 'Description' : 'Steam description'} · {profile.presentation.trailers?.length||0} videos · {profile.presentation.screenshots?.length||0} screenshots</span>}{profile?.adapter && profile.adapter!=='standard' && <p className="security-note"><ShieldAlert size={15}/> This adapter is not installed or supported. Drift will refuse to run this profile.</p>}</div>
        {profile && <ClientManager game={active} profile={profile} updateGame={change => updateGame(active.id,change)}/>}
        <input type="file" accept=".gprofile,.json" hidden ref={importInput} onChange={e => {void importProfile(e.target.files?.[0]);e.currentTarget.value='';}}/>
        <div className="settings-actions"><button className="subtle-btn" onClick={()=>importInput.current?.click()}><Upload size={15}/> Import Profile</button>
        {profile && profile.name!=='Default' && <button className="subtle-btn" onClick={() => updateGame(active.id,g=>({ ...g, profiles:g.profiles.filter(p=>p.id!==profile.id), activeProfileId:g.profiles.find(p=>p.name==='Default')?.id||g.profiles[0].id }))}><Trash2 size={15}/> Remove Profile</button>}</div>
      </div>:active && <div className="properties-content">
        <label>Game title<input value={active.title} onChange={e => updateGame(active.id,g=>({...g,title:e.target.value}))}/></label>
        <label>Executable path<input value={active.executable} onChange={e => updateGame(active.id,g=>({...g,executable:e.target.value}))}/></label>
        <label>Steam App ID<input type="number" min="1" value={active.steamAppId||''} onChange={e => updateGame(active.id,g=>({...g,steamAppId:e.target.value?Number(e.target.value):undefined,steamMetadata:undefined}))}/></label>
        <button className="subtle-btn" disabled={!active.steamAppId||loadingIds.includes(active.id)} onClick={()=>void refresh(active.id,active.steamAppId!)}><RefreshCcw size={16}/> Fetch Steam artwork & details</button>
        <label>Custom artwork URL (HTTPS)<input value={active.artworkUrl||''} onChange={e => updateGame(active.id,g=>({...g,artworkUrl:validUrl(e.target.value)}))}/></label>
        <p className="muted">Changing these settings does not modify the game installation.</p>
      </div>}
    </section></div>}
  </div>;
}
export default App;
