mod config;

fn main() {
    env_logger::init();
    let config = config::WidgetConfig::load();
    println!("Loaded config, backend at {}", config.base_url());
}
