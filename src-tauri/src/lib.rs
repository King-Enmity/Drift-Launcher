mod steam;
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf, process::Command};
use tauri::Manager;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LaunchProfile {
    id: String,
    name: String,
    executable: Option<String>,
    args: Vec<String>,
    working_directory: Option<String>,
    community: Option<String>,
    host: Option<String>,
    adapter: Option<String>,
    #[serde(default)]
    presentation: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Game {
    id: String,
    title: String,
    executable: String,
    steam_app_id: Option<u32>,
    artwork_url: Option<String>,
    description: Option<String>,
    #[serde(default)]
    steam_metadata: Option<steam::SteamMetadata>,
    profiles: Vec<LaunchProfile>,
    active_profile_id: String,
    added_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Library { schema_version: u8, games: Vec<Game> }

fn library_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("library.json"))
}

#[tauri::command]
fn load_library(app: tauri::AppHandle) -> Result<Library, String> {
    let path = library_path(&app)?;
    if !path.exists() { return Ok(Library { schema_version: 1, games: Vec::new() }); }
    let contents = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let library: Library = serde_json::from_str(&contents).map_err(|e| e.to_string())?;
    if library.schema_version != 1 { return Err("Unsupported Drift library version".into()); }
    Ok(library)
}

#[tauri::command]
fn save_library(app: tauri::AppHandle, library: Library) -> Result<(), String> {
    if library.schema_version != 1 { return Err("Unsupported library version".into()); }
    let path = library_path(&app)?;
    let temp = path.with_extension("json.tmp");
    let data = serde_json::to_vec_pretty(&library).map_err(|e| e.to_string())?;
    fs::write(&temp, data).map_err(|e| e.to_string())?;
    // On Windows rename cannot overwrite an existing file. A backup avoids leaving the
    // original removed if the replacement fails, while keeping the implementation simple.
    let backup = path.with_extension("json.bak");
    if path.exists() {
        if backup.exists() { fs::remove_file(&backup).map_err(|e| e.to_string())?; }
        fs::rename(&path, &backup).map_err(|e| e.to_string())?;
    }
    if let Err(error) = fs::rename(&temp, &path) {
        if backup.exists() { let _ = fs::rename(&backup, &path); }
        return Err(error.to_string());
    }
    Ok(())
}

#[tauri::command]
fn launch_game(app: tauri::AppHandle, game: Game) -> Result<(), String> {
    // Resolve against persisted state: never trust a caller-supplied path alone.
    let saved = load_library(app)?.games.into_iter()
        .find(|item| item.id == game.id)
        .ok_or("Game not found in the local library")?;
    let profile = saved.profiles.iter()
        .find(|p| p.id == saved.active_profile_id)
        .ok_or("Active profile was not found")?;

    if profile.adapter.as_deref().unwrap_or("standard") != "standard" {
        return Err("This game requires an adapter that Drift does not support yet.".into());
    }
    let executable = profile.executable.as_deref().unwrap_or(&saved.executable);
    let path = PathBuf::from(executable);
    if !path.is_file() { return Err("Executable not found. Update the game's path.".into()); }
    let mut command = Command::new(&path);
    command.args(&profile.args);
    if let Some(dir) = profile.working_directory.as_ref() {
        if !PathBuf::from(dir).is_dir() { return Err("The profile working directory does not exist.".into()); }
        command.current_dir(dir);
    } else if let Some(parent) = path.parent() { command.current_dir(parent); }
    command.spawn().map_err(|e| format!("Could not launch {}: {e}", saved.title))?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![load_library, save_library, launch_game, steam::fetch_steam_metadata])
        .run(tauri::generate_context!())
        .expect("error while running Drift");
}
