use muda::{Menu, MenuEvent, MenuItem, PredefinedMenuItem};
use std::sync::mpsc;
use tray_icon::{TrayIconBuilder, Icon};

#[derive(Debug, Clone)]
pub enum TrayCommand {
    ToggleWidget,
    Quit,
}

pub struct Tray {
    _icon: tray_icon::TrayIcon,
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
                    let _ = tx.send(cmd);
                }
            }
        });

        Self { _icon: tray, menu_rx: rx }
    }
}
