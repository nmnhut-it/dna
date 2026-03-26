// --- Tab Navigation ---
const tabs = document.querySelectorAll(".tab");
const panels = document.querySelectorAll(".panel");

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((t) => t.classList.remove("active"));
    panels.forEach((p) => p.classList.add("hidden"));
    tab.classList.add("active");
    document.getElementById(`tab-${tab.dataset.tab}`).classList.remove("hidden");
    loadTab(tab.dataset.tab);
  });
});

function loadTab(name) {
  const loaders = { chats: loadChats, memory: loadMemory, reminders: loadReminders, settings: loadSettings };
  if (loaders[name]) loaders[name]();
}

// --- SSE Live Feed ---
const feed = document.getElementById("live-feed");
const statusEl = document.getElementById("status");

function connectSSE() {
  const es = new EventSource("/api/events");
  es.onopen = () => {
    statusEl.textContent = "live";
    statusEl.className = "status online";
  };
  es.onerror = () => {
    statusEl.textContent = "offline";
    statusEl.className = "status offline";
  };
  es.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.type === "message") {
      appendMessage(feed, data.role, data.content, data.chatId, data.timestamp);
      feed.scrollTop = feed.scrollHeight;
    }
  };
}

function appendMessage(container, role, content, chatId, timestamp) {
  const div = document.createElement("div");
  div.className = `msg ${role}`;
  const time = new Date(timestamp).toLocaleTimeString();
  const label = chatId ? ` [${chatId}]` : "";
  div.innerHTML = `${escapeHtml(content)}<div class="meta">${time}${label}</div>`;
  container.appendChild(div);
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

connectSSE();

// --- Chats ---
async function loadChats() {
  const res = await fetch("/api/history");
  const { chats } = await res.json();
  const list = document.getElementById("chat-list");
  list.innerHTML = chats.map((c) =>
    `<div class="sidebar-item" data-chat="${c.chatId}">${c.chatId}<br><small>${c.dates[0] || "no history"}</small></div>`
  ).join("");

  list.querySelectorAll(".sidebar-item").forEach((el) => {
    el.addEventListener("click", async () => {
      list.querySelectorAll(".sidebar-item").forEach((e) => e.classList.remove("active"));
      el.classList.add("active");
      const chatId = el.dataset.chat;
      const dateRes = await fetch("/api/history");
      const chatData = (await dateRes.json()).chats.find((c) => c.chatId === chatId);
      if (!chatData || chatData.dates.length === 0) return;
      const msgRes = await fetch(`/api/history/${chatId}/${chatData.dates[0]}`);
      const { messages } = await msgRes.json();
      const view = document.getElementById("chat-view");
      view.innerHTML = "";
      messages.forEach((m) => appendMessage(view, m.role, m.content, null, m.timestamp));
    });
  });
}

// --- Memory ---
async function loadMemory() {
  const res = await fetch("/api/memory");
  const { files } = await res.json();
  const list = document.getElementById("memory-list");
  list.innerHTML = files.map((f) =>
    `<div class="sidebar-item" data-cat="${f}">${f}</div>`
  ).join("");

  list.querySelectorAll(".sidebar-item").forEach((el) => {
    el.addEventListener("click", async () => {
      list.querySelectorAll(".sidebar-item").forEach((e) => e.classList.remove("active"));
      el.classList.add("active");
      const cat = el.dataset.cat;
      const catRes = await fetch(`/api/memory/${cat}`);
      const { content } = await catRes.json();
      const editor = document.getElementById("memory-editor");
      editor.innerHTML = `<pre>${escapeHtml(content)}</pre>
        <div class="add-memory-form">
          <input type="text" id="new-memory-entry" placeholder="Add entry...">
          <button type="submit" onclick="addMemoryEntry('${cat}')">Add</button>
        </div>`;
    });
  });
}

async function addMemoryEntry(category) {
  const input = document.getElementById("new-memory-entry");
  if (!input.value) return;
  await fetch(`/api/memory/${category}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: input.value }),
  });
  input.value = "";
  loadMemory();
}

// --- Reminders ---
async function loadReminders() {
  const res = await fetch("/api/reminders");
  const { reminders } = await res.json();
  const list = document.getElementById("reminder-list");
  list.innerHTML = reminders.map((r) => {
    const dt = new Date(r.datetime).toLocaleString();
    const recur = r.recurring ? ` (${r.recurring})` : "";
    const status = r.notified ? " [done]" : "";
    return `<div class="reminder-item">
      <span>${escapeHtml(r.text)} — ${dt}${recur}${status}</span>
      <button class="btn-delete" onclick="deleteReminder('${r.id}')">Delete</button>
    </div>`;
  }).join("");
}

document.getElementById("reminder-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  await fetch("/api/reminders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: form.text.value,
      datetime: form.datetime.value.replace("T", "T") + ":00",
      recurring: form.recurring.value || null,
    }),
  });
  form.reset();
  loadReminders();
});

async function deleteReminder(id) {
  await fetch(`/api/reminders/${id}`, { method: "DELETE" });
  loadReminders();
}

// --- Settings ---
async function loadSettings() {
  const res = await fetch("/api/config");
  const config = await res.json();

  document.getElementById("cfg-pairSecret").value = config.pairSecret;
  document.getElementById("cfg-historyLimit").value = config.historyLimit;

  const list = document.getElementById("paired-list");
  list.innerHTML = config.allowedIds.map((id) =>
    `<div class="paired-item">
      <span>${id}</span>
      <button class="btn-delete" onclick="unpairChat(${id})">Remove</button>
    </div>`
  ).join("");
}

document.getElementById("pair-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = Number(e.target.id.value);
  if (!id) return;
  await fetch("/api/config/allowedIds", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  e.target.reset();
  loadSettings();
});

async function unpairChat(id) {
  await fetch(`/api/config/allowedIds/${id}`, { method: "DELETE" });
  loadSettings();
}

document.getElementById("save-config").addEventListener("click", async () => {
  await fetch("/api/config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pairSecret: document.getElementById("cfg-pairSecret").value,
      historyLimit: Number(document.getElementById("cfg-historyLimit").value),
    }),
  });
  alert("Saved!");
});
