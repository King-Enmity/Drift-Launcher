import { useEffect, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { CheckCircle2, CircleAlert, FolderOpen, Plus, RefreshCcw, Trash2 } from 'lucide-react';
import type { ClientVerification, Game, LaunchProfile } from './types';
import { inDesktop, verifyProfileClient } from './bridge';

export default function ClientManager({ game, profile, updateGame }: {
  game: Game;
  profile: LaunchProfile;
  updateGame: (change: (game: Game) => Game) => void;
}) {
  const [label, setLabel] = useState('');
  const [executable, setExecutable] = useState('');
  const [checking, setChecking] = useState(false);
  const [verified, setVerified] = useState<ClientVerification | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { setVerified(null); setError(''); }, [game.id, profile.id, profile.clientInstallationId, profile.executable]);
  const selected = (game.clientInstallations || []).find(c => c.id === profile.clientInstallationId);
  const required = profile.clientRequirement;
  const actualPath = selected?.executable || profile.executable || game.executable;
  const chooseFile = async () => {
    if (!inDesktop) return;
    const choice = await open({ multiple: false, directory: false });
    if (typeof choice === 'string') {
      setExecutable(choice);
      if (!label) setLabel(choice.split(/[\\/]/).pop()?.replace(/\.exe$/i, '') || 'Game client');
    }
  };
  const addClient = () => {
    if (!executable.trim() || !label.trim()) { setError('Choose a client executable and enter a label.'); return; }
    const client = { id: crypto.randomUUID(), label: label.trim(), executable: executable.trim() };
    updateGame(g => ({ ...g,
      clientInstallations: [...(g.clientInstallations || []), client],
      profiles: g.profiles.map(p => p.id === profile.id ? { ...p, clientInstallationId: client.id } : p)
    }));
    setLabel(''); setExecutable(''); setVerified(null); setError('');
  };
  const verify = async () => {
    setChecking(true); setError(''); setVerified(null);
    try { setVerified(await verifyProfileClient(game.id, profile.id)); }
    catch(e) { setError(String(e)); }
    finally { setChecking(false); }
  };

  return <div className="client-manager">
    <div className="client-section-title">GAME CLIENT</div>
    <p className="muted">Each community can use a different local client build. Drift never downloads, downgrades or replaces your game files.</p>
    {required?.buildLabel && <div className="client-build-row"><span>Required build</span><strong>{required.buildLabel}</strong></div>}
    {required?.sha256 && <div className="client-requirement"><CheckCircle2 size={15}/> This profile requires an exact SHA-256 match before launch.</div>}
    {!required?.sha256 && <div className="client-advisory"><CircleAlert size={15}/> No executable hash supplied by this profile. Its version cannot be verified automatically.</div>}
    <label>Client installation for this profile
      <select value={profile.clientInstallationId || ''} onChange={e => {
        setVerified(null);
        updateGame(g => ({ ...g, profiles: g.profiles.map(p => p.id===profile.id ? {
          ...p, clientInstallationId: e.target.value || undefined,
          // Explicitly choosing the default installation should not keep a
          // previous profile-specific executable override.
          executable: e.target.value ? p.executable : undefined
        } : p) }));
      }}>
        <option value="">Game default — {game.executable}</option>
        {(game.clientInstallations || []).map(c => <option value={c.id} key={c.id}>{c.label}</option>)}
      </select>
    </label>
    {profile.executable && !profile.clientInstallationId &&
      <div className="client-advisory">This profile currently uses its own executable path. Assign a registered client to manage it here.</div>}
    <div className="client-path" title={actualPath}>{actualPath}</div>
    <div className="client-actions">
      <button className="subtle-btn" disabled={checking || !inDesktop} onClick={() => void verify()}>
        <RefreshCcw size={15} className={checking ? 'spin' : ''}/>{checking ? 'Checking file…' : 'Check executable'}
      </button>
      {selected && <button className="subtle-btn" onClick={() => {
        if (!confirm('Remove this local client entry? The actual game files will not be deleted.')) return;
        updateGame(g => ({
          ...g, clientInstallations: (g.clientInstallations||[]).filter(c=>c.id!==selected.id),
          profiles: g.profiles.map(p=>p.clientInstallationId===selected.id ? {...p,clientInstallationId:undefined} : p)
        }));
      }}><Trash2 size={15}/> Forget client</button>}
    </div>
    {verified && <div className={'client-result '+(verified.matched===false?'client-invalid':'client-valid')}>
      <strong>{verified.matched===true?'Compatible client verified':verified.matched===false?'Wrong client version':'Executable fingerprint calculated'}</strong>
      <span>SHA-256: <code>{verified.actualSha256}</code></span>
      {verified.matched===null || verified.matched===undefined ? <span>There is no publisher-provided checksum to compare against.</span> : null}
    </div>}
    {error && <div className="client-invalid">{error}</div>}
    <div className="client-section-title">REGISTER ANOTHER CLIENT</div>
    <label>Client label<input placeholder="e.g. New World older community build" value={label} onChange={e=>setLabel(e.target.value)} /></label>
    <label>Executable path
      <div className="path-input">
        <input placeholder="D:\\Games\\NewWorld-Older\\Bin64\\NewWorld.exe" value={executable} onChange={e=>setExecutable(e.target.value)}/>
        <button className="subtle-btn" onClick={() => void chooseFile()}><FolderOpen size={16}/> Browse</button>
      </div>
    </label>
    <button className="subtle-btn client-add" onClick={addClient}><Plus size={16}/> Add this client</button>
    <p className="muted client-footnote">Client paths are local to your PC. Community profile files specify compatibility requirements, not where your game is installed.</p>
  </div>;
}
