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

/* ── State ────────────────────────────────────────────────────────────────── */
const history = [{ role: "system", content: SYSTEM_PROMPT }];

/* ── DOM refs ─────────────────────────────────────────────────────────────── */
const chatEl      = document.getElementById("chat");
const inputEl     = document.getElementById("user-input");
const sendBtn     = document.getElementById("send-btn");
const translateBtn = document.getElementById("translate-btn");

/* ── Translation toggle ───────────────────────────────────────────────────── */
let translationsVisible = false;

translateBtn.addEventListener("click", () => {
  translationsVisible = !translationsVisible;
  document.body.classList.toggle("show-translations", translationsVisible);
  translateBtn.classList.toggle("active", translationsVisible);
  translateBtn.title = translationsVisible ? "Esconder traduções" : "Ver traduções em português";
});

/* ── Helpers ──────────────────────────────────────────────────────────────── */
function scrollBottom() {
  chatEl.scrollTop = chatEl.scrollHeight;
}

function parseSentencesWithTranslations(text) {
  // Split on [PT: ...] tags, interleaving English and Portuguese
  const ptRe = /\[PT:\s*(.*?)\]/g;
  const container = document.createElement("span");
  let lastIndex = 0;
  let match;

  while ((match = ptRe.exec(text)) !== null) {
    // English text before this tag
    const english = text.slice(lastIndex, match.index).trim();
    if (english) {
      container.appendChild(document.createTextNode(english + " "));
    }
    // Hidden Portuguese translation
    const pt = document.createElement("span");
    pt.className = "translation";
    pt.textContent = "(" + match[1].trim() + ") ";
    container.appendChild(pt);
    lastIndex = ptRe.lastIndex;
  }

  // Remaining text after last tag
  const rest = text.slice(lastIndex).trim();
  if (rest) container.appendChild(document.createTextNode(rest));

  return container;
}

function parseCoachContent(raw) {
  const corrRe = /✏️ Small correction:[^\n]*/g;
  const tipRe  = /💡 Tip:[^\n]*/g;

  const corrections = raw.match(corrRe) || [];
  const tips        = raw.match(tipRe)  || [];

  const main = raw
    .replace(corrRe, "")
    .replace(tipRe, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const frag = document.createDocumentFragment();

  if (main) {
    const el = document.createElement("div");
    el.className = "bubble";
    // Split by newlines, parse each line for translations
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

function appendUserMessage(text) {
  const { row, content } = buildRow("user");
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;
  content.appendChild(bubble);
  chatEl.appendChild(row);
  scrollBottom();
}

function appendCoachMessage(text) {
  const { row, content } = buildRow("coach");
  content.appendChild(parseCoachContent(text));
  chatEl.appendChild(row);
  scrollBottom();
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

function hideTyping() {
  document.getElementById("typing-row")?.remove();
}

function setLoading(on) {
  sendBtn.disabled = on;
  inputEl.disabled = on;
}

/* ── API call (via Netlify Function) ──────────────────────────────────────── */
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

    if (!res.ok) {
      throw new Error(data?.error?.message || `HTTP ${res.status}`);
    }

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
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage(inputEl.value);
  }
});

inputEl.addEventListener("input", () => {
  inputEl.style.height = "auto";
  inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + "px";
});

/* ── Initial greeting ─────────────────────────────────────────────────────── */
appendCoachMessage(
  `Hello! [PT: Olá!] I'm DailySpeak, your English coach. [PT: Eu sou o DailySpeak, seu professor de inglês.] 😊

I'm here to help you practice speaking English every day. [PT: Estou aqui para te ajudar a praticar inglês todo dia.]

Let's start simple — What is your name? [PT: Vamos começar simples — Qual é o seu nome?]`
);
