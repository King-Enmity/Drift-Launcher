import type {
  CommunityPresentation, Game, ImportedProfile, LaunchProfile, MediaMergeMode, SteamMetadata, Trailer
} from './types';

function httpsUrl(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length > 2048) throw Error(label + ' must be a short HTTPS URL.');
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) throw Error('invalid');
    return url.toString();
  } catch { throw Error(label + ' must be a valid HTTPS URL.'); }
}
function text(value: unknown, field: string, limit: number): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > limit) throw Error(field + ' is invalid or too long.');
  return value;
}
function mediaMode(value: unknown, field: string): MediaMergeMode | undefined {
  if (value === undefined) return undefined;
  if (value !== 'inherit' && value !== 'append' && value !== 'replace') throw Error(field + ' must be inherit, append or replace.');
  return value;
}
function validatePresentation(value: unknown): CommunityPresentation | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Presentation must be an object.');
  const p = value as Record<string, unknown>;
  const presentation: CommunityPresentation = {
    title: text(p.title, 'Presentation title', 120),
    description: text(p.description, 'Community description', 12000),
    descriptionMode: undefined,
    heroImage: p.heroImage === undefined ? undefined : httpsUrl(p.heroImage, 'Hero image'),
    headerImage: p.headerImage === undefined ? undefined : httpsUrl(p.headerImage, 'Header image'),
    website: p.website === undefined ? undefined : httpsUrl(p.website, 'Community website'),
    screenshotsMode: mediaMode(p.screenshotsMode, 'screenshotsMode'),
    trailersMode: mediaMode(p.trailersMode, 'trailersMode'),
  };
  if (p.descriptionMode !== undefined) {
    if (p.descriptionMode !== 'append' && p.descriptionMode !== 'replace') throw Error('descriptionMode must be append or replace.');
    presentation.descriptionMode = p.descriptionMode;
  }
  if (p.screenshots !== undefined) {
    if (!Array.isArray(p.screenshots) || p.screenshots.length > 30) throw Error('Up to 30 community screenshots are allowed.');
    presentation.screenshots = p.screenshots.map((url, index) => httpsUrl(url, 'Screenshot ' + (index + 1)));
  }
  if (p.trailers !== undefined) {
    if (!Array.isArray(p.trailers) || p.trailers.length > 12) throw Error('Up to 12 community videos are allowed.');
    presentation.trailers = p.trailers.map((item, index): Trailer => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw Error('Invalid community video.');
      const trailer = item as Record<string, unknown>;
      const url = httpsUrl(trailer.url, 'Video URL');
      // Community media may use standard MP4 or HLS streams only.
      const format = trailer.format === undefined ?
        (/\.m3u8(?:\?|$)/i.test(url) ? 'hls' : 'mp4') : trailer.format;
      if (format !== 'hls' && format !== 'mp4') throw Error('Video format must be hls or mp4.');
      return {
        name: text(trailer.name, 'Video name', 160) || 'Community video ' + (index + 1),
        url,
        format,
        thumbnail: trailer.thumbnail === undefined ? undefined : httpsUrl(trailer.thumbnail, 'Video thumbnail'),
      };
    });
  }
  return presentation;
}

export function parseImportedProfile(raw: string): ImportedProfile {
  if (raw.length > 100_000) throw Error('Profile file exceeds 100 KB.');
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw Error('Profile is not valid JSON.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Not a valid profile.');
  const input = value as Record<string, unknown>;
  if (input.schemaVersion !== 1 || !input.profile || typeof input.profile !== 'object' || Array.isArray(input.profile))
    throw Error('Expected Drift profile schemaVersion 1.');
  const p = input.profile as Record<string, unknown>;
  const id = text(p.id, 'Profile ID', 120), name = text(p.name, 'Profile name', 120);
  if (!id?.trim() || !name?.trim() || id === 'default') throw Error('Invalid profile ID or name.');
  const game = input.game as ImportedProfile['game'] | undefined;
  if (game !== undefined && (!game || typeof game !== 'object' || Array.isArray(game))) throw Error('Invalid game reference.');
  if (game?.steamAppId !== undefined && (!Number.isSafeInteger(game.steamAppId) || game.steamAppId <= 0))
    throw Error('Invalid game Steam App ID.');
  const launch = input.launch as ImportedProfile['launch'] | undefined;
  if (launch !== undefined && (!launch || typeof launch !== 'object' || Array.isArray(launch))) throw Error('Invalid launch settings.');
  const args = launch?.args;
  if (args !== undefined && (!Array.isArray(args) || args.length > 64 ||
    args.some(a => typeof a !== 'string' || a.length > 1024))) throw Error('Invalid launch arguments.');
  const connection = input.connection as ImportedProfile['connection'] | undefined;
  if (connection !== undefined && (!connection || typeof connection !== 'object' || Array.isArray(connection))) throw Error('Invalid connection.');
  return {
    schemaVersion: 1,
    profile: { id, name, version: text(p.version, 'Version', 50), publisher: text(p.publisher, 'Publisher', 160) },
    game,
    launch: launch ? {
      adapter: text(launch.adapter, 'Adapter', 120),
      executable: text(launch.executable, 'Executable', 1024),
      workingDirectory: text(launch.workingDirectory, 'Working directory', 1024),
      args,
    } : undefined,
    connection: connection ? { host: text(connection.host, 'Host', 255), port: connection.port } : undefined,
    presentation: validatePresentation(input.presentation),
  };
}

function mediaMerge<T>(steam: T[], additions: T[] | undefined, mode: MediaMergeMode | undefined, key: (item: T) => string): T[] {
  if (!additions || mode === 'inherit') return steam;
  const items = mode === 'replace' ? additions : [...steam, ...additions];
  const seen = new Set<string>();
  return items.filter(item => {
    const identity = key(item);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

export type ActivePresentation = {
  metadata?: SteamMetadata;
  title: string;
  heroImage?: string;
  community: boolean;
  communityName?: string;
  communityWebsite?: string;
};

export function resolvePresentation(game: Game, selected?: LaunchProfile): ActivePresentation {
  // First profile is the built-in local launch. Never permit an imported profile
  // to rewrite the game's Steam metadata or the default page.
  const community = !!selected && selected.id !== game.profiles[0]?.id;
  const p = community ? selected?.presentation : undefined;
  const steam = game.steamMetadata;
  const base: SteamMetadata = steam || {
    name: game.title, description: game.description, genres: [], screenshots: [], trailers: [],
  };
  const replaceDescription = !!p?.description && p.descriptionMode !== 'append';
  const metadata: SteamMetadata = {
    ...base,
    name: p?.title || base.name,
    headerImage: p?.headerImage || base.headerImage,
    heroImage: p?.heroImage || base.heroImage,
    description: p?.description || base.description || game.description,
    detailedDescription: replaceDescription ? undefined : base.detailedDescription,
    aboutTheGame: replaceDescription ? undefined : base.aboutTheGame,
    screenshots: mediaMerge(base.screenshots, p?.screenshots, p?.screenshotsMode ?? 'append', x => x),
    trailers: mediaMerge(base.trailers, p?.trailers, p?.trailersMode ?? 'append', x => x.url),
  };
  return {
    metadata,
    title: p?.title || game.title,
    heroImage: p?.heroImage || base.heroImage || game.artworkUrl,
    community,
    communityName: community ? (selected?.name || 'Community') : undefined,
    communityWebsite: p?.website,
  };
}
