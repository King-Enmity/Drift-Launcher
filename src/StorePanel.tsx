import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, Film, Gamepad2, Image as ImageIcon, Info, Monitor, Play, RefreshCcw, Sparkles, Tag } from 'lucide-react';
import type { Game, SteamMetadata } from './types';

type MediaItem = { type: 'video' | 'image'; src: string; name: string; thumbnail?: string };
type ExpandedMedia = { type: 'video' | 'image'; src: string; name: string };

function steamText(html?: string) {
  if (!html) return '';
  // Steam descriptions may contain HTML. Display readable plain text, not untrusted HTML.
  const spaced = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|h[1-6]|li|ul|ol)>/gi, '\n\n')
    .replace(/<li(?:\s[^>]*)?>/gi, '• ');
  const doc = new DOMParser().parseFromString(spaced, 'text/html');
  return (doc.body.textContent || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function MediaGallery({ game, metadata, onExpand }: {
  game: Game;
  metadata?: SteamMetadata;
  onExpand: (media: ExpandedMedia) => void;
}) {
  const media = useMemo(() => {
    const items: MediaItem[] = [];
    for (const trailer of metadata?.trailers || []) {
      items.push({ type: 'video', src: trailer.url, thumbnail: trailer.thumbnail, name: trailer.name });
    }
    for (const [index, src] of (metadata?.screenshots || []).entries()) {
      items.push({ type: 'image', src, thumbnail: src, name: game.title + ' — screenshot ' + (index + 1) });
    }
    if (!items.length) {
      const fallback = metadata?.headerImage || game.artworkUrl;
      if (fallback) items.push({ type: 'image', src: fallback, name: game.title });
    }
    return items;
  }, [game.id, game.title, game.artworkUrl, metadata]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const current = media[Math.min(currentIndex, media.length - 1)];
  const pick = (index: number) => setCurrentIndex(Math.max(0, Math.min(media.length - 1, index)));

  if (!current) {
    return <div className="store-gallery-empty">
      <ImageIcon size={32}/>
      <strong>Media will appear here</strong>
      <p>Link a Steam App ID to load trailers and screenshots for this game.</p>
    </div>;
  }

  return <div className="store-gallery">
    <div className="store-stage">
      {current.type === 'video'
        ? <video key={current.src} controls playsInline preload="metadata" poster={current.thumbnail} src={current.src} aria-label={current.name}/>
        : <button className="store-stage-image" onClick={() => onExpand(current)} title="View full-size screenshot">
            <img key={current.src} src={current.src} alt={current.name}/>
            <span className="store-image-expand"><ImageIcon size={15}/> View image</span>
          </button>}
    </div>
    <div className="store-media-controls">
      <button onClick={() => pick((currentIndex - 1 + media.length) % media.length)} disabled={media.length < 2} aria-label="Previous image or trailer">
        <ChevronLeft size={19}/>
      </button>
      <div className="store-media-thumbs" aria-label="Game trailers and screenshots">
        {media.map((item, index) => <button
          key={item.src + index}
          className={'store-thumb ' + (index === currentIndex ? 'store-thumb-current' : '')}
          onClick={() => pick(index)}
          title={item.name}
          aria-label={item.name}
          aria-pressed={index === currentIndex}
        >
          <img loading="lazy" src={item.thumbnail || item.src} alt=""/>
          {item.type === 'video' && <span className="store-thumb-play"><Play size={13} fill="currentColor"/></span>}
        </button>)}
      </div>
      <button onClick={() => pick((currentIndex + 1) % media.length)} disabled={media.length < 2} aria-label="Next image or trailer">
        <ChevronRight size={19}/>
      </button>
    </div>
    <div className="store-gallery-caption">
      <span>{current.type === 'video' ? <Film size={13}/> : <ImageIcon size={13}/>} {current.name}</span>
      <span>{currentIndex + 1} / {media.length}</span>
    </div>
  </div>;
}

function Field({ label, value }: { label: string; value?: string | number }) {
  return <div className="store-field"><span>{label}</span><strong>{value || '—'}</strong></div>;
}

export default function StorePanel({ game, metadata, loading, onRefresh, onExpand }: {
  game: Game;
  metadata?: SteamMetadata;
  loading: boolean;
  onRefresh: () => void;
  onExpand: (media: ExpandedMedia) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const detailText = useMemo(() => steamText(metadata?.detailedDescription), [metadata?.detailedDescription]);
  const minimum = useMemo(() => steamText(metadata?.minimumRequirements), [metadata?.minimumRequirements]);
  const recommended = useMemo(() => steamText(metadata?.recommendedRequirements), [metadata?.recommendedRequirements]);
  const summary = metadata?.description || game.description || 'Game information is not available yet.';
  const longDescription = detailText && detailText !== summary ? detailText : '';
  const displayDescription = expanded ? longDescription : longDescription.slice(0, 1100);
  const requirementsExist = Boolean(minimum || recommended);

  return <div className="game-body store-layout">
    <section className="store-center">
      <div id="drift-media" className="section-heading store-section-title"><Film size={17}/><h3>Media &amp; highlights</h3>
        <span>{(metadata?.trailers?.length || 0) + (metadata?.screenshots?.length || 0)} items</span>
      </div>
      <MediaGallery game={game} metadata={metadata} onExpand={onExpand}/>

      <section id="drift-about" className="store-about">
        <div className="section-heading store-section-title"><Info size={17}/><h3>About this game</h3></div>
        <p className="store-short-description">{summary}</p>
        {longDescription && <div className="store-long-description">
          <p>{displayDescription}{!expanded && longDescription.length > 1100 ? '…' : ''}</p>
          {longDescription.length > 1100 && <button className="store-text-toggle" onClick={() => setExpanded(!expanded)}>
            {expanded ? 'Show less' : 'Read more'}
          </button>}
        </div>}
        {metadata?.genres?.length ? <div className="store-tags">{metadata.genres.map(genre => <span key={genre}>{genre}</span>)}</div> : null}
      </section>

      {requirementsExist && <section id="drift-requirements" className="store-requirements">
        <div className="section-heading store-section-title"><Monitor size={17}/><h3>System requirements</h3></div>
        <div className="store-requirement-columns">
          {minimum && <div><h4>Minimum</h4><p>{minimum}</p></div>}
          {recommended && <div><h4>Recommended</h4><p>{recommended}</p></div>}
        </div>
      </section>}
      <div className="store-source-note">Media and game details are provided by Steam where available. Drift is a separate community game launcher.</div>
    </section>

    <aside className="store-info">
      <div className="store-product-card">
        {metadata?.headerImage ? <img className="store-product-banner" src={metadata.headerImage} alt={game.title + ' cover artwork'}/> :
          <div className="store-product-placeholder"><GameCoverText title={game.title}/></div>}
        <p className="store-product-description">{summary}</p>
        {metadata?.genres?.length ? <div className="store-tag-label"><Tag size={13}/> Genres</div> : null}
        {metadata?.genres?.length ? <div className="store-side-tags">{metadata.genres.map(tag => <span key={tag}>{tag}</span>)}</div> : null}
        <div className="store-product-fields">
          <Field label="Developer" value={metadata?.developer}/>
          <Field label="Publisher" value={metadata?.publisher}/>
          <Field label="Released" value={metadata?.releaseDate}/>
          <Field label="Steam App ID" value={game.steamAppId}/>
        </div>
      </div>

      {(metadata?.features || []).length > 0 && <div className="store-side-panel">
        <h4><Sparkles size={14}/> Game features</h4>
        <ul>{metadata!.features!.slice(0,10).map(feature => <li key={feature}>{feature}</li>)}</ul>
      </div>}
      <div className="store-side-panel store-links-panel">
        <h4>Game resources</h4>
        {game.steamAppId && <a href={'https://store.steampowered.com/app/' + game.steamAppId + '/'} target="_blank" rel="noreferrer">View on Steam <ExternalLink size={14}/></a>}
        {metadata?.website && <a href={metadata.website} target="_blank" rel="noreferrer">Official website <ExternalLink size={14}/></a>}
        {game.steamAppId && <button disabled={loading} onClick={onRefresh}><RefreshCcw size={14} className={loading?'spin':''}/> Refresh game details</button>}
      </div>
    </aside>
  </div>;
}

function GameCoverText({ title }: { title:string }) {
  return <div className="store-product-placeholder-inner"><Gamepad2 size={26}/><span>{title}</span></div>;
}
