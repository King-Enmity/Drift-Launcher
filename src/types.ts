export type LaunchProfile = { id:string; name:string; executable?:string; args:string[]; workingDirectory?:string; community?:string; host?:string; adapter?:string };
export type Game = { id:string; title:string; executable:string; steamAppId?:number; artworkUrl?:string; description?:string; profiles:LaunchProfile[]; activeProfileId:string; addedAt:string };
export type Library = { schemaVersion:1; games:Game[] };
export type ImportedProfile = { schemaVersion:number; profile:{ id:string; name:string; version?:string; publisher?:string }; game?:{ steamAppId?:number; name?:string }; launch?:{ adapter?:string; executable?:string; args?:string[]; workingDirectory?:string }; connection?:{ host?:string; port?:number } };
