import { useMemo, useState } from 'react';
import {
  ChevronDown, ChevronLeft, ChevronRight, ExternalLink, Film, Gamepad2,
  Globe2, Image as ImageIcon, Info, Monitor, Play, RefreshCcw, Shield, Sparkles, Tag
} from 'lucide-react';
import type { Game, SteamMetadata } from './types';
import { descriptionVideos, editorialContent, plainText, SteamRichDescription, supportedLanguages } from './steamContent';

type ExpandedMedia = { type:'video'|'image'; src:string; name:string };
type MediaItem = ExpandedMedia & { thumbnail?:string };

function MediaGallery({ game, metadata, onExpand }: {
  game:Game; metadata?:SteamMetadata; onExpand:(media:ExpandedMedia)=>void;
}) {
  const media = useMemo(() => {
    const items:MediaItem[] = [];
    const used = new Set<string>();
    for (const trailer of [...(metadata?.trailers || []), ...descriptionVideos(metadata)]) {
      if (!trailer.url || used.has(trailer.url)) continue;
      used.add(trailer.url);
      items.push({ type:'video', src:trailer.url, name:trailer.name, thumbnail:trailer.thumbnail });
    }
    for (const [index, src] of (metadata?.screenshots || []).entries()) {
      if (used.has(src)) continue;
      used.add(src);
      items.push({ type:'image', src, thumbnail:src, name:game.title+' — Screenshot '+(index+1) });
    }
    if (!items.length) {
      const artwork = metadata?.headerImage || game.artworkUrl;
      if (artwork) items.push({type:'image',src:artwork,name:game.title,thumbnail:artwork});
    }
    return items;
  }, [game.title,game.artworkUrl,metadata]);
  const [index,setIndex] = useState(0);
  const [videoError,setVideoError] = useState(false);
  const current = media[Math.min(index,media.length-1)];
  const choose = (next:number) => { setIndex(Math.max(0,Math.min(media.length-1,next))); setVideoError(false); };

  if (!current) return <div className="store-gallery-empty">
    <ImageIcon size={32}/><strong>Media will appear here</strong>
    <p>Add a Steam App ID and refresh to load videos and screenshots.</p>
  </div>;
  return <div className="store-gallery">
    <div className="store-stage">
      {current.type==='video' ? <>
        <video key={current.src} src={current.src} poster={current.thumbnail} controls playsInline preload="metadata" onError={()=>setVideoError(true)}/>
        {videoError && <div className="store-video-error">Steam's video stream is currently unavailable. You can view this game's media on its Steam page.</div>}
      </> : <button className="store-stage-image" onClick={()=>onExpand(current)} title="Open screenshot">
        <img key={current.src} src={current.src} alt={current.name}/>
        <span className="store-image-expand"><ImageIcon size={15}/> View image</span>
      </button>}
    </div>
    <div className="store-media-controls">
      <button aria-label="Previous media" disabled={media.length<2} onClick={()=>choose((index-1+media.length)%media.length)}><ChevronLeft size={19}/></button>
      <div className="store-media-thumbs">
        {media.map((item,i)=><button key={item.src+i} className={'store-thumb '+(i===index?'store-thumb-current':'')}
          title={item.name} aria-label={item.name} aria-pressed={i===index} onClick={()=>choose(i)}>
          <img loading="lazy" src={item.thumbnail || (item.type==='image'?item.src:metadata?.headerImage)} alt=""/>
          {item.type==='video'&&<span className="store-thumb-play"><Play size={13} fill="currentColor"/></span>}
        </button>)}
      </div>
      <button aria-label="Next media" disabled={media.length<2} onClick={()=>choose((index+1)%media.length)}><ChevronRight size={19}/></button>
    </div>
    <div className="store-gallery-caption">
      <span>{current.type==='video'?<Film size={13}/>:<ImageIcon size={13}/>} {current.name}</span>
      <span>{index+1} / {media.length}</span>
    </div>
  </div>;
}

function Field({label,value}:{label:string;value?:string|number}) {
  return <div className="store-field"><span>{label}</span><strong>{value||'—'}</strong></div>;
}
function Heading({children}:{children:React.ReactNode}) {
  return <div className="section-heading store-section-title">{children}</div>;
}
export default function StorePanel({game,metadata,loading,onRefresh,onExpand}:{
  game:Game;metadata?:SteamMetadata;loading:boolean;onRefresh:()=>void;onExpand:(media:ExpandedMedia)=>void;
}) {
  const [showLegal,setShowLegal]=useState(false);
  const editorial = useMemo(()=>editorialContent(metadata),[metadata]);
  const languages = useMemo(()=>supportedLanguages(metadata?.supportedLanguages),[metadata?.supportedLanguages]);
  const requirements = useMemo(()=>({
    minimum:plainText(metadata?.minimumRequirements),
    recommended:plainText(metadata?.recommendedRequirements)
  }),[metadata?.minimumRequirements,metadata?.recommendedRequirements]);
  const about = metadata?.aboutTheGame || metadata?.detailedDescription;
  const summary = metadata?.description || game.description || 'Game information is not available yet.';

  return <div className="game-body store-layout">
    <section className="store-center">
      <Heading><Film size={17}/><h3>Videos &amp; screenshots</h3><span>
        {(metadata?.trailers?.length||0)+descriptionVideos(metadata).length} videos · {metadata?.screenshots?.length||0} screenshots
      </span></Heading>
      <MediaGallery game={game} metadata={metadata} onExpand={onExpand}/>

      {editorial && <section className="store-editorial">
        <Heading><Sparkles size={17}/><h3>Updates &amp; highlights</h3></Heading>
        <SteamRichDescription html={editorial}/>
      </section>}

      <section className="store-about" id="drift-about">
        <Heading><Info size={17}/><h3>About this game</h3></Heading>
        <p className="store-short-description">{summary}</p>
        {about && <SteamRichDescription html={about}/>}
        {metadata?.genres?.length ? <div className="store-tags">{metadata.genres.map(tag=><span key={tag}>{tag}</span>)}</div>:null}
      </section>

      {(requirements.minimum||requirements.recommended) && <section className="store-requirements">
        <Heading><Monitor size={17}/><h3>System requirements</h3></Heading>
        <div className="store-requirement-columns">
          {requirements.minimum && <div><h4>Minimum</h4><p>{requirements.minimum}</p></div>}
          {requirements.recommended && <div><h4>Recommended</h4><p>{requirements.recommended}</p></div>}
        </div>
      </section>}

      <div className="store-source-note">Game artwork, media, and descriptions are provided by Steam where available. Drift is an independent launcher.</div>
    </section>

    <aside className="store-info">
      <div className="store-product-card">
        {metadata?.headerImage ? <img className="store-product-banner" src={metadata.headerImage} alt={game.title+' artwork'}/>:
          <div className="store-product-placeholder"><div className="store-product-placeholder-inner"><Gamepad2 size={26}/>{game.title}</div></div>}
        <p className="store-product-description">{summary}</p>
        <div className="store-product-fields">
          <Field label="Developer" value={metadata?.developer}/>
          <Field label="Publisher" value={metadata?.publisher}/>
          <Field label="Release date" value={metadata?.releaseDate}/>
          <Field label="Steam App ID" value={game.steamAppId}/>
          {metadata?.controllerSupport && <Field label="Controller" value={metadata.controllerSupport}/>}
          {metadata?.supportedPlatforms?.length ? <Field label="Platforms" value={metadata.supportedPlatforms.join(', ')}/>:null}
        </div>
        {metadata?.genres?.length ? <>
          <div className="store-tag-label"><Tag size={13}/> Genres</div>
          <div className="store-side-tags">{metadata.genres.map(genre=><span key={genre}>{genre}</span>)}</div>
        </>:null}
      </div>

      {(metadata?.features||[]).length>0 && <div className="store-side-panel store-feature-panel">
        <h4><Sparkles size={14}/> Features</h4>
        <ul>{(metadata?.features||[]).map(feature=><li key={feature}>{feature}</li>)}</ul>
      </div>}

      {languages.length>0 && <div className="store-side-panel">
        <h4><Globe2 size={14}/> Supported languages</h4>
        <div className="store-languages">
          {languages.map(lang=><div key={lang}><span>{lang}</span><span className="language-check">✓</span></div>)}
        </div>
        <p className="store-minor-note">Language availability as listed by Steam. Audio and subtitle support may differ.</p>
      </div>}

      {metadata?.contentNotice && <div className="store-side-panel store-notice-panel">
        <h4><Shield size={14}/> Content information</h4>
        <p>{plainText(metadata.contentNotice)}</p>
      </div>}

      {metadata?.requiredAge ? <div className="store-side-panel store-notice-panel">
        <h4><Shield size={14}/> Age information</h4><p>Steam required age: {metadata.requiredAge}+</p>
      </div> : null}

      {metadata?.legalNotice && <div className="store-side-panel">
        <button className="store-disclosure" onClick={()=>setShowLegal(!showLegal)}>
          <Shield size={14}/> Legal &amp; licensing <ChevronDown size={13}/>
        </button>
        {showLegal&&<p className="store-legal">{plainText(metadata.legalNotice)}</p>}
      </div>}

      <div className="store-side-panel store-links-panel">
        <h4>Game resources</h4>
        {game.steamAppId && <a href={'https://store.steampowered.com/app/'+game.steamAppId+'/'} target="_blank" rel="noreferrer">View on Steam <ExternalLink size={14}/></a>}
        {game.steamAppId && <a href={'https://steamcommunity.com/app/'+game.steamAppId} target="_blank" rel="noreferrer">Community hub <ExternalLink size={14}/></a>}
        {game.steamAppId && <a href={'https://store.steampowered.com/news/app/'+game.steamAppId} target="_blank" rel="noreferrer">Official game news <ExternalLink size={14}/></a>}
        {metadata?.website && <a href={metadata.website} target="_blank" rel="noreferrer">Official website <ExternalLink size={14}/></a>}
        {game.steamAppId && <button disabled={loading} onClick={onRefresh}><RefreshCcw size={14} className={loading?'spin':''}/> Refresh Steam metadata</button>}
      </div>
    </aside>
  </div>;
}
