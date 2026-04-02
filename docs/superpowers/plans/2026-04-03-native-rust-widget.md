# Native Rust Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone Rust widget binary using egui/eframe that replaces the Tauri webview, providing a transparent frameless floating Clippy companion with system tray, notification ticker, and mini chat — all configurable via TOML.

**Architecture:** A separate Rust crate in `widget/` talks to the existing Node.js backend at `localhost:3000` via HTTP (chat) and SSE (notifications). The widget renders natively via egui with true OS-level transparency. System tray via `tray-icon`/`muda` crates. Config persisted as TOML.

**Tech Stack:** Rust, egui 0.31, eframe 0.31, reqwest, tokio, tray-icon, muda, serde, toml, image, auto-launch, dirs

---

## File Structure

```
widget/
  Cargo.toml              # Crate manifest with all dependencies
  src/
    main.rs               # Entry: load config, spawn tray + SSE, run eframe
    app.rs                # egui App: widget states (idle/chat), rendering, animations
    config.rs             # WidgetConfig struct, TOML load/save, defaults
    tray.rs               # System tray setup, menu, event receiver
    chat.rs               # Async HTTP client for POST /api/widget/chat
    sse.rs                # Async SSE client for GET /api/events
    theme.rs              # Light/dark color palettes
  assets/
    clippy.png            # Default character sprite (~200x240, transparent bg)
    icon.png              # Tray icon (32x32)
```

---

### Task 1: Scaffold Crate + Config Module

Create the Rust crate with dependencies, and implement the config module with TOML load/save.

**Files:**
- Create: `widget/Cargo.toml`
- Create: `widget/src/main.rs`
- Create: `widget/src/config.rs`

- [ ] **Step 1: Create Cargo.toml**

Create `widget/Cargo.toml`:

```toml
[package]
name = "dna-widget"
version = "0.1.0"
edition = "2021"

[dependencies]
eframe = { version = "0.31", default-features = true }
egui = "0.31"
egui_extras = { version = "0.31", features = ["image"] }
image = { version = "0.25", features = ["png"] }
reqwest = { version = "0.12", features = ["json"] }
tokio = { version = "1", features = ["rt-multi-thread", "macros", "sync"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
toml = "0.8"
dirs = "6"
auto-launch = "0.5"
open = "5"
tray-icon = "0.19"
muda = "0.16"
log = "0.4"
env_logger = "0.11"
```

- [ ] **Step 2: Create config.rs**

Create `widget/src/config.rs`:

```rust
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
        // Check for local widget.toml first, then platform config dir
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
```

- [ ] **Step 3: Create minimal main.rs**

Create `widget/src/main.rs`:

```rust
mod config;

fn main() {
    env_logger::init();
    let config = config::WidgetConfig::load();
    println!("Loaded config: {:?}", config);
    println!("Backend URL: {}", config.base_url());
}
```

- [ ] **Step 4: Verify it compiles**

```bash
cd widget && cargo check
```

Expected: Compiles with no errors (may download crates first time).

- [ ] **Step 5: Commit**

```bash
git add widget/
git commit -m "feat(widget): scaffold Rust crate with config module"
```

---

### Task 2: Theme Module + Chat Client

Create the theme color system and the async HTTP client for the chat API.

**Files:**
- Create: `widget/src/theme.rs`
- Create: `widget/src/chat.rs`

- [ ] **Step 1: Create theme.rs**

Create `widget/src/theme.rs`:

```rust
use egui::Color32;

pub struct Theme {
    pub bg_chat: Color32,
    pub bg_user_msg: Color32,
    pub bg_bot_msg: Color32,
    pub bg_ticker: Color32,
    pub text_primary: Color32,
    pub text_secondary: Color32,
    pub text_ticker: Color32,
    pub accent: Color32,
    pub border: Color32,
    pub input_bg: Color32,
}

pub const LIGHT: Theme = Theme {
    bg_chat: Color32::from_rgba_premultiplied(255, 255, 255, 245),
    bg_user_msg: Color32::from_rgb(227, 242, 253),
    bg_bot_msg: Color32::from_rgb(255, 248, 225),
    bg_ticker: Color32::from_rgba_premultiplied(30, 30, 40, 200),
    text_primary: Color32::from_rgb(51, 51, 51),
    text_secondary: Color32::from_rgb(130, 130, 150),
    text_ticker: Color32::from_rgb(79, 195, 247),
    accent: Color32::from_rgb(255, 179, 0),
    border: Color32::from_rgb(93, 64, 55),
    input_bg: Color32::WHITE,
};

pub const DARK: Theme = Theme {
    bg_chat: Color32::from_rgba_premultiplied(30, 30, 40, 245),
    bg_user_msg: Color32::from_rgb(30, 42, 58),
    bg_bot_msg: Color32::from_rgb(42, 30, 58),
    bg_ticker: Color32::from_rgba_premultiplied(20, 20, 25, 220),
    text_primary: Color32::from_rgb(225, 228, 237),
    text_secondary: Color32::from_rgb(139, 143, 163),
    text_ticker: Color32::from_rgb(79, 195, 247),
    accent: Color32::from_rgb(255, 179, 0),
    border: Color32::from_rgb(140, 110, 90),
    input_bg: Color32::from_rgb(40, 40, 50),
};

pub fn get_theme(name: &str) -> &'static Theme {
    match name {
        "dark" => &DARK,
        _ => &LIGHT,
    }
}
```

- [ ] **Step 2: Create chat.rs**

Create `widget/src/chat.rs`:

```rust
use serde::{Deserialize, Serialize};

#[derive(Serialize)]
struct ChatRequest {
    message: String,
}

#[derive(Deserialize)]
pub struct ChatResponse {
    pub reply: Option<String>,
    pub error: Option<String>,
}

pub async fn send_message(base_url: &str, message: &str) -> Result<String, String> {
    let client = reqwest::Client::new();
    let url = format!("{}/api/widget/chat", base_url);
    let resp = client
        .post(&url)
        .json(&ChatRequest { message: message.to_string() })
        .timeout(std::time::Duration::from_secs(300))
        .send()
        .await
        .map_err(|e| format!("Connection error: {}", e))?;

    let data: ChatResponse = resp
        .json()
        .await
        .map_err(|e| format!("Parse error: {}", e))?;

    match data.reply {
        Some(reply) => Ok(reply),
        None => Err(data.error.unwrap_or_else(|| "Unknown error".into())),
    }
}
```

- [ ] **Step 3: Verify compilation**

```bash
cd widget && cargo check
```

Update `main.rs` to include the modules:

```rust
mod config;
mod theme;
mod chat;

fn main() {
    env_logger::init();
    let config = config::WidgetConfig::load();
    println!("Loaded config, backend at {}", config.base_url());
}
```

- [ ] **Step 4: Commit**

```bash
git add widget/
git commit -m "feat(widget): add theme colors and chat HTTP client"
```

---

### Task 3: SSE Client for Notifications

Create the async SSE consumer that receives live events from the backend.

**Files:**
- Create: `widget/src/sse.rs`

- [ ] **Step 1: Create sse.rs**

Create `widget/src/sse.rs`:

```rust
use serde::Deserialize;
use std::sync::mpsc;
use tokio::runtime::Handle;

#[derive(Debug, Clone)]
pub struct Notification {
    pub text: String,
    pub is_message: bool,
}

#[derive(Deserialize)]
struct SseEvent {
    #[serde(rename = "type")]
    event_type: Option<String>,
    role: Option<String>,
    content: Option<String>,
}

/// Spawns an SSE listener on the tokio runtime.
/// Sends parsed notifications through the channel.
pub fn spawn_sse_listener(
    base_url: String,
    tx: mpsc::Sender<Notification>,
    handle: Handle,
) {
    handle.spawn(async move {
        loop {
            if let Err(e) = listen_sse(&base_url, &tx).await {
                log::warn!("SSE disconnected: {}, reconnecting in 3s...", e);
            }
            tokio::time::sleep(std::time::Duration::from_secs(3)).await;
        }
    });
}

async fn listen_sse(
    base_url: &str,
    tx: &mpsc::Sender<Notification>,
) -> Result<(), String> {
    let url = format!("{}/api/events", base_url);
    let resp = reqwest::get(&url)
        .await
        .map_err(|e| e.to_string())?;

    let mut stream = resp.bytes_stream();
    use futures_util::StreamExt;
    let mut buffer = String::new();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(pos) = buffer.find("\n\n") {
            let event_str = buffer[..pos].to_string();
            buffer = buffer[pos + 2..].to_string();

            if let Some(data) = event_str.strip_prefix("data: ") {
                if let Ok(event) = serde_json::from_str::<SseEvent>(data) {
                    if let Some(notification) = parse_event(&event) {
                        let _ = tx.send(notification);
                    }
                }
            }
        }
    }

    Err("Stream ended".into())
}

fn parse_event(event: &SseEvent) -> Option<Notification> {
    let event_type = event.event_type.as_deref()?;
    let content = event.content.as_deref()?;

    match event_type {
        "message" => {
            let who = if event.role.as_deref() == Some("user") { "User" } else { "DNA" };
            let preview = if content.len() > 60 {
                format!("{}...", &content[..60])
            } else {
                content.to_string()
            };
            Some(Notification {
                text: format!("{}: {}", who, preview),
                is_message: true,
            })
        }
        "log" if event.role.as_deref() == Some("warn") => {
            Some(Notification {
                text: content.to_string(),
                is_message: false,
            })
        }
        _ => None,
    }
}
```

- [ ] **Step 2: Add futures-util dependency**

In `widget/Cargo.toml`, add:

```toml
futures-util = "0.3"
```

- [ ] **Step 3: Add module to main.rs and verify**

Update `widget/src/main.rs`:

```rust
mod config;
mod theme;
mod chat;
mod sse;

fn main() {
    env_logger::init();
    let config = config::WidgetConfig::load();
    println!("Loaded config, backend at {}", config.base_url());
}
```

```bash
cd widget && cargo check
```

- [ ] **Step 4: Commit**

```bash
git add widget/
git commit -m "feat(widget): add SSE client for live notifications"
```

---

### Task 4: System Tray

Create the tray icon with context menu.

**Files:**
- Create: `widget/src/tray.rs`
- Create: `widget/assets/icon.png` (placeholder — use any 32x32 PNG)

- [ ] **Step 1: Create a placeholder icon**

Create `widget/assets/` directory and add a simple 32x32 PNG icon. For now, you can copy the existing `src-tauri/icons/32x32.png`:

```bash
mkdir -p widget/assets
cp src-tauri/icons/32x32.png widget/assets/icon.png
```

- [ ] **Step 2: Create tray.rs**

Create `widget/src/tray.rs`:

```rust
use muda::{Menu, MenuEvent, MenuItem, PredefinedMenuItem};
use std::sync::mpsc;
use tray_icon::{TrayIcon, TrayIconBuilder};
use tray_icon::icon::Icon;

#[derive(Debug, Clone)]
pub enum TrayCommand {
    ToggleWidget,
    OpenDashboard,
    OpenSettings,
    Quit,
}

pub struct Tray {
    _icon: TrayIcon,
    pub menu_rx: mpsc::Receiver<TrayCommand>,
}

impl Tray {
    pub fn new(base_url: &str) -> Self {
        let (tx, rx) = mpsc::channel();

        let toggle = MenuItem::with_id("toggle", "Show/Hide Widget", true, None);
        let dashboard = MenuItem::with_id("dashboard", "Open Dashboard", true, None);
        let settings = MenuItem::with_id("settings", "Settings", true, None);
        let quit = MenuItem::with_id("quit", "Quit DNA", true, None);

        let menu = Menu::new();
        let _ = menu.append(&toggle);
        let _ = menu.append(&dashboard);
        let _ = menu.append(&PredefinedMenuItem::separator());
        let _ = menu.append(&settings);
        let _ = menu.append(&PredefinedMenuItem::separator());
        let _ = menu.append(&quit);

        let icon_bytes = include_bytes!("../assets/icon.png");
        let icon_image = image::load_from_memory(icon_bytes)
            .expect("Failed to load tray icon")
            .into_rgba8();
        let (w, h) = icon_image.dimensions();
        let icon = Icon::from_rgba(icon_image.into_raw(), w, h)
            .expect("Failed to create icon");

        let tray = TrayIconBuilder::new()
            .with_menu(Box::new(menu))
            .with_tooltip("DNA Companion")
            .with_icon(icon)
            .build()
            .expect("Failed to build tray icon");

        let base_url = base_url.to_string();
        let tx_clone = tx.clone();
        std::thread::spawn(move || {
            let menu_rx = MenuEvent::receiver();
            loop {
                if let Ok(event) = menu_rx.recv() {
                    let cmd = match event.id().as_ref() {
                        "toggle" => TrayCommand::ToggleWidget,
                        "dashboard" => {
                            let _ = open::that(&base_url);
                            continue;
                        }
                        "settings" => {
                            let path = crate::config::WidgetConfig::config_path();
                            let _ = open::that(&path);
                            continue;
                        }
                        "quit" => TrayCommand::Quit,
                        _ => continue,
                    };
                    let _ = tx_clone.send(cmd);
                }
            }
        });

        Self { _icon: tray, menu_rx: rx }
    }
}
```

- [ ] **Step 3: Add module to main.rs and verify**

Update `widget/src/main.rs`:

```rust
mod config;
mod theme;
mod chat;
mod sse;
mod tray;

fn main() {
    env_logger::init();
    let config = config::WidgetConfig::load();
    println!("Loaded config, backend at {}", config.base_url());
}
```

```bash
cd widget && cargo check
```

- [ ] **Step 4: Commit**

```bash
git add widget/
git commit -m "feat(widget): add system tray with context menu"
```

---

### Task 5: egui App — Idle State with Character Rendering

Build the main egui application with the idle state: transparent window, character image, bounce animation, and notification ticker.

**Files:**
- Create: `widget/src/app.rs`
- Create: `widget/assets/clippy.png` (character sprite)
- Modify: `widget/src/main.rs`

- [ ] **Step 1: Create a placeholder character sprite**

For now, copy an existing icon or create a simple PNG. We'll replace with proper art later:

```bash
cp src-tauri/icons/128x128.png widget/assets/clippy.png
```

- [ ] **Step 2: Create app.rs**

Create `widget/src/app.rs`:

```rust
use crate::chat;
use crate::config::WidgetConfig;
use crate::sse::{self, Notification};
use crate::theme;
use crate::tray::{Tray, TrayCommand};
use egui::{Color32, Pos2, Rect, Rounding, Stroke, Vec2};
use std::sync::mpsc;
use std::time::Instant;
use tokio::runtime::Runtime;

#[derive(Debug, PartialEq)]
enum WidgetState {
    Idle,
    Chatting,
}

struct ChatMessage {
    role: String,
    text: String,
}

pub struct WidgetApp {
    config: WidgetConfig,
    state: WidgetState,
    // Chat
    chat_input: String,
    chat_messages: Vec<ChatMessage>,
    is_waiting: bool,
    // Notifications
    ticker_text: String,
    bubble_text: String,
    bubble_visible: bool,
    bubble_start: Option<Instant>,
    // SSE
    sse_rx: mpsc::Receiver<Notification>,
    // Tray
    tray: Tray,
    // Async
    runtime: Runtime,
    chat_rx: mpsc::Receiver<Result<String, String>>,
    chat_tx: mpsc::Sender<Result<String, String>>,
    // Animation
    start_time: Instant,
    // Character texture
    character_texture: Option<egui::TextureHandle>,
    // Visibility
    visible: bool,
    // Dragging
    dragging: bool,
    drag_offset: Pos2,
}

impl WidgetApp {
    pub fn new(config: WidgetConfig, cc: &eframe::CreationContext<'_>) -> Self {
        let runtime = Runtime::new().expect("Failed to create tokio runtime");
        let (sse_tx, sse_rx) = mpsc::channel();
        let (chat_tx, chat_rx) = mpsc::channel();

        // Start SSE listener
        sse::spawn_sse_listener(
            config.base_url(),
            sse_tx,
            runtime.handle().clone(),
        );

        // Build tray
        let tray = Tray::new(&config.base_url());

        // Load character texture
        let character_texture = load_character_texture(&cc.egui_ctx, &config.appearance.skin);

        Self {
            config,
            state: WidgetState::Idle,
            chat_input: String::new(),
            chat_messages: Vec::new(),
            is_waiting: false,
            ticker_text: "Connecting...".into(),
            bubble_text: String::new(),
            bubble_visible: false,
            bubble_start: None,
            sse_rx,
            tray,
            runtime,
            chat_rx,
            chat_tx,
            start_time: Instant::now(),
            character_texture,
            visible: true,
            dragging: false,
            drag_offset: Pos2::ZERO,
        }
    }

    fn send_chat_message(&mut self) {
        let msg = self.chat_input.trim().to_string();
        if msg.is_empty() || self.is_waiting {
            return;
        }
        self.chat_messages.push(ChatMessage {
            role: "user".into(),
            text: msg.clone(),
        });
        self.chat_input.clear();
        self.is_waiting = true;

        let base_url = self.config.base_url();
        let tx = self.chat_tx.clone();
        self.runtime.spawn(async move {
            let result = chat::send_message(&base_url, &msg).await;
            let _ = tx.send(result);
        });
    }

    fn poll_events(&mut self) {
        // SSE notifications
        while let Ok(notif) = self.sse_rx.try_recv() {
            self.ticker_text = notif.text.clone();
            if self.state == WidgetState::Idle {
                self.bubble_text = notif.text;
                self.bubble_visible = true;
                self.bubble_start = Some(Instant::now());
            }
        }

        // Chat responses
        while let Ok(result) = self.chat_rx.try_recv() {
            self.is_waiting = false;
            let text = match result {
                Ok(reply) => reply,
                Err(e) => e,
            };
            self.chat_messages.push(ChatMessage {
                role: "assistant".into(),
                text,
            });
        }

        // Bubble timeout (5 seconds)
        if let Some(start) = self.bubble_start {
            if start.elapsed().as_secs() >= 5 {
                self.bubble_visible = false;
                self.bubble_start = None;
            }
        }

        // Tray commands
        while let Ok(cmd) = self.tray.menu_rx.try_recv() {
            match cmd {
                TrayCommand::ToggleWidget => self.visible = !self.visible,
                TrayCommand::Quit => std::process::exit(0),
                _ => {}
            }
        }
    }

    fn render_idle(&mut self, ui: &mut egui::Ui) {
        let t = self.config.appearance.theme.as_str();
        let theme = theme::get_theme(t);
        let scale = self.config.appearance.size;

        // Speech bubble
        if self.bubble_visible && !self.bubble_text.is_empty() {
            let bubble_rect = ui.available_rect_before_wrap();
            let bubble_width = 200.0 * scale;
            let bubble_pos = Pos2::new(
                bubble_rect.center().x - bubble_width / 2.0,
                bubble_rect.min.y,
            );
            let bubble_rect = Rect::from_min_size(bubble_pos, Vec2::new(bubble_width, 0.0));

            egui::Area::new(egui::Id::new("bubble"))
                .fixed_pos(bubble_pos)
                .show(ui.ctx(), |ui| {
                    egui::Frame::none()
                        .fill(Color32::WHITE)
                        .stroke(Stroke::new(2.0, theme.border))
                        .rounding(Rounding::same(12.0))
                        .inner_margin(10.0)
                        .show(ui, |ui| {
                            ui.set_max_width(bubble_width - 24.0);
                            ui.label(
                                egui::RichText::new(&self.bubble_text)
                                    .size(12.0 * scale)
                                    .color(theme.text_primary),
                            );
                        });
                });
        }

        // Character with bounce animation
        let elapsed = self.start_time.elapsed().as_secs_f32();
        let bounce_y = (elapsed * 1.2).sin() * 4.0;

        ui.add_space(if self.bubble_visible { 60.0 } else { 20.0 });

        ui.vertical_centered(|ui| {
            ui.add_space(bounce_y + 4.0);
            if let Some(tex) = &self.character_texture {
                let size = Vec2::new(100.0 * scale, 120.0 * scale);
                let resp = ui.add(
                    egui::Image::new(egui::load::SizedTexture::new(tex.id(), size))
                );
                if resp.clicked() {
                    self.state = WidgetState::Chatting;
                }
                if resp.hovered() {
                    ui.ctx().set_cursor_icon(egui::CursorIcon::PointingHand);
                }
            } else {
                // Fallback: draw a colored circle
                let (rect, resp) = ui.allocate_exact_size(
                    Vec2::new(80.0 * scale, 100.0 * scale),
                    egui::Sense::click(),
                );
                ui.painter().rect_filled(rect, 40.0, theme.accent);
                ui.painter().text(
                    rect.center(),
                    egui::Align2::CENTER_CENTER,
                    "DNA",
                    egui::FontId::proportional(20.0 * scale),
                    theme.text_primary,
                );
                if resp.clicked() {
                    self.state = WidgetState::Chatting;
                }
            }
        });

        // Ticker
        ui.add_space(8.0);
        ui.vertical_centered(|ui| {
            egui::Frame::none()
                .fill(theme.bg_ticker)
                .rounding(Rounding::same(8.0))
                .inner_margin(egui::Margin::symmetric(10.0, 5.0))
                .show(ui, |ui| {
                    ui.set_max_width(200.0 * scale);
                    ui.label(
                        egui::RichText::new(&self.ticker_text)
                            .size(11.0 * scale)
                            .color(theme.text_ticker)
                            .monospace(),
                    );
                });
        });
    }

    fn render_chat(&mut self, ui: &mut egui::Ui) {
        let t = self.config.appearance.theme.as_str();
        let theme = theme::get_theme(t);
        let scale = self.config.appearance.size;

        // Messages area
        egui::Frame::none()
            .fill(theme.bg_chat)
            .stroke(Stroke::new(2.0, theme.border))
            .rounding(Rounding::same(12.0))
            .inner_margin(8.0)
            .show(ui, |ui| {
                ui.set_max_width(220.0 * scale);
                ui.set_max_height(200.0 * scale);

                egui::ScrollArea::vertical()
                    .stick_to_bottom(true)
                    .show(ui, |ui| {
                        // Show last 20 messages
                        let start = self.chat_messages.len().saturating_sub(20);
                        for msg in &self.chat_messages[start..] {
                            let (bg, align) = if msg.role == "user" {
                                (theme.bg_user_msg, egui::Align::RIGHT)
                            } else {
                                (theme.bg_bot_msg, egui::Align::LEFT)
                            };

                            ui.with_layout(
                                egui::Layout::top_down(align),
                                |ui| {
                                    egui::Frame::none()
                                        .fill(bg)
                                        .rounding(Rounding::same(8.0))
                                        .inner_margin(6.0)
                                        .show(ui, |ui| {
                                            ui.set_max_width(180.0 * scale);
                                            ui.label(
                                                egui::RichText::new(&msg.text)
                                                    .size(11.5 * scale)
                                                    .color(theme.text_primary),
                                            );
                                        });
                                },
                            );
                        }

                        if self.is_waiting {
                            ui.label(
                                egui::RichText::new("thinking...")
                                    .size(11.0 * scale)
                                    .color(theme.text_secondary)
                                    .italics(),
                            );
                        }
                    });
            });

        ui.add_space(4.0);

        // Input area
        ui.horizontal(|ui| {
            let resp = ui.add(
                egui::TextEdit::singleline(&mut self.chat_input)
                    .desired_width(160.0 * scale)
                    .hint_text("Ask DNA...")
                    .font(egui::FontId::proportional(12.0 * scale)),
            );

            if resp.lost_focus() && ui.input(|i| i.key_pressed(egui::Key::Enter)) {
                self.send_chat_message();
                resp.request_focus();
            }

            if ui.button(
                egui::RichText::new("Send")
                    .size(12.0 * scale)
            ).clicked() {
                self.send_chat_message();
            }
        });

        // Small character below chat
        ui.add_space(4.0);
        ui.vertical_centered(|ui| {
            if let Some(tex) = &self.character_texture {
                let size = Vec2::new(50.0 * scale, 60.0 * scale);
                ui.add(egui::Image::new(egui::load::SizedTexture::new(tex.id(), size)));
            }
        });
    }
}

impl eframe::App for WidgetApp {
    fn clear_color(&self, _visuals: &egui::Visuals) -> [f32; 4] {
        [0.0, 0.0, 0.0, 0.0] // Fully transparent background
    }

    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        self.poll_events();

        if !self.visible {
            ctx.request_repaint_after(std::time::Duration::from_millis(100));
            return;
        }

        // Handle escape to close chat
        if self.state == WidgetState::Chatting && ctx.input(|i| i.key_pressed(egui::Key::Escape)) {
            self.state = WidgetState::Idle;
        }

        egui::CentralPanel::default()
            .frame(egui::Frame::none())
            .show(ctx, |ui| {
                match self.state {
                    WidgetState::Idle => self.render_idle(ui),
                    WidgetState::Chatting => self.render_chat(ui),
                }
            });

        // Request repaint for animations
        ctx.request_repaint_after(std::time::Duration::from_millis(50));
    }
}

fn load_character_texture(ctx: &egui::Context, skin: &str) -> Option<egui::TextureHandle> {
    let bytes = if skin == "default" {
        include_bytes!("../assets/clippy.png").to_vec()
    } else {
        std::fs::read(skin).ok()?
    };

    let img = image::load_from_memory(&bytes).ok()?.into_rgba8();
    let size = [img.width() as usize, img.height() as usize];
    let pixels = img.into_raw();
    let color_image = egui::ColorImage::from_rgba_unmultiplied(size, &pixels);
    Some(ctx.load_texture("character", color_image, egui::TextureOptions::LINEAR))
}
```

- [ ] **Step 3: Wire up main.rs with eframe**

Replace `widget/src/main.rs` with:

```rust
mod app;
mod chat;
mod config;
mod sse;
mod theme;
mod tray;

use config::WidgetConfig;

fn main() {
    env_logger::init();
    let config = WidgetConfig::load();

    let native_options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_inner_size([240.0 * config.appearance.size, 400.0 * config.appearance.size])
            .with_transparent(true)
            .with_decorations(false)
            .with_always_on_top()
            .with_position([config.position.x, config.position.y])
            .with_taskbar(false),
        ..Default::default()
    };

    let config_clone = config.clone();
    eframe::run_native(
        "DNA Widget",
        native_options,
        Box::new(move |cc| {
            egui_extras::install_image_loaders(&cc.egui_ctx);
            Ok(Box::new(app::WidgetApp::new(config_clone, cc)))
        }),
    )
    .expect("Failed to run widget");

    // Save position on exit
    config.save();
}
```

- [ ] **Step 4: Verify compilation**

```bash
cd widget && cargo check
```

Fix any compilation errors — the main things to watch for:
- `egui::ViewportBuilder` methods may differ slightly between versions
- `egui_extras::install_image_loaders` requires the `image` feature

- [ ] **Step 5: Commit**

```bash
git add widget/
git commit -m "feat(widget): egui app with idle/chat states, character rendering, animations"
```

---

### Task 6: Remove Tauri + Old Widget, Update npm Scripts

Clean up the old Tauri setup and webview widget files.

**Files:**
- Remove: `src-tauri/` (entire directory)
- Remove: `src/web/widget/` (entire directory)
- Modify: `src/web/server.ts` (remove widget static mount)
- Modify: `package.json` (remove tauri deps/scripts, add widget scripts)

- [ ] **Step 1: Remove src-tauri directory**

```bash
rm -rf src-tauri
```

- [ ] **Step 2: Remove src/web/widget directory**

```bash
rm -rf src/web/widget
```

- [ ] **Step 3: Remove widget static mount from server.ts**

In `src/web/server.ts`, remove the line:

```typescript
app.use("/widget", express.static(join(import.meta.dirname, "widget")));
```

- [ ] **Step 4: Update package.json**

Remove `@tauri-apps/cli` from devDependencies and replace the tauri scripts:

In `package.json`, remove:
```json
"tauri:dev": "tauri dev",
"tauri:build": "tauri build"
```

And add:
```json
"widget:dev": "cd widget && cargo run",
"widget:build": "cd widget && cargo build --release"
```

Also remove from devDependencies:
```json
"@tauri-apps/cli": "^2.10.1"
```

- [ ] **Step 5: Verify Node.js still works**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: remove Tauri, replace with native Rust widget"
```

---

### Task 7: Update Documentation

Update CLAUDE.md and README.md to reflect the new Rust widget architecture.

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md`

- [ ] **Step 1: Update CLAUDE.md**

Replace the Desktop Companion (Tauri) section with:

```markdown
**Desktop Companion (Rust Widget):**
- `widget/` — Standalone Rust binary using egui/eframe: transparent frameless floating widget, system tray, mini chat
- `widget/src/app.rs` — egui App: idle state (character + ticker), chat state (messages + input)
- `widget/src/config.rs` — TOML config: backend, appearance, behavior, position, startup
- `widget/src/tray.rs` — System tray icon with context menu (Show/Hide, Dashboard, Settings, Quit)
- `widget/src/chat.rs` — HTTP client for `POST /api/widget/chat`
- `widget/src/sse.rs` — SSE client for live notification ticker
- Widget talks to Node.js backend at `http://localhost:3000`, uses chat ID `999999`
- Config at `widget.toml` or `~/.config/dna/widget.toml`
```

Update Commands section to replace tauri commands:

```markdown
npm run widget:dev   # Run Rust widget (cargo run)
npm run widget:build # Build Rust widget release
```

- [ ] **Step 2: Update README.md**

Replace the "Desktop App (Clippy Mode)" section with:

```markdown
## Desktop Widget (Clippy Mode)

DNA has a native desktop companion — a floating Clippy-style character widget built in Rust with egui.

Prerequisites: [Rust](https://rustup.rs/) installed.

\`\`\`bash
npm run dev              # start the backend first
npm run widget:dev       # then start the widget
\`\`\`

Or for a release build:
\`\`\`bash
npm run widget:build     # builds to widget/target/release/dna-widget
\`\`\`

Features:
- **Floating character** — transparent, frameless, always-on-top, draggable
- **System tray** — right-click for Show/Hide, Dashboard, Settings, Quit
- **Live ticker** — shows Telegram messages and events in real-time
- **Mini chat** — click the character to chat via Claude
- **Fully configurable** — edit `widget.toml` for appearance, behavior, position, backend
- **Cross-platform** — Windows, macOS, Linux
- **Auto-start** — registers with OS startup
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs: update documentation for native Rust widget"
```

---

### Task 8: First Run Test + Position Persistence

Verify everything works end-to-end and add position persistence on exit.

**Files:**
- Modify: `widget/src/app.rs` (save position on exit)
- Modify: `widget/src/main.rs` (handle position save)

- [ ] **Step 1: Add position save on exit**

In `widget/src/app.rs`, add a field `config_dirty: bool` and set it in the drag handler. Then implement `on_exit` to save config:

Add to the `WidgetApp` struct:

```rust
    config_dirty: bool,
```

Initialize to `false` in `new()`.

Add this method to the `impl eframe::App for WidgetApp` block:

```rust
    fn on_exit(&mut self, _gl: Option<&eframe::glow::Context>) {
        if self.config_dirty {
            self.config.save();
        }
    }
```

In the `update()` method, after `poll_events()`, add position tracking:

```rust
        // Track window position for persistence
        if let Some(pos) = ctx.input(|i| i.viewport().outer_rect) {
            let new_x = pos.min.x;
            let new_y = pos.min.y;
            if (new_x - self.config.position.x).abs() > 1.0
                || (new_y - self.config.position.y).abs() > 1.0
            {
                self.config.position.x = new_x;
                self.config.position.y = new_y;
                self.config_dirty = true;
            }
        }
```

- [ ] **Step 2: End-to-end test**

In two terminals:

Terminal 1:
```bash
npm run dev
```

Terminal 2:
```bash
cd widget && cargo run
```

Verify:
1. Widget appears as floating transparent window
2. Character image renders with bounce animation
3. Tray icon appears with working context menu
4. Ticker shows "Connecting..." then updates when backend sends events
5. Click character → chat mode, type message → gets response
6. Escape → back to idle
7. Drag widget, close, reopen → position restored
8. Tray → Open Dashboard → browser opens localhost:3000
9. Tray → Quit → widget exits

- [ ] **Step 3: Commit**

```bash
git add widget/
git commit -m "feat(widget): position persistence and polish"
```
