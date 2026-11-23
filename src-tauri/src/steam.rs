use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Trailer {
    name: String,
    thumbnail: Option<String>,
    url: String,
    #[serde(default)]
    format: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SteamMetadata {
    name: String,
    #[serde(default)]
    media_version: u8,
    header_image: Option<String>,
    hero_image: Option<String>,
    cover_image: Option<String>,
    background_image: Option<String>,
    description: Option<String>,
    detailed_description: Option<String>,
    about_the_game: Option<String>,
    supported_languages: Option<String>,
    controller_support: Option<String>,
    content_notice: Option<String>,
    legal_notice: Option<String>,
    supported_platforms: Vec<String>,
    required_age: Option<u32>,
    #[serde(default)]
    features: Vec<String>,
    website: Option<String>,
    minimum_requirements: Option<String>,
    recommended_requirements: Option<String>,
    developer: Option<String>,
    publisher: Option<String>,
    release_date: Option<String>,
    genres: Vec<String>,
    screenshots: Vec<String>,
    trailers: Vec<Trailer>,
}

fn https_url(s: &str) -> Option<String> {
    let s = s.trim();
    if s.starts_with("https://") && s.len() < 2048 { Some(s.to_string()) }
    else { None }
}

fn get_string(obj: &Value, key: &str) -> Option<String> {
    obj.get(key)?.as_str().map(str::to_owned).filter(|v| !v.is_empty())
}

fn asset(app_id: u32, filename: &str) -> String {
    format!("https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/{app_id}/{filename}")
}

#[tauri::command]
pub async fn fetch_steam_metadata(app_id: u32) -> Result<SteamMetadata, String> {
    if app_id == 0 { return Err("Steam App ID must be a positive number.".into()); }
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(14))
        .user_agent("Drift-Launcher/0.1 (personal desktop game library)")
        .build().map_err(|e| e.to_string())?;

    // Public Steam Store endpoint. No Steam API key required; may be rate-limited
    // or change without notice. Do not rely on it as a permanent contract.
    let response = client
        .get("https://store.steampowered.com/api/appdetails")
        .query(&[("appids", app_id.to_string()), ("l", "english".to_string())])
        .send().await.map_err(|e| format!("Steam request failed: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("Steam metadata unavailable (HTTP {}). Try Refresh later.", response.status()));
    }
    let body: Value = response.json().await
        .map_err(|e| format!("Invalid Steam response: {e}"))?;
    let entry = body.get(app_id.to_string().as_str())
        .ok_or_else(|| "Steam did not return this App ID.".to_string())?;
    if entry.get("success").and_then(Value::as_bool) != Some(true) {
        return Err("Steam has no public store metadata for this App ID.".into());
    }
    let data = entry.get("data").ok_or("Steam response is missing game details.")?;
    let name = get_string(data, "name").ok_or("Steam response has no game title.")?;
    let header_image = data.get("header_image").and_then(Value::as_str).and_then(https_url)
        .or_else(|| Some(asset(app_id, "header.jpg")));
    let description = get_string(data, "short_description");
    let detailed_description = get_string(data, "detailed_description");
    let about_the_game = get_string(data, "about_the_game");
    let supported_languages = get_string(data, "supported_languages");
    let controller_support = get_string(data, "controller_support");
    let content_notice = data.get("content_descriptors")
        .and_then(|v| get_string(v, "notes"));
    let legal_notice = get_string(data, "legal_notice");
    let supported_platforms = data.get("platforms").map(|p| {
        [("windows", "Windows"), ("mac", "macOS"), ("linux", "Linux")]
            .iter()
            .filter_map(|(key, label)| if p.get(*key).and_then(Value::as_bool) == Some(true) { Some(label.to_string()) } else { None })
            .collect()
    }).unwrap_or_default();
    let required_age = data.get("required_age").and_then(Value::as_u64)
        .and_then(|age| u32::try_from(age).ok()).filter(|age| *age > 0);
    let website = data.get("website").and_then(Value::as_str).and_then(https_url);
    let minimum_requirements = data.get("pc_requirements").and_then(|v| get_string(v, "minimum"));
    let recommended_requirements = data.get("pc_requirements").and_then(|v| get_string(v, "recommended"));
    let features = data.get("categories").and_then(Value::as_array)
        .map(|items| items.iter().filter_map(|v| get_string(v, "description")).take(12).collect())
        .unwrap_or_default();
    let developer = data.get("developers").and_then(Value::as_array)
        .and_then(|v| v.iter().find_map(Value::as_str)).map(str::to_owned);
    let publisher = data.get("publishers").and_then(Value::as_array)
        .and_then(|v| v.iter().find_map(Value::as_str)).map(str::to_owned);
    let release_date = data.get("release_date").and_then(|v| get_string(v, "date"));

    let genres = data.get("genres").and_then(Value::as_array)
        .map(|items| items.iter().filter_map(|v| get_string(v, "description")).take(8).collect())
        .unwrap_or_default();
    let screenshots = data.get("screenshots").and_then(Value::as_array)
        .map(|items| items.iter().filter_map(|v| v.get("path_full").and_then(Value::as_str).and_then(https_url)).take(18).collect())
        .unwrap_or_default();
    // Steam now primarily serves full trailers via HLS/DASH manifests, often
    // without the older movies[].mp4 field. Prefer HLS for video WITH audio.
    // Do not use Steam's silent microtrailer.mp4 as a full trailer.
    let trailers = data.get("movies").and_then(Value::as_array)
        .map(|items| items.iter().filter_map(|v| {
            let (url, format) = if let Some(hls) = v.get("hls_h264").and_then(Value::as_str).and_then(https_url) {
                (hls, "hls")
            } else {
                let mp4 = v.get("mp4")?;
                let url = mp4.get("max").or_else(|| mp4.get("480"))?.as_str().and_then(https_url)?;
                if url.contains("microtrailer") { return None; }
                (url, "mp4")
            };
            Some(Trailer {
                name: get_string(v, "name").unwrap_or_else(|| "Game trailer".into()),
                thumbnail: v.get("thumbnail").and_then(Value::as_str).and_then(https_url),
                url,
                format: Some(format.to_string()),
            })
        }).take(12).collect()).unwrap_or_default();
    Ok(SteamMetadata {
        name,
        media_version: 2,
        header_image,
        hero_image: Some(asset(app_id, "library_hero.jpg")),
        cover_image: Some(asset(app_id, "library_600x900.jpg")),
        background_image: data.get("background_raw").or_else(|| data.get("background"))
            .and_then(Value::as_str).and_then(https_url),
        description,
        detailed_description,
        about_the_game,
        supported_languages,
        controller_support,
        content_notice,
        legal_notice,
        supported_platforms,
        required_age,
        features,
        website,
        minimum_requirements,
        recommended_requirements,
        developer,
        publisher,
        release_date,
        genres,
        screenshots,
        trailers,
    })
}
