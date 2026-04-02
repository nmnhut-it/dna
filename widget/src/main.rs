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
}
