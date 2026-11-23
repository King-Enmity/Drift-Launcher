import { invoke } from '@tauri-apps/api/core';
import type { Game, Library, SteamMetadata } from './types';
export const inDesktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
const PREVIEW_KEY = 'drift-preview-library';
const empty: Library = { schemaVersion: 1, games: [] };

export async function readLibrary(): Promise<Library> {
  if (inDesktop) return invoke<Library>('load_library');
  try { return JSON.parse(localStorage.getItem(PREVIEW_KEY) || 'null') || empty; }
  catch { return empty; }
}
export async function writeLibrary(library: Library): Promise<void> {
  if (inDesktop) return invoke('save_library', { library });
  localStorage.setItem(PREVIEW_KEY, JSON.stringify(library));
}
export async function launchGame(game: Game): Promise<void> {
  if (!inDesktop) throw Error('Native game launching requires the Drift desktop app.');
  return invoke('launch_game', { game });
}
export async function fetchSteamMetadata(appId: number): Promise<SteamMetadata> {
  if (!Number.isSafeInteger(appId) || appId <= 0) throw Error('Enter a valid Steam App ID.');
  if (!inDesktop) throw Error('Steam metadata retrieval is available in the desktop app.');
  return invoke<SteamMetadata>('fetch_steam_metadata', { appId });
}
