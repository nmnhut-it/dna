// --- State ---
const widget = document.getElementById("widget");
const clippy = document.getElementById("clippy");
const bubble = document.getElementById("speech-bubble");
const bubbleText = document.getElementById("bubble-text");
const tickerText = document.getElementById("ticker-text");
const chatMessages = document.getElementById("chat-messages");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const btnClose = document.getElementById("btn-close");
const btnDashboard = document.getElementById("btn-dashboard");

let isChatting = false;
let isWaiting = false;

// --- Clippy click: toggle chat mode ---
clippy.addEventListener("click", () => {
  if (isChatting) return;
  isChatting = true;
  widget.classList.remove("idle");
  widget.classList.add("chatting");
  chatInput.focus();
});

btnClose.addEventListener("click", () => {
  isChatting = false;
  widget.classList.remove("chatting");
  widget.classList.add("idle");
});

// --- Dashboard button ---
btnDashboard.addEventListener("click", () => {
  if (window.__TAURI__) {
    window.__TAURI__.core.invoke("open_dashboard");
  } else {
    window.open("http://localhost:3000", "_blank");
  }
});

// --- Chat ---
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const message = chatInput.value.trim();
  if (!message || isWaiting) return;

  appendChatMsg("user", message);
  chatInput.value = "";
  isWaiting = true;

  const typingEl = appendChatMsg("typing", "thinking...");

  try {
    const res = await fetch("/api/widget/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    const data = await res.json();
    typingEl.remove();
    if (data.reply) {
      appendChatMsg("assistant", data.reply);
    } else {
      appendChatMsg("assistant", "Sorry, something went wrong.");
    }
  } catch {
    typingEl.remove();
    appendChatMsg("assistant", "Connection error.");
  }

  isWaiting = false;
});

function appendChatMsg(role, text) {
  const div = document.createElement("div");
  div.className = `chat-msg ${role}`;
  div.textContent = text;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return div;
}

// --- SSE Notification Ticker ---
function connectSSE() {
  const es = new EventSource("/api/events");

  es.onopen = () => {
    tickerText.textContent = "DNA is alive";
  };

  es.onerror = () => {
    tickerText.textContent = "Reconnecting...";
  };

  es.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.type === "connected") return;

    let text = "";
    if (data.type === "message") {
      const who = data.role === "user" ? "User" : "DNA";
      const preview = data.content.length > 60
        ? data.content.slice(0, 60) + "..."
        : data.content;
      text = `${who}: ${preview}`;
    } else if (data.type === "log" && data.role === "warn") {
      text = data.content;
    } else {
      return;
    }

    tickerText.textContent = text;

    if (!isChatting) {
      showBubble(text);
    }
  };
}

let bubbleTimer = null;
function showBubble(text) {
  bubbleText.textContent = text;
  bubble.classList.remove("hidden");
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => {
    bubble.classList.add("hidden");
  }, 5000);
}

// --- Escape to close chat ---
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && isChatting) {
    btnClose.click();
  }
});

// --- Init ---
connectSSE();
