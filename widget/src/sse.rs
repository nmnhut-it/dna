use serde::Deserialize;
use std::sync::mpsc;
use tokio::runtime::Handle;

#[derive(Debug, Clone)]
pub struct Notification {
    pub text: String,
}

#[derive(Deserialize)]
struct SseEvent {
    #[serde(rename = "type")]
    event_type: Option<String>,
    role: Option<String>,
    content: Option<String>,
}

/// Spawns an SSE listener on the tokio runtime.
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
    use futures_util::StreamExt;

    let url = format!("{}/api/events", base_url);
    let resp = reqwest::get(&url)
        .await
        .map_err(|e| e.to_string())?;

    let mut stream = resp.bytes_stream();
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
            })
        }
        "log" if event.role.as_deref() == Some("warn") => {
            Some(Notification {
                text: content.to_string(),
            })
        }
        _ => None,
    }
}
