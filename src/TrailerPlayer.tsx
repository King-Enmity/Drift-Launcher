import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import type { Trailer } from './types';

export default function TrailerPlayer({ trailer, steamAppId }: { trailer: Trailer; steamAppId?: number }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [failure, setFailure] = useState('');

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    setFailure('');
    video.muted = false; // Play with sound when the user presses Play.
    video.volume = 1;
    let hls: Hls | undefined;
    const onError = () => setFailure('This trailer could not be played in Drift.');
    video.addEventListener('error', onError);
    const isHls = trailer.format === 'hls' || /\.m3u8(?:\?|$)/i.test(trailer.url);
    if (isHls) {
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = trailer.url;
      } else if (Hls.isSupported()) {
        hls = new Hls({ enableWorker: true, maxBufferLength: 30 });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) setFailure('The Steam trailer stream is unavailable in this player.');
        });
        hls.loadSource(trailer.url);
        hls.attachMedia(video);
      } else {
        setFailure('This device does not support the audio-capable trailer format.');
      }
    } else {
      video.src = trailer.url;
    }
    return () => {
      video.pause();
      video.removeEventListener('error', onError);
      hls?.destroy();
      video.removeAttribute('src');
      video.load();
    };
  }, [trailer.url, trailer.format]);

  return <div className="trailer-player">
    <video ref={videoRef} controls playsInline preload="metadata" poster={trailer.thumbnail}
      aria-label={trailer.name}/>
    {failure && <div className="store-video-error">{failure}
      {steamAppId ? <a href={'https://store.steampowered.com/app/' + steamAppId + '/'} target="_blank" rel="noreferrer">Watch on Steam</a> : null}
    </div>}
  </div>;
}
