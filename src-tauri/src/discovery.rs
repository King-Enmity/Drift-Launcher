//! Read-only discovery of installed games from local launcher manifests.
//! Does not modify files, inspect credentials, or contact a remote service.
use serde::Serialize;
use serde_json::Value;
use std::{collections::HashSet, env, fs, path::{Path, PathBuf}};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredGame {
    pub id: String,
    pub title: String,
    pub source: String,
    pub source_id: String,
    pub steam_app_id: Option<u32>,
    pub executable: Option<String>,
    pub install_directory: String,
}

fn text_file(path: &Path, limit: u64) -> Option<String> {
    if fs::metadata(path).ok()?.len() > limit { return None; }
    fs::read_to_string(path).ok()
}

// Steam's KeyValues1 files are quoted-string token streams. Tokenizing
// quoted values avoids accidentally treating nested subkeys as raw lines.
// We only need the simple textual values "path", "name", and "installdir".
fn kv_strings(source: &str) -> Vec<(String, String)> {
    let data = source.as_bytes();
    let mut words: Vec<String> = Vec::new();
    let mut cursor = 0usize;
    while cursor < data.len() && words.len() < 100_000 {
        match data[cursor] {
            b'"' => {
                cursor += 1;
                let mut token = Vec::new();
                while cursor < data.len() {
                    let ch = data[cursor];
                    if ch == b'"' { cursor += 1; break; }
                    if ch == b'\\' && cursor + 1 < data.len() && (data[cursor+1] == b'\\' || data[cursor+1] == b'"') {
                        token.push(data[cursor+1]);
                        cursor += 2;
                    } else {
                        token.push(ch);
                        cursor += 1;
                    }
                }
                words.push(String::from_utf8_lossy(&token).into_owned());
            },
            b'{' | b'}' => { words.push((data[cursor] as char).to_string()); cursor += 1; },
            b'/' if cursor + 1 < data.len() && data[cursor+1] == b'/' => {
                while cursor < data.len() && data[cursor] != b'\n' { cursor += 1; }
            },
            _ => { cursor += 1; }
        }
    }
    // Return only immediate key/value pairs; braces break adjacency.
    let mut pairs = Vec::new();
    for pair in words.windows(2) {
        if pair[0] != "{" && pair[0] != "}" && pair[1] != "{" && pair[1] != "}" {
            pairs.push((pair[0].clone(), pair[1].clone()));
        }
    }
    pairs
}

fn value<'a>(pairs: &'a [(String, String)], name: &str) -> Option<&'a str> {
    pairs.iter().find(|(key, _)| key.eq_ignore_ascii_case(name)).map(|(_, value)| value.as_str())
}

fn push_existing(dirs: &mut Vec<PathBuf>, unique: &mut HashSet<String>, directory: PathBuf) {
    if !directory.is_dir() { return; }
    let normalized = directory.to_string_lossy().replace('/', "\\").to_lowercase();
    if unique.insert(normalized) { dirs.push(directory); }
}

fn steam_roots() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    let mut unique = HashSet::new();
    for var in ["ProgramFiles(x86)", "ProgramFiles", "LOCALAPPDATA"] {
        if let Some(base) = env::var_os(var) {
            push_existing(&mut dirs, &mut unique, PathBuf::from(base).join("Steam"));
        }
    }
    #[cfg(windows)]
    {
        use winreg::{enums::HKEY_CURRENT_USER, RegKey};
        if let Ok(key) = RegKey::predef(HKEY_CURRENT_USER).open_subkey("Software\\Valve\\Steam") {
            for name in ["SteamPath", "InstallPath"] {
                if let Ok(path) = key.get_value::<String,_>(name) {
                    push_existing(&mut dirs, &mut unique, PathBuf::from(path));
                }
            }
        }
    }
    dirs
}

fn scan_steam() -> Vec<DiscoveredGame> {
    let mut libraries = Vec::new();
    let mut seen_dirs = HashSet::new();
    for root in steam_roots() {
        push_existing(&mut libraries, &mut seen_dirs, root.clone());
        for file in ["steamapps/libraryfolders.vdf", "config/libraryfolders.vdf"] {
            if let Some(content) = text_file(&root.join(file), 3_000_000) {
                for (key, location) in kv_strings(&content) {
                    if key.eq_ignore_ascii_case("path") {
                        push_existing(&mut libraries, &mut seen_dirs, PathBuf::from(location));
                    }
                }
            }
        }
    }
    let mut found = Vec::new();
    let mut seen_ids = HashSet::new();
    for library in libraries {
        let steamapps = library.join("steamapps");
        let Ok(entries) = fs::read_dir(steamapps) else { continue; };
        for item in entries.flatten().take(20_000) {
            let path = item.path();
            let Some(name) = path.file_name().and_then(|s| s.to_str()) else { continue; };
            let Some(app_id) = name.strip_prefix("appmanifest_")
                .and_then(|s| s.strip_suffix(".acf"))
                .and_then(|s| s.parse::<u32>().ok()) else { continue; };
            if app_id == 0 || !seen_ids.insert(app_id) { continue; }
            let Some(content) = text_file(&path, 3_000_000) else { continue; };
            let pairs = kv_strings(&content);
            let Some(title) = value(&pairs,"name").filter(|s| !s.is_empty()) else { continue; };
            let Some(install_dir) = value(&pairs,"installdir").filter(|s| !s.is_empty()) else { continue; };
            let location = library.join("steamapps").join("common").join(install_dir);
            if !location.is_dir() { continue; }
            found.push(DiscoveredGame {
                id: format!("steam:{app_id}"),
                title: title.to_owned(),
                source: "steam".into(),
                source_id: app_id.to_string(),
                steam_app_id: Some(app_id),
                executable: None, // Steam itself knows which executable to run.
                install_directory: location.to_string_lossy().into_owned(),
            });
        }
    }
    found
}

fn epic_field<'a>(value: &'a Value, key: &str) -> Option<&'a str> {
    value.get(key).and_then(Value::as_str).filter(|s| !s.is_empty())
}

fn safe_epic_component(s: &str) -> bool {
    !s.is_empty() && s.len() <= 150 && s.bytes().all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b))
}

fn scan_epic() -> Vec<DiscoveredGame> {
    let Some(program_data) = env::var_os("ProgramData") else { return Vec::new(); };
    let manifest_dir = PathBuf::from(program_data).join("Epic").join("EpicGamesLauncher").join("Data").join("Manifests");
    let Ok(entries) = fs::read_dir(manifest_dir) else { return Vec::new(); };
    let mut found = Vec::new();
    let mut ids = HashSet::new();
    for item in entries.flatten().take(20_000) {
        let path = item.path();
        if path.extension().and_then(|s| s.to_str()) != Some("item") { continue; }
        let Some(content) = text_file(&path, 3_000_000) else { continue; };
        let Ok(manifest) = serde_json::from_str::<Value>(&content) else { continue; };
        if manifest.get("bIsIncompleteInstall").and_then(Value::as_bool) == Some(true) { continue; }
        let Some(name) = epic_field(&manifest,"DisplayName") else { continue; };
        let Some(app_name) = epic_field(&manifest,"AppName") else { continue; };
        if name.to_lowercase().contains("unreal engine") || name.starts_with("UE_") { continue; }
        if !safe_epic_component(app_name) { continue; }
        let Some(folder) = epic_field(&manifest,"InstallLocation") else { continue; };
        let location = PathBuf::from(folder);
        if !location.is_dir() { continue; }
        let key = app_name.to_lowercase();
        if !ids.insert(key) { continue; }
        let namespace = epic_field(&manifest, "CatalogNamespace");
        let catalog = epic_field(&manifest, "CatalogItemId");
        let store_id = match (namespace, catalog) {
            (Some(ns),Some(cat)) if safe_epic_component(ns) && safe_epic_component(cat) =>
                format!("{ns}:{cat}:{app_name}"),
            _ => app_name.to_string()
        };
        let executable = epic_field(&manifest,"LaunchExecutable")
            .map(|relative| location.join(relative.trim_start_matches(['/', '\\'])))
            .filter(|candidate| candidate.is_file())
            .map(|candidate| candidate.to_string_lossy().into_owned());
        found.push(DiscoveredGame {
            id: format!("epic:{app_name}"),
            title: name.to_owned(),
            source: "epic".into(),
            source_id: store_id,
            steam_app_id: None, // A Steam match is a separate, user-confirmed step.
            executable,
            install_directory: folder.to_owned(),
        });
    }
    found
}

#[tauri::command]
pub async fn scan_installed_games() -> Result<Vec<DiscoveredGame>, String> {
    // Filesystem reads can be slow on large drives.
    tauri::async_runtime::spawn_blocking(|| {
        let mut games = scan_steam();
        games.extend(scan_epic());
        games.sort_by(|a,b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
        games
    }).await.map_err(|e| format!("Game discovery failed: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn steam_keyvalues_and_escaped_paths() {
        let pairs = kv_strings(r#""libraryfolders" { "0" { "path" "D:\\SteamLibrary" } }"#);
        assert_eq!(value(&pairs,"path"),Some(r"D:\SteamLibrary"));
        let manifest = kv_strings(r#""AppState" { "appid" "1063730" "name" "New World" "installdir" "New World" }"#);
        assert_eq!(value(&manifest,"name"),Some("New World"));
    }
    #[test]
    fn epic_ids_are_constrained() {
        assert!(safe_epic_component("Fortnite"));
        assert!(!safe_epic_component("bad?launch=other"));
    }
}
