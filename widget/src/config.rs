use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WidgetConfig {
    #[serde(default = "default_backend")]
    pub backend: BackendConfig,
    #[serde(default)]
    pub appearance: AppearanceConfig,
    #[serde(default)]
    pub behavior: BehaviorConfig,
    #[serde(default)]
    pub position: PositionConfig,
    #[serde(default)]
    pub startup: StartupConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackendConfig {
    #[serde(default = "default_host")]
    pub host: String,
    #[serde(default = "default_port")]
    pub port: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppearanceConfig {
    #[serde(default = "default_skin")]
    pub skin: String,
    #[serde(default = "default_size")]
    pub size: f32,
    #[serde(default = "default_opacity")]
    pub opacity: f32,
    #[serde(default = "default_theme")]
    pub theme: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BehaviorConfig {
    #[serde(default = "default_true")]
    pub always_on_top: bool,
    #[serde(default)]
    pub auto_hide_seconds: u32,
    #[serde(default)]
    pub click_through: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PositionConfig {
    #[serde(default = "default_x")]
    pub x: f32,
    #[serde(default = "default_y")]
    pub y: f32,
    #[serde(default)]
    pub monitor: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StartupConfig {
    #[serde(default = "default_true")]
    pub auto_launch: bool,
    #[serde(default)]
    pub start_minimized: bool,
}

fn default_backend() -> BackendConfig {
    BackendConfig { host: default_host(), port: default_port() }
}
fn default_host() -> String { "localhost".into() }
fn default_port() -> u16 { 3000 }
fn default_skin() -> String { "default".into() }
fn default_size() -> f32 { 1.0 }
fn default_opacity() -> f32 { 0.95 }
fn default_theme() -> String { "light".into() }
fn default_true() -> bool { true }
fn default_x() -> f32 { 1650.0 }
fn default_y() -> f32 { 600.0 }

impl Default for WidgetConfig {
    fn default() -> Self {
        Self {
            backend: default_backend(),
            appearance: AppearanceConfig::default(),
            behavior: BehaviorConfig::default(),
            position: PositionConfig::default(),
            startup: StartupConfig::default(),
        }
    }
}

impl Default for AppearanceConfig {
    fn default() -> Self {
        Self { skin: default_skin(), size: default_size(), opacity: default_opacity(), theme: default_theme() }
    }
}

impl Default for BehaviorConfig {
    fn default() -> Self {
        Self { always_on_top: true, auto_hide_seconds: 0, click_through: false }
    }
}

impl Default for PositionConfig {
    fn default() -> Self {
        Self { x: default_x(), y: default_y(), monitor: 0 }
    }
}

impl Default for StartupConfig {
    fn default() -> Self {
        Self { auto_launch: true, start_minimized: false }
    }
}

impl WidgetConfig {
    pub fn config_path() -> PathBuf {
        let local = PathBuf::from("widget.toml");
        if local.exists() {
            return local;
        }
        let dir = dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("dna");
        dir.join("widget.toml")
    }

    pub fn load() -> Self {
        let path = Self::config_path();
        match fs::read_to_string(&path) {
            Ok(content) => toml::from_str(&content).unwrap_or_default(),
            Err(_) => {
                let config = Self::default();
                config.save();
                config
            }
        }
    }

    pub fn save(&self) {
        let path = Self::config_path();
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Ok(content) = toml::to_string_pretty(self) {
            let _ = fs::write(&path, content);
        }
    }

    pub fn base_url(&self) -> String {
        format!("http://{}:{}", self.backend.host, self.backend.port)
    }
}
