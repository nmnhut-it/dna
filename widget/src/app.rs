use crate::chat;
use crate::config::WidgetConfig;
use crate::sse::{self, Notification};
use crate::theme;
use crate::tray::{Tray, TrayCommand};
use egui::{Color32, Pos2, Rounding, Stroke, Vec2};
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
    chat_input: String,
    chat_messages: Vec<ChatMessage>,
    is_waiting: bool,
    ticker_text: String,
    bubble_text: String,
    bubble_visible: bool,
    bubble_start: Option<Instant>,
    sse_rx: mpsc::Receiver<Notification>,
    tray: Tray,
    runtime: Runtime,
    chat_rx: mpsc::Receiver<Result<String, String>>,
    chat_tx: mpsc::Sender<Result<String, String>>,
    start_time: Instant,
    character_texture: Option<egui::TextureHandle>,
    visible: bool,
    pub config_dirty: bool,
}

impl WidgetApp {
    pub fn new(config: WidgetConfig, cc: &eframe::CreationContext<'_>) -> Self {
        let runtime = Runtime::new().expect("Failed to create tokio runtime");
        let (sse_tx, sse_rx) = mpsc::channel();
        let (chat_tx, chat_rx) = mpsc::channel();

        sse::spawn_sse_listener(
            config.base_url(),
            sse_tx,
            runtime.handle().clone(),
        );

        let tray = Tray::new(&config.base_url());
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
            config_dirty: false,
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
        while let Ok(notif) = self.sse_rx.try_recv() {
            self.ticker_text = notif.text.clone();
            if self.state == WidgetState::Idle {
                self.bubble_text = notif.text;
                self.bubble_visible = true;
                self.bubble_start = Some(Instant::now());
            }
        }

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

        if let Some(start) = self.bubble_start {
            if start.elapsed().as_secs() >= 5 {
                self.bubble_visible = false;
                self.bubble_start = None;
            }
        }

        while let Ok(cmd) = self.tray.menu_rx.try_recv() {
            match cmd {
                TrayCommand::ToggleWidget => self.visible = !self.visible,
                TrayCommand::Quit => std::process::exit(0),
            }
        }
    }

    fn render_idle(&mut self, ui: &mut egui::Ui) {
        let theme = theme::get_theme(&self.config.appearance.theme);
        let scale = self.config.appearance.size;

        // Speech bubble
        if self.bubble_visible && !self.bubble_text.is_empty() {
            ui.vertical_centered(|ui| {
                egui::Frame::none()
                    .fill(Color32::WHITE)
                    .stroke(Stroke::new(2.0, theme.border))
                    .rounding(Rounding::same(12))
                    .inner_margin(10.0)
                    .show(ui, |ui| {
                        ui.set_max_width(190.0 * scale);
                        ui.label(
                            egui::RichText::new(&self.bubble_text)
                                .size(12.0 * scale)
                                .color(theme.text_primary),
                        );
                    });
            });
            ui.add_space(6.0);
        }

        // Character with bounce animation
        let elapsed = self.start_time.elapsed().as_secs_f32();
        let bounce_y = (elapsed * 1.2).sin() * 4.0;

        if !self.bubble_visible {
            ui.add_space(20.0);
        }

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
                .rounding(Rounding::same(8))
                .inner_margin(egui::Margin::symmetric(10, 5))
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
        let theme = theme::get_theme(&self.config.appearance.theme);
        let scale = self.config.appearance.size;

        // Messages area
        egui::Frame::none()
            .fill(theme.bg_chat)
            .stroke(Stroke::new(2.0, theme.border))
            .rounding(Rounding::same(12))
            .inner_margin(8.0)
            .show(ui, |ui| {
                ui.set_max_width(220.0 * scale);
                ui.set_max_height(200.0 * scale);

                egui::ScrollArea::vertical()
                    .stick_to_bottom(true)
                    .show(ui, |ui| {
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
                                        .rounding(Rounding::same(8))
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
        [0.0, 0.0, 0.0, 0.0]
    }

    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        self.poll_events();

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

        if !self.visible {
            ctx.request_repaint_after(std::time::Duration::from_millis(100));
            return;
        }

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

        ctx.request_repaint_after(std::time::Duration::from_millis(50));
    }

    fn on_exit(&mut self, _gl: Option<&eframe::glow::Context>) {
        if self.config_dirty {
            self.config.save();
        }
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
