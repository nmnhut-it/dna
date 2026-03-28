// --- State ---
let notificationsEnabled = localStorage.getItem("dna-notifications") !== "off";
let currentChatId = null;
let currentSubTab = "history";
let liveFilter = "all";

// --- Notifications ---
function requestNotificationPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
}

function showNotification(role, content, chatId) {
  if (!notificationsEnabled || document.hasFocus()) return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const title = role === "user" ? `Message [${chatId}]` : `DNA replied [${chatId}]`;
  const body = content.length > 100 ? content.slice(0, 100) + "..." : content;
  new Notification(title, { body, tag: `dna-${chatId}-${Date.now()}` });
}

if (notificationsEnabled) requestNotificationPermission();

// --- Tab Navigation ---
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.add("hidden"));
    tab.classList.add("active");
    document.getElementById(`tab-${tab.dataset.tab}`).classList.remove("hidden");
    if (tab.dataset.tab === "chats") loadChatList();
    if (tab.dataset.tab === "settings") loadSettings();
  });
});

// --- SSE Live Feed ---
const feed = document.getElementById("live-feed");
const statusEl = document.getElementById("status");

document.getElementById("live-filter").addEventListener("change", (e) => {
  liveFilter = e.target.value;
});

function connectSSE() {
  const es = new EventSource("/api/events");
  es.onopen = () => { statusEl.textContent = "live"; statusEl.className = "status online"; };
  es.onerror = () => { statusEl.textContent = "offline"; statusEl.className = "status offline"; };
  es.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.type === "connected") return;

    if (liveFilter === "messages" && data.type !== "message") return;
    if (liveFilter === "logs" && data.type !== "log") return;

    const div = document.createElement("div");
    if (data.type === "log") {
      div.className = `log-entry log-${data.role}`;
      const time = new Date(data.timestamp).toLocaleTimeString();
      const chatLabel = data.chatId ? ` [${data.chatId}]` : "";
      div.innerHTML = `<span class="log-time">${time}</span><span class="log-level">${data.role}</span>${chatLabel} ${esc(data.content)}`;
    } else {
      div.className = `msg ${data.role}`;
      const time = new Date(data.timestamp).toLocaleTimeString();
      const label = data.chatId ? ` [${data.chatId}]` : "";
      div.innerHTML = `${esc(data.content)}<div class="meta">${time}${label}</div>`;
      if (data.role === "user") showNotification(data.role, data.content, data.chatId);
    }
    feed.appendChild(div);
    feed.scrollTop = feed.scrollHeight;
  };
}
connectSSE();

// --- Chat List ---
async function loadChatList() {
  const res = await fetch("/api/chats");
  const { chats } = await res.json();
  const list = document.getElementById("chat-list");
  if (!chats.length) { list.innerHTML = '<p class="placeholder">No chats yet</p>'; return; }
  list.innerHTML = chats.map((c) => {
    const label = c.chatId < 0 ? `Group ${c.chatId}` : `Chat ${c.chatId}`;
    const badge = c.personality !== "default" ? `<span class="badge">${c.personality}</span>` : "";
    return `<div class="sidebar-item${c.chatId === currentChatId ? " active" : ""}" data-id="${c.chatId}">
      ${label} ${badge}
    </div>`;
  }).join("");

  list.querySelectorAll(".sidebar-item").forEach((el) => {
    el.addEventListener("click", () => {
      currentChatId = Number(el.dataset.id);
      list.querySelectorAll(".sidebar-item").forEach((e) => e.classList.remove("active"));
      el.classList.add("active");
      loadChatView(currentChatId);
    });
  });
}

// --- Chat View (sub-tabs: history, memory, reminders, config) ---
async function loadChatView(chatId) {
  const area = document.getElementById("chat-content");
  area.innerHTML = `
    <div class="sub-tabs">
      <button class="sub-tab${currentSubTab === "history" ? " active" : ""}" data-sub="history">History</button>
      <button class="sub-tab${currentSubTab === "memory" ? " active" : ""}" data-sub="memory">Memory</button>
      <button class="sub-tab${currentSubTab === "reminders" ? " active" : ""}" data-sub="reminders">Reminders</button>
      <button class="sub-tab${currentSubTab === "config" ? " active" : ""}" data-sub="config">Config</button>
    </div>
    <div id="chat-sub-content"></div>`;

  area.querySelectorAll(".sub-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentSubTab = btn.dataset.sub;
      loadChatView(chatId);
    });
  });

  const loaders = { history: loadChatHistory, memory: loadChatMemory, reminders: loadChatReminders, config: loadChatConfig };
  await loaders[currentSubTab](chatId);
}

async function loadChatHistory(chatId) {
  const res = await fetch(`/api/chats/${chatId}/history`);
  const { messages } = await res.json();
  const container = document.getElementById("chat-sub-content");
  if (!messages.length) { container.innerHTML = '<p class="placeholder">No messages</p>'; return; }
  container.innerHTML = '<div class="feed chat-feed"></div>';
  const feedEl = container.querySelector(".feed");
  messages.forEach((m) => {
    const div = document.createElement("div");
    div.className = `msg ${m.role}`;
    const time = new Date(m.timestamp).toLocaleTimeString();
    div.innerHTML = `${esc(m.content)}<div class="meta">${time}</div>`;
    feedEl.appendChild(div);
  });
  feedEl.scrollTop = feedEl.scrollHeight;
}

async function loadChatMemory(chatId) {
  const res = await fetch(`/api/chats/${chatId}/memory`);
  const { files, content } = await res.json();
  const container = document.getElementById("chat-sub-content");
  container.innerHTML = `
    <div class="memory-layout">
      <div class="memory-files">${files.map((f) =>
        `<div class="sidebar-item memory-file" data-cat="${f}">${f}</div>`
      ).join("") || '<p class="placeholder">No memory</p>'}</div>
      <div class="memory-view">
        <pre>${esc(content || "Empty")}</pre>
      </div>
    </div>`;

  container.querySelectorAll(".memory-file").forEach((el) => {
    el.addEventListener("click", async () => {
      const cat = el.dataset.cat;
      const catRes = await fetch(`/api/chats/${chatId}/memory/${cat}`);
      const data = await catRes.json();
      const view = container.querySelector(".memory-view");
      view.innerHTML = `<h4>${cat}</h4><pre>${esc(data.content)}</pre>
        <div class="inline-form">
          <input type="text" id="add-mem-input" placeholder="Add entry...">
          <button onclick="addMem(${chatId},'${cat}')">Add</button>
        </div>`;
    });
  });
}

window.addMem = async function(chatId, category) {
  const input = document.getElementById("add-mem-input");
  if (!input.value) return;
  await fetch(`/api/chats/${chatId}/memory/${category}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: input.value }),
  });
  input.value = "";
  loadChatMemory(chatId);
};

async function loadChatReminders(chatId) {
  const res = await fetch(`/api/chats/${chatId}/reminders`);
  const { reminders } = await res.json();
  const container = document.getElementById("chat-sub-content");
  container.innerHTML = `
    <form class="inline-form" id="add-reminder-form">
      <input type="text" name="text" placeholder="Reminder text" required>
      <input type="datetime-local" name="datetime" required>
      <select name="recurring">
        <option value="">One-time</option>
        <option value="daily">Daily</option>
        <option value="weekly">Weekly</option>
        <option value="monthly">Monthly</option>
      </select>
      <button type="submit">Add</button>
    </form>
    <div id="reminder-items">${reminders.map((r) => {
      const dt = new Date(r.datetime).toLocaleString();
      const recur = r.recurring ? ` (${r.recurring})` : "";
      const done = r.notified ? ' <span class="badge badge-dim">done</span>' : "";
      return `<div class="list-item">
        <span>${esc(r.text)} — ${dt}${recur}${done}</span>
        <button class="btn-delete" onclick="delReminder(${chatId},'${r.id}')">Delete</button>
      </div>`;
    }).join("") || '<p class="placeholder">No reminders</p>'}</div>`;

  document.getElementById("add-reminder-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    await fetch(`/api/chats/${chatId}/reminders`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: f.text.value, datetime: f.datetime.value + ":00", recurring: f.recurring.value || null }),
    });
    f.reset();
    loadChatReminders(chatId);
  });
}

window.delReminder = async function(chatId, id) {
  await fetch(`/api/chats/${chatId}/reminders/${id}`, { method: "DELETE" });
  loadChatReminders(chatId);
};

async function loadChatConfig(chatId) {
  const res = await fetch(`/api/chats/${chatId}/config`);
  const cfg = await res.json();
  const container = document.getElementById("chat-sub-content");
  container.innerHTML = `
    <div class="config-form">
      <label>Personality
        <select id="cfg-personality">
          <option value="default"${cfg.personality === "default" ? " selected" : ""}>Default (Professional)</option>
          <option value="casual-vi"${cfg.personality === "casual-vi" ? " selected" : ""}>Casual Vietnamese</option>
        </select>
      </label>
      <label>Allowed Tools
        <input type="text" id="cfg-tools" value="${cfg.allowedTools.join(", ")}" placeholder="WebSearch, WebFetch, Read">
      </label>
      <label class="toggle-label"><input type="checkbox" id="cfg-allowActions"${cfg.allowActions ? " checked" : ""}> Allow actions (remember/remind)</label>
      <label class="toggle-label"><input type="checkbox" id="cfg-confirmActions"${cfg.actionsRequireConfirmation ? " checked" : ""}> Require owner confirmation</label>
      <label class="toggle-label"><input type="checkbox" id="cfg-loadMemory"${cfg.loadMemory ? " checked" : ""}> Load memory into context</label>
      <button class="btn-primary" id="save-chat-config">Save</button>
    </div>`;

  document.getElementById("save-chat-config").addEventListener("click", async () => {
    const tools = document.getElementById("cfg-tools").value.split(",").map((s) => s.trim()).filter(Boolean);
    await fetch(`/api/chats/${chatId}/config`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        personality: document.getElementById("cfg-personality").value,
        allowedTools: tools,
        allowActions: document.getElementById("cfg-allowActions").checked,
        actionsRequireConfirmation: document.getElementById("cfg-confirmActions").checked,
        loadMemory: document.getElementById("cfg-loadMemory").checked,
      }),
    });
    showToast("Chat config saved");
  });
}

// --- Settings ---
async function loadSettings() {
  const res = await fetch("/api/config");
  const config = await res.json();

  document.getElementById("cfg-historyLimit").value = config.historyLimit;
  document.getElementById("cfg-webPort").value = config.webPort;

  const notifToggle = document.getElementById("cfg-notifications");
  notifToggle.checked = notificationsEnabled;
  notifToggle.onchange = () => {
    notificationsEnabled = notifToggle.checked;
    localStorage.setItem("dna-notifications", notifToggle.checked ? "on" : "off");
    if (notifToggle.checked) requestNotificationPermission();
  };

  const list = document.getElementById("paired-list");
  list.innerHTML = config.allowedIds.map((id) =>
    `<div class="list-item"><span>${id}</span><button class="btn-delete" onclick="unpairChat(${id})">Remove</button></div>`
  ).join("") || '<p class="placeholder">No paired chats</p>';
}

document.getElementById("pair-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = Number(e.target.id.value);
  if (!id) return;
  await fetch("/api/config/allowedIds", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  e.target.reset();
  loadSettings();
});

window.unpairChat = async function(id) {
  await fetch(`/api/config/allowedIds/${id}`, { method: "DELETE" });
  loadSettings();
};

document.getElementById("save-config").addEventListener("click", async () => {
  await fetch("/api/config", {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      historyLimit: Number(document.getElementById("cfg-historyLimit").value),
      webPort: Number(document.getElementById("cfg-webPort").value),
    }),
  });
  showToast("Config saved");
});

// --- Utils ---
function esc(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

function showToast(msg) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2000);
}
