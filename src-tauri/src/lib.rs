mod steam;
use serde::{Deserialize, Serialize};
use std::{fs, fs::File, io::Read, path::{Path, PathBuf}, process::Command};
use sha2::{Digest, Sha256};
use tauri::Manager;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ClientRequirement {
    build_label: Option<String>,
    sha256: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ClientInstallation {
    id: String,
    label: String,
    executable: String,
}

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
    client_requirement: Option<ClientRequirement>,
    #[serde(default)]
    client_installation_id: Option<String>,
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
    #[serde(default)]
    launch_method: Option<String>,
    artwork_url: Option<String>,
    description: Option<String>,
    #[serde(default)]
    steam_metadata: Option<steam::SteamMetadata>,
    profiles: Vec<LaunchProfile>,
    #[serde(default)]
    client_installations: Vec<ClientInstallation>,
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

fn selected_executable(game: &Game, profile: &LaunchProfile) -> Result<PathBuf, String> {
    if let Some(id) = profile.client_installation_id.as_deref() {
        // Fail closed if the selected client was removed. Never silently launch a
        // different build when a profile is bound to an explicit local install.
        return game.client_installations.iter().find(|client| client.id == id)
            .map(|client| PathBuf::from(&client.executable))
            .ok_or("This profile's selected client installation is missing. Reassign it under Community Profiles.".into());
    }
    Ok(PathBuf::from(profile.executable.as_deref().unwrap_or(&game.executable)))
}

fn sha256_file(path: &Path) -> Result<String, String> {
    let mut input = File::open(path).map_err(|e| format!("Unable to inspect client executable: {e}"))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 128 * 1024];
    loop {
        let amount = input.read(&mut buffer).map_err(|e| format!("Unable to read client executable: {e}"))?;
        if amount == 0 { break; }
        hasher.update(&buffer[..amount]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ClientVerification {
    executable: String,
    actual_sha256: String,
    expected_sha256: Option<String>,
    matched: Option<bool>,
    build_label: Option<String>,
}

#[tauri::command]
async fn verify_profile_client(app: tauri::AppHandle, game_id: String, profile_id: String)
    -> Result<ClientVerification, String> {
    let library = load_library(app)?;
    let game = library.games.iter().find(|g| g.id == game_id)
        .ok_or("Game not found in your Drift library.")?;
    let profile = game.profiles.iter().find(|p| p.id == profile_id)
        .ok_or("Profile not found.")?;
    let path = selected_executable(game, profile)?;
    if !path.is_file() { return Err("The selected client executable was not found.".into()); }
    let expected = profile.client_requirement.as_ref().and_then(|r| r.sha256.as_deref())
        .map(|s| s.to_lowercase());
    let build_label = profile.client_requirement.as_ref().and_then(|r| r.build_label.clone());
    let hash_path = path.clone();
    let actual = tauri::async_runtime::spawn_blocking(move || sha256_file(&hash_path))
        .await.map_err(|e| format!("Client verification failed: {e}"))??;
    let matched = expected.as_ref().map(|e| *e == actual);
    Ok(ClientVerification {
        executable: path.to_string_lossy().into_owned(), actual_sha256: actual,
        expected_sha256: expected, matched, build_label,
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LaunchOutcome {
    method: String,
    message: String,
}

#[tauri::command]
async fn launch_game(app: tauri::AppHandle, game: Game) -> Result<LaunchOutcome, String> {
    // Always load persisted state: UI input cannot bypass client requirements.
    let saved = load_library(app)?.games.into_iter()
        .find(|item| item.id == game.id).ok_or("Game not found in the local library")?;
    let profile = saved.profiles.iter()
        .find(|p| p.id == saved.active_profile_id).ok_or("Active profile was not found")?;
    if profile.adapter.as_deref().unwrap_or("standard") != "standard" {
        return Err("This game requires an adapter that Drift does not support yet.".into());
    }

    // Steam-managed games usually need to run through Steam so Steamworks,
    // launch options and any launch wrapper can initialize normally.
    // Only the built-in Default profile may use this method: community profiles
    // must continue to launch their explicitly selected client/adapter.
    let is_default_profile = saved.profiles.first()
        .map(|p| p.id == profile.id).unwrap_or(false);
    let should_launch_steam = is_default_profile
        && saved.steam_app_id.is_some()
        && saved.launch_method.as_deref().unwrap_or("steam") == "steam";

    if should_launch_steam {
        if profile.client_installation_id.is_some()
            || profile.executable.is_some()
            || profile.client_requirement.is_some()
            || !profile.args.is_empty()
            || profile.working_directory.is_some()
        {
            return Err("The Default profile has custom client settings. Select Direct executable in Game Properties to use them, or reset its overrides before launching through Steam.".into());
        }
        let app_id = saved.steam_app_id.ok_or("No Steam App ID configured.")?;
        if app_id == 0 { return Err("Steam App ID must be positive.".into()); }
        // The Steam URI contains *only* an integer from local library data.
        // No shell interpolation or community-supplied arguments are involved.
        open::that(format!("steam://run/{app_id}"))
            .map_err(|e| format!("Could not hand the launch request to Steam: {e}. Check that Steam is installed and that its URL handler is registered."))?;
        return Ok(LaunchOutcome {
            method: "steam".into(),
            message: format!("Requested launch through Steam for {}. Steam will start its installed version.", saved.title),
        });
    }

    let path = selected_executable(&saved, profile)?;
    if !path.is_file() { return Err("Client executable not found. Open Community Profiles and select the correct installation.".into()); }
    if let Some(hash) = profile.client_requirement.as_ref().and_then(|r| r.sha256.as_deref()) {
        if hash.len() != 64 || !hash.bytes().all(|b| b.is_ascii_hexdigit()) {
            return Err("The selected profile has an invalid SHA-256 requirement.".into());
        }
        let path_for_hash = path.clone();
        let actual = tauri::async_runtime::spawn_blocking(move || sha256_file(&path_for_hash))
            .await.map_err(|e| format!("Client verification failed: {e}"))??;
        if !actual.eq_ignore_ascii_case(hash) {
            return Err(format!(
                "Wrong game build for this community profile. Expected SHA-256 {}, found {}. Choose a compatible installation under Community Profiles.",
                hash, actual
            ));
        }
    }
    let mut command = Command::new(&path);
    command.args(&profile.args);
    if let Some(dir) = profile.working_directory.as_ref() {
        if !PathBuf::from(dir).is_dir() { return Err("The profile working directory does not exist.".into()); }
        command.current_dir(dir);
    } else if let Some(parent) = path.parent() { command.current_dir(parent); }
    command.spawn().map_err(|e| format!("Could not launch {}: {e}", saved.title))?;
    Ok(LaunchOutcome {
        method: "direct".into(),
        message: format!("Started {} directly.", saved.title),
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![load_library, save_library, launch_game, verify_profile_client, steam::fetch_steam_metadata])
        .run(tauri::generate_context!())
        .expect("error while running Drift");
}
