/* ── System prompt ────────────────────────────────────────────────────────── */
const SYSTEM_PROMPT = `You are DailySpeak, a friendly English conversation coach for Brazilian beginners (A1/A2 level).

Rules you always follow:
1. Write in simple, clear English (A1/A2 level). For each sentence or important phrase, append a hidden Portuguese translation using this exact format: [PT: tradução aqui]. Example: "Good morning! [PT: Bom dia!]". Always include [PT:...] tags — they will be hidden from the user by default.
2. If the user makes a grammar or vocabulary mistake, correct it gently on a NEW line starting with exactly: ✏️ Small correction:
3. If you have a vocabulary tip, put it on a NEW line starting with exactly: 💡 Tip:
4. Always end your reply with ONE simple question to keep the conversation going.
5. If the user writes in Portuguese, respond warmly, show you understood, but gently encourage them to try in English. Still answer their question.
6. Keep replies concise — 3 to 6 sentences of actual conversation content, plus optional correction/tip.
7. Never break character. You are always DailySpeak.`;

const GREETING = `Hello! [PT: Olá!] I'm DailySpeak, your English coach. [PT: Eu sou o DailySpeak, seu professor de inglês.] 😊

I'm here to help you practice speaking English every day. [PT: Estou aqui para te ajudar a praticar inglês todo dia.]

Let's start simple — What is your name? [PT: Vamos começar simples — Qual é o seu nome?]`;

/* ── Storage helpers ──────────────────────────────────────────────────────── */
const LS_CONVS  = "ds_conversations";
const LS_ACTIVE = "ds_active_conv";
const LS_THEME  = "ds_theme";
const LS_TRANS  = "ds_translations";

function loadConvs() {
  try { return JSON.parse(localStorage.getItem(LS_CONVS) || "[]"); } catch { return []; }
}

function saveConvs(convs) {
  localStorage.setItem(LS_CONVS, JSON.stringify(convs));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/* ── State ────────────────────────────────────────────────────────────────── */
let convs      = loadConvs();
let activeId   = null;
let history    = [];   // OpenAI message array for the active conversation

/* ── DOM refs ─────────────────────────────────────────────────────────────── */
const chatEl        = document.getElementById("chat");
const inputEl       = document.getElementById("user-input");
const sendBtn       = document.getElementById("send-btn");
const translateBtn  = document.getElementById("translate-btn");
const themeBtn      = document.getElementById("theme-btn");
const newChatBtn    = document.getElementById("new-chat-btn");
const sidebarToggle = document.getElementById("sidebar-toggle");
const sidebar       = document.getElementById("sidebar");
const convListEl    = document.getElementById("conv-list");

/* ── Theme ────────────────────────────────────────────────────────────────── */
function applyTheme(dark) {
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  themeBtn.textContent = dark ? "☀️" : "🌙";
  themeBtn.title = dark ? "Tema claro" : "Tema escuro";
}

let isDark = localStorage.getItem(LS_THEME) === "dark";
applyTheme(isDark);

themeBtn.addEventListener("click", () => {
  isDark = !isDark;
  applyTheme(isDark);
  localStorage.setItem(LS_THEME, isDark ? "dark" : "light");
});

/* ── Translation toggle ───────────────────────────────────────────────────── */
let translationsVisible = localStorage.getItem(LS_TRANS) === "true";

function applyTranslations(on) {
  document.body.classList.toggle("show-translations", on);
  translateBtn.classList.toggle("active", on);
  translateBtn.title = on ? "Esconder traduções" : "Ver traduções em português";
}

applyTranslations(translationsVisible);

translateBtn.addEventListener("click", () => {
  translationsVisible = !translationsVisible;
  applyTranslations(translationsVisible);
  localStorage.setItem(LS_TRANS, translationsVisible);
});

/* ── Sidebar toggle ───────────────────────────────────────────────────────── */
let sidebarOpen = true;

sidebarToggle.addEventListener("click", () => {
  sidebarOpen = !sidebarOpen;
  sidebar.classList.toggle("collapsed", !sidebarOpen);
});

/* ── Conversation list UI ─────────────────────────────────────────────────── */
function renderConvList() {
  const empty = document.getElementById("sidebar-empty");
  convListEl.innerHTML = "";

  if (convs.length === 0) {
    convListEl.appendChild(Object.assign(document.createElement("div"), {
      id: "sidebar-empty",
      innerHTML: "Nenhuma conversa ainda.<br/>Comece digitando uma mensagem."
    }));
    return;
  }

  [...convs].reverse().forEach(conv => {
    const item = document.createElement("div");
    item.className = "conv-item" + (conv.id === activeId ? " active" : "");
    item.dataset.id = conv.id;

    const title = document.createElement("div");
    title.className = "conv-item-title";
    title.textContent = conv.title || "Nova conversa";

    const del = document.createElement("button");
    del.className = "conv-delete";
    del.title = "Excluir";
    del.textContent = "×";
    del.addEventListener("click", e => {
      e.stopPropagation();
      deleteConv(conv.id);
    });

    item.appendChild(title);
    item.appendChild(del);
    item.addEventListener("click", () => loadConv(conv.id));
    convListEl.appendChild(item);
  });
}

/* ── Load a conversation ──────────────────────────────────────────────────── */
function loadConv(id) {
  const conv = convs.find(c => c.id === id);
  if (!conv) return;

  activeId = id;
  localStorage.setItem(LS_ACTIVE, id);
  history  = conv.messages.slice();

  chatEl.innerHTML = "";
  conv.rendered.forEach(({ role, html }) => {
    chatEl.innerHTML += html;
  });

  scrollBottom();
  renderConvList();
  inputEl.focus();
}

function deleteConv(id) {
  convs = convs.filter(c => c.id !== id);
  saveConvs(convs);
  if (activeId === id) startNewConv();
  else renderConvList();
}

/* ── New conversation ─────────────────────────────────────────────────────── */
function startNewConv() {
  activeId = uid();
  localStorage.setItem(LS_ACTIVE, activeId);
  history  = [{ role: "system", content: SYSTEM_PROMPT }];

  chatEl.innerHTML = "";
  appendCoachMessage(GREETING, false);

  renderConvList();
  inputEl.focus();
}

newChatBtn.addEventListener("click", startNewConv);

/* ── Save rendered HTML for persistence ───────────────────────────────────── */
function persistMessage(role, html) {
  let conv = convs.find(c => c.id === activeId);
  if (!conv) {
    conv = { id: activeId, title: "", messages: history.slice(), rendered: [] };
    convs.push(conv);
  }
  conv.messages = history.slice();
  conv.rendered.push({ role, html });

  // Title = first user message (truncated)
  if (!conv.title && role === "user") {
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    conv.title = (tmp.textContent || "").trim().slice(0, 42);
  }

  saveConvs(convs);
  renderConvList();
}

/* ── Parse helpers ────────────────────────────────────────────────────────── */
function parseSentencesWithTranslations(text) {
  const ptRe = /\[PT:\s*(.*?)\]/g;
  const container = document.createElement("span");
  let lastIndex = 0, match;

  while ((match = ptRe.exec(text)) !== null) {
    const english = text.slice(lastIndex, match.index);
    if (english) container.appendChild(document.createTextNode(english));
    const pt = document.createElement("span");
    pt.className = "translation";
    pt.textContent = "(" + match[1].trim() + ") ";
    container.appendChild(pt);
    lastIndex = ptRe.lastIndex;
  }

  const rest = text.slice(lastIndex);
  if (rest) container.appendChild(document.createTextNode(rest));
  return container;
}

function parseCoachContent(raw) {
  const corrRe = /✏️ Small correction:[^\n]*/g;
  const tipRe  = /💡 Tip:[^\n]*/g;

  const corrections = raw.match(corrRe) || [];
  const tips        = raw.match(tipRe)  || [];

  const main = raw.replace(corrRe, "").replace(tipRe, "").replace(/\n{3,}/g, "\n\n").trim();

  const frag = document.createDocumentFragment();

  if (main) {
    const el = document.createElement("div");
    el.className = "bubble";
    main.split("\n").forEach((line, i, arr) => {
      el.appendChild(parseSentencesWithTranslations(line));
      if (i < arr.length - 1) el.appendChild(document.createElement("br"));
    });
    frag.appendChild(el);
  }

  corrections.forEach(text => {
    const el = document.createElement("div");
    el.className = "block block-fix";
    el.appendChild(parseSentencesWithTranslations(text));
    frag.appendChild(el);
  });

  tips.forEach(text => {
    const el = document.createElement("div");
    el.className = "block block-tip";
    el.appendChild(parseSentencesWithTranslations(text));
    frag.appendChild(el);
  });

  return frag;
}

function buildRow(role) {
  const row = document.createElement("div");
  row.className = `msg-row ${role}`;

  const icon = document.createElement("div");
  icon.className = "msg-icon";
  icon.textContent = role === "coach" ? "🗣️" : "🧑";

  const content = document.createElement("div");
  content.className = "msg-content";

  const label = document.createElement("div");
  label.className = "msg-label";
  label.textContent = role === "coach" ? "DailySpeak" : "You";

  content.appendChild(label);
  row.appendChild(icon);
  row.appendChild(content);
  return { row, content };
}

function scrollBottom() {
  chatEl.scrollTop = chatEl.scrollHeight;
}

/* ── Append messages ──────────────────────────────────────────────────────── */
function appendUserMessage(text, persist = true) {
  const { row, content } = buildRow("user");
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;
  content.appendChild(bubble);
  chatEl.appendChild(row);
  scrollBottom();
  if (persist) persistMessage("user", row.outerHTML);
}

function appendCoachMessage(text, persist = true) {
  const { row, content } = buildRow("coach");
  content.appendChild(parseCoachContent(text));
  chatEl.appendChild(row);
  scrollBottom();
  if (persist) persistMessage("coach", row.outerHTML);
}

function appendErrorMessage(text) {
  const { row, content } = buildRow("coach");
  const el = document.createElement("div");
  el.className = "error-bubble";
  el.textContent = text;
  content.appendChild(el);
  chatEl.appendChild(row);
  scrollBottom();
}

function showTyping() {
  const row = document.createElement("div");
  row.id = "typing-row";
  const icon = document.createElement("div");
  icon.className = "typing-icon";
  icon.textContent = "🗣️";
  const dots = document.createElement("div");
  dots.className = "typing-dots";
  dots.innerHTML = "<span></span><span></span><span></span>";
  row.appendChild(icon);
  row.appendChild(dots);
  chatEl.appendChild(row);
  scrollBottom();
}

function hideTyping() { document.getElementById("typing-row")?.remove(); }

function setLoading(on) {
  sendBtn.disabled = on;
  inputEl.disabled = on;
}

/* ── API call ─────────────────────────────────────────────────────────────── */
async function sendMessage(text) {
  text = text.trim();
  if (!text) return;

  appendUserMessage(text);
  history.push({ role: "user", content: text });
  inputEl.value = "";
  inputEl.style.height = "auto";
  setLoading(true);
  showTyping();

  try {
    const res = await fetch("/.netlify/functions/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);

    const reply = data.choices[0].message.content.trim();
    history.push({ role: "assistant", content: reply });
    hideTyping();
    appendCoachMessage(reply);
  } catch (err) {
    hideTyping();
    appendErrorMessage(`⚠️ ${err.message}`);
  } finally {
    setLoading(false);
    inputEl.focus();
  }
}

/* ── Events ───────────────────────────────────────────────────────────────── */
sendBtn.addEventListener("click", () => sendMessage(inputEl.value));

inputEl.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(inputEl.value); }
});

inputEl.addEventListener("input", () => {
  inputEl.style.height = "auto";
  inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + "px";
});

/* ── Init ─────────────────────────────────────────────────────────────────── */
const savedActive = localStorage.getItem(LS_ACTIVE);
const savedConv   = convs.find(c => c.id === savedActive);

if (savedConv) {
  loadConv(savedConv.id);
} else {
  startNewConv();
}
