import { invoke } from '@tauri-apps/api/core';
import type { Game, Library } from './types';
export const inDesktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
const DEMO_KEY='drift-preview-library';
const empty:Library={schemaVersion:1,games:[]};
export async function readLibrary():Promise<Library>{if(inDesktop)return invoke<Library>('load_library');try{return JSON.parse(localStorage.getItem(DEMO_KEY)||'null')||empty}catch{return empty}}
export async function writeLibrary(data:Library):Promise<void>{if(inDesktop)return invoke('save_library',{library:data});localStorage.setItem(DEMO_KEY,JSON.stringify(data))}
export async function launchGame(game:Game):Promise<void>{if(!inDesktop)throw new Error('Launching requires the Drift desktop app. The browser preview cannot launch local programs.');return invoke('launch_game',{game})}
