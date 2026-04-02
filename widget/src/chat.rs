use serde::{Deserialize, Serialize};

#[derive(Serialize)]
struct ChatRequest {
    message: String,
}

#[derive(Deserialize)]
struct ChatResponse {
    reply: Option<String>,
    error: Option<String>,
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
