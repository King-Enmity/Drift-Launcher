import { createElement, type ReactNode } from 'react';
import type { SteamMetadata, Trailer } from './types';

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

function safeSteamAsset(url?: string | null): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !/(^|\.)steamstatic\.com$/i.test(parsed.hostname)) return undefined;
    return parsed.href;
  } catch { return undefined; }
}

export function plainText(html?: string): string {
  if (!html) return '';
  const doc = parse(html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(?:p|li|div|h[1-6])>/gi, '\n\n'));
  return (doc.body.textContent || '').replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ').replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n').trim();
}

export function supportedLanguages(html?: string): string[] {
  if (!html) return [];
  const doc = parse(html);
  const text = (doc.body.textContent || '').split(/languages with full audio support/i)[0];
  return text.split(',').map(s => s.replace(/\*/g, '').trim()).filter(Boolean).slice(0, 40);
}

export function descriptionVideos(metadata?: SteamMetadata): Trailer[] {
  const html = metadata?.detailedDescription || metadata?.aboutTheGame;
  if (!html) return [];
  const doc = parse(html);
  const result: Trailer[] = [];
  const used = new Set<string>();
  for (const video of Array.from(doc.querySelectorAll('video'))) {
    // Steam Store's inline video sources are in detailed_description, not the
    // top-level movies array. Prefer MP4 for WebView2's native video element.
    const sources = Array.from(video.querySelectorAll('source'));
    const mp4 = sources.find(node => /mp4/i.test(node.getAttribute('type') || '') || /\.mp4(?:\?|$)/i.test(node.getAttribute('src') || ''));
    const candidate = mp4?.getAttribute('src') || video.getAttribute('src') || sources[0]?.getAttribute('src');
    const url = safeSteamAsset(candidate);
    if (!url || used.has(url)) continue;
    used.add(url);
    result.push({
      name: 'Gameplay highlight ' + (result.length + 1),
      url,
      thumbnail: safeSteamAsset(video.getAttribute('poster')),
    });
    if (result.length >= 12) break;
  }
  return result;
}

function trustedNodes(node: Node, key: string): ReactNode {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  if (node.nodeType !== Node.ELEMENT_NODE) return null;
  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  if (['script', 'style', 'iframe', 'form', 'object', 'embed', 'svg', 'input', 'button'].includes(tag)) return null;
  if (tag === 'img') {
    const src = safeSteamAsset(el.getAttribute('src'));
    return src ? <img key={key} src={src} loading="lazy" alt="Steam game artwork" /> : null;
  }
  if (tag === 'video') {
    const src = safeSteamAsset(
      Array.from(el.querySelectorAll('source')).find(s => (s.getAttribute('type') || '').includes('mp4'))?.getAttribute('src')
      || el.getAttribute('src')
    );
    return src ? <video key={key} src={src} poster={safeSteamAsset(el.getAttribute('poster'))} preload="none" playsInline controls/> : null;
  }
  if (tag === 'source') return null;
  const children = Array.from(el.childNodes).map((child, i) => trustedNodes(child, key + '-' + i));
  const allowed = ['p', 'div', 'br', 'h1', 'h2', 'h3', 'h4', 'strong', 'b', 'em', 'i', 'ul', 'ol', 'li', 'span', 'blockquote'];
  if (allowed.includes(tag)) return createElement(tag, { key }, ...children);
  return <span key={key}>{children}</span>;
}

export function SteamRichDescription({ html }: { html?: string }) {
  if (!html) return null;
  const doc = parse(html);
  const nodes = Array.from(doc.body.childNodes).map((node, index) => trustedNodes(node, String(index)));
  return <div className="steam-rich">{nodes}</div>;
}

export function editorialContent(metadata?: SteamMetadata): string | undefined {
  if (!metadata?.detailedDescription) return undefined;
  const doc = parse(metadata.detailedDescription);
  // Store details can contain announcements ahead of "About this Game".
  // Keep only the editorial preface here; render actual gameplay info below.
  const cutoff = Array.from(doc.querySelectorAll('h1,h2,h3'))
    .find(n => /about (the|this) game/i.test(n.textContent || ''));
  if (!cutoff) return undefined;
  let html = '';
  for (let node = doc.body.firstChild; node && node !== cutoff; node = node.nextSibling) {
    if (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.TEXT_NODE) html += node instanceof Element ? node.outerHTML : (node.textContent || '');
  }
  return html.trim() || undefined;
}
