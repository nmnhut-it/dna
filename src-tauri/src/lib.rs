use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

#[tauri::command]
fn open_dashboard(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("dashboard") {
        let _ = window.show();
        let _ = window.set_focus();
    } else {
        let _ = tauri::WebviewWindowBuilder::new(
            &app,
            "dashboard",
            tauri::WebviewUrl::External("http://localhost:3000".parse().unwrap()),
        )
        .title("DNA Dashboard")
        .inner_size(1200.0, 800.0)
        .build();
    }
}

fn toggle_widget(app: &tauri::AppHandle) {
    if let Some(widget) = app.get_webview_window("widget") {
        if widget.is_visible().unwrap_or(false) {
            let _ = widget.hide();
        } else {
            let _ = widget.show();
            let _ = widget.set_focus();
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .setup(|app| {
            // --- Tray icon with context menu ---
            let show_hide = MenuItemBuilder::with_id("show_hide", "Show/Hide Clippy").build(app)?;
            let dashboard = MenuItemBuilder::with_id("dashboard", "Open Dashboard").build(app)?;
            let quit = MenuItemBuilder::with_id("quit", "Quit DNA").build(app)?;

            let menu = MenuBuilder::new(app)
                .items(&[&show_hide, &dashboard, &quit])
                .build()?;

            let _tray = TrayIconBuilder::new()
                .tooltip("DNA Companion")
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, event| {
                    match event.id().as_ref() {
                        "show_hide" => toggle_widget(app),
                        "dashboard" => open_dashboard(app.clone()),
                        "quit" => app.exit(0),
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        toggle_widget(tray.app_handle());
                    }
                })
                .build(app)?;

            // --- Make widget window truly transparent on Windows ---
            #[cfg(target_os = "windows")]
            if let Some(widget_window) = app.get_webview_window("widget") {
                use tauri::window::Color;
                let _ = widget_window.set_background_color(Some(Color(0, 0, 0, 0)));
            }

            // --- Spawn Node.js backend (release only; dev uses beforeDevCommand) ---
            if !cfg!(debug_assertions) {
                use tauri_plugin_shell::ShellExt;
                let shell = app.shell();
                let (mut rx, _child) = shell
                    .command("npx")
                    .args(["tsx", "src/index.ts"])
                    .spawn()
                    .expect("Failed to start DNA backend");

                tauri::async_runtime::spawn(async move {
                    use tauri_plugin_shell::process::CommandEvent;
                    while let Some(event) = rx.recv().await {
                        match event {
                            CommandEvent::Stdout(line) => {
                                let s = String::from_utf8_lossy(&line);
                                log::info!("[backend] {}", s.trim());
                            }
                            CommandEvent::Stderr(line) => {
                                let s = String::from_utf8_lossy(&line);
                                log::warn!("[backend] {}", s.trim());
                            }
                            CommandEvent::Terminated(status) => {
                                log::error!("[backend] Process terminated: {:?}", status);
                                break;
                            }
                            _ => {}
                        }
                    }
                });
            }

            // --- Enable autostart ---
            #[cfg(desktop)]
            {
                use tauri_plugin_autostart::ManagerExt;
                let autostart = app.autolaunch();
                if !autostart.is_enabled().unwrap_or(false) {
                    let _ = autostart.enable();
                }
            }

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![open_dashboard])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
