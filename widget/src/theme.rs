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
