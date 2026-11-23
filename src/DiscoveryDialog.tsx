import { useEffect, useState } from 'react';
import { Check, FolderSearch, Gamepad2, LoaderCircle, Search, X } from 'lucide-react';
import type { DiscoveredGame, SteamSearchResult } from './types';
import { scanInstalledGames, searchSteamGames } from './bridge';

export type GameImportSelection = { discovery: DiscoveredGame; matchedSteamAppId?: number };
export default function DiscoveryDialog({ existingKeys, onClose, onImport }: {
  existingKeys: string[];
  onClose: () => void;
  onImport: (games: GameImportSelection[]) => void;
}) {
  const [games,setGames] = useState<DiscoveredGame[]>([]);
  const [busy,setBusy] = useState(true);
  const [error,setError] = useState('');
  const [search,setSearch] = useState('');
  const [selected,setSelected] = useState<string[]>([]);
  const [editing,setEditing] = useState<string|null>(null);
  const [matches,setMatches] = useState<SteamSearchResult[]>([]);
  const [matched,setMatched] = useState<Record<string,number>>({});
  const [matching,setMatching] = useState(false);
  const [matchError,setMatchError] = useState('');

  const scan = async () => {
    setBusy(true); setError('');
    try { setGames(await scanInstalledGames()); }
    catch(e) { setError(String(e)); }
    finally { setBusy(false); }
  };
  useEffect(()=>{void scan()},[]);
  const visible = games.filter(g=>g.title.toLowerCase().includes(search.toLowerCase()));
  const available = games.filter(g=>!existingKeys.includes(g.id));
  const chosen = selected.map(id=>games.find(g=>g.id===id)).filter((g):g is DiscoveredGame=>!!g);
  const beginMatch = async (g:DiscoveredGame) => {
    setEditing(g.id); setMatchError(''); setMatches([]);setMatching(true);
    try { setMatches(await searchSteamGames(g.title)); }
    catch(e){ setMatchError(String(e)); }
    finally { setMatching(false); }
  };
  return <div className="modal-scrim" onMouseDown={onClose}><section className="dialog discovery-dialog" onMouseDown={e=>e.stopPropagation()}>
    <div className="dialog-heading"><div><small className="eyebrow">LOCAL GAME DISCOVERY</small><h2>Find your games</h2></div><button className="icon-btn" onClick={onClose} aria-label="Close"><X size={20}/></button></div>
    <p className="muted">Drift reads Steam and Epic installation records on this computer. Select games to import. No game files are changed.</p>
    <div className="discovery-toolbar"><div className="searchbox"><Search size={15}/><input value={search} placeholder="Filter discovered games" onChange={e=>setSearch(e.target.value)}/></div><button className="subtle-btn" onClick={()=>void scan()} disabled={busy}><FolderSearch size={15}/> Rescan</button></div>
    <div className="discovery-summary">{busy ? 'Scanning local installation records…' : games.length+' found · '+available.length+' not yet in Drift · '+selected.length+' selected'}</div>
    {error&&<p className="discovery-error">{error}</p>}
    <div className="discovery-list">{busy?<div className="discovery-empty"><LoaderCircle className="spin" size={22}/> Looking for games</div>
      :visible.length===0?<div className="discovery-empty">No installed games found for this search. You can still add games manually.</div>
      :visible.map(g=>{
        const already = existingKeys.includes(g.id);
        return <div key={g.id} className={'discovery-game '+(selected.includes(g.id)?'checked':'')}>
          <label className="discovery-select"><input type="checkbox" disabled={already||(!g.steamAppId&&!g.executable)} checked={selected.includes(g.id)}
            onChange={e=>setSelected(v=>e.target.checked?[...v,g.id]:v.filter(x=>x!==g.id))}/>
            <div className="discovery-game-info"><strong>{g.title}</strong><small>{g.source==='steam'?'Steam':'Epic Games'} · {g.installDirectory}</small>
            {already?<small>Already imported</small>:!g.steamAppId&&!g.executable?<small>No executable detected. Add manually instead.</small>:null}
            {g.source==='epic'&&matched[g.id]?<small>Matched to Steam metadata App ID: {matched[g.id]}</small>:null}</div>
          </label>
          {already?<span className="discovery-imported"><Check size={14}/> Added</span>:g.source==='epic'?<button className="discovery-match-btn" onClick={()=>void beginMatch(g)}>Find artwork</button>:<span className="discovery-store-id">{g.steamAppId}</span>}
        </div>;
      })}
    </div>
    {editing && <div className="discovery-matches">
      <div className="dialog-heading"><strong>Match Steam metadata</strong><button className="icon-btn" onClick={()=>setEditing(null)} aria-label="Close metadata matching"><X size={16}/></button></div>
      <p className="muted">Suggestions are not confirmed matches. Choose the correct game, or skip matching and keep the original Epic title.</p>
      {matching?<div className="discovery-empty"><LoaderCircle className="spin" size={17}/> Searching Steam…</div>:
        matchError?<p className="discovery-error">{matchError}</p>:
        <div className="discovery-match-list">{matches.map(m=><button key={m.appId} onClick={()=>{setMatched(v=>({...v,[editing]:m.appId}));setEditing(null)}}>
          {m.artworkUrl?<img src={m.artworkUrl} alt=""/>:<Gamepad2 size={20}/>}<span>{m.name}</span><small>#{m.appId}</small>
        </button>)}{matches.length===0&&<p>No suggested matches found. You can import without artwork and identify it later.</p>}</div>}
      </div>}
    <div className="discovery-footer"><span className="muted">Source scanning is local. Metadata queries use Steam's public store service.</span><button className="subtle-btn" onClick={onClose}>Cancel</button><button className="blue-btn" disabled={busy||chosen.length===0} onClick={()=>onImport(chosen.map(discovery=>({discovery,matchedSteamAppId:matched[discovery.id]})))}>Import {chosen.length} {chosen.length===1?'game':'games'}</button></div>
  </section></div>;
}
