const messagesEl = document.getElementById("messages");
const promptInput = document.getElementById("promptInput");
const sendButton = document.getElementById("sendButton");
const imageButton = document.getElementById("imageButton");
const imageInput = document.getElementById("imageInput");
const imagePreviewWrap = document.getElementById("imagePreviewWrap");
const imagePreview = document.getElementById("imagePreview");
const removeImageButton = document.getElementById("removeImageButton");
const modeSelect = document.getElementById("modeSelect");
const newChatButton = document.getElementById("newChatButton");
const statusBar = document.getElementById("statusBar");
const statusText = document.getElementById("statusText");

const STORAGE_KEY = "cnc-ai-history-v2";
const MODE_KEY = "cnc-ai-mode-v2";
const UI_VERSION = "v6";

let history = loadHistory();
let pendingImageDataUrl = null;
let busy = false;

modeSelect.value = localStorage.getItem(MODE_KEY) || "auto";
renderStoredHistory();
checkHealth();

modeSelect.addEventListener("change", () => {
  localStorage.setItem(MODE_KEY, modeSelect.value);
});

newChatButton.addEventListener("click", () => {
  history = [];
  localStorage.removeItem(STORAGE_KEY);
  pendingImageDataUrl = null;
  updateImagePreview();
  messagesEl.innerHTML = "";
  addMessageToDom("assistant", "Новый чат. Что смотрим на станке?");
});

imageButton.addEventListener("click", () => imageInput.click());

imageInput.addEventListener("change", async () => {
  const file = imageInput.files?.[0];
  if (!file) return;

  try {
    pendingImageDataUrl = await compressImage(file);
    updateImagePreview();
  } catch (error) {
    alert("Не удалось подготовить фото. Попробуй другой снимок.");
  } finally {
    imageInput.value = "";
  }
});

removeImageButton.addEventListener("click", () => {
  pendingImageDataUrl = null;
  updateImagePreview();
});

promptInput.addEventListener("input", () => {
  promptInput.style.height = "auto";
  promptInput.style.height = `${Math.min(promptInput.scrollHeight, 144)}px`;
});

promptInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendCurrent();
  }
});

sendButton.addEventListener("click", sendCurrent);

async function sendCurrent() {
  if (busy) return;

  const text = promptInput.value.trim();
  if (!text && !pendingImageDataUrl) return;

  const userText = text || "Проанализируй это фото.";
  const photoForThisTurn = pendingImageDataUrl;

  history.push({ role: "user", content: userText });
  saveHistory();
  addMessageToDom("user", userText, null, photoForThisTurn);

  promptInput.value = "";
  promptInput.style.height = "auto";
  pendingImageDataUrl = null;
  updateImagePreview();

  busy = true;
  setControlsDisabled(true);
  const typingNode = addTypingMessage();

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: history.slice(-14),
        imageDataUrl: photoForThisTurn,
        mode: modeSelect.value
      })
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.error || `HTTP ${response.status}`);
    }

    typingNode.remove();

    history.push({
      role: "assistant",
      content: payload.answer
    });
    saveHistory();

    addMessageToDom(
      "assistant",
      payload.answer,
      `${payload.route} · ${payload.model}${payload.supervised ? " · checked" : ""}`
    );
  } catch (error) {
    typingNode.remove();
    addMessageToDom(
      "assistant",
      `Ошибка: ${error.message || "не удалось получить ответ"}`,
      "server error"
    );
  } finally {
    busy = false;
    setControlsDisabled(false);
    promptInput.focus();
  }
}

function addTypingMessage() {
  const article = document.createElement("article");
  article.className = "message assistant typing";

  const label = document.createElement("div");
  label.className = "message-label";
  label.textContent = "CNC AI";

  const body = document.createElement("div");
  body.className = "message-body";
  body.textContent = "Смотрю";

  article.append(label, body);
  messagesEl.appendChild(article);
  scrollToBottom();
  return article;
}

function addMessageToDom(role, content, meta = null, photo = null) {
  const article = document.createElement("article");
  article.className = `message ${role}`;

  const label = document.createElement("div");
  label.className = "message-label";
  label.textContent = role === "user" ? "Ты" : "CNC AI";

  if (photo) {
    const img = document.createElement("img");
    img.className = "message-photo";
    img.src = photo;
    img.alt = "Отправленное фото";
    article.appendChild(img);
  }

  const body = document.createElement("div");
  body.className = "message-body";

  if (role === "assistant") {
    body.classList.add("markdown");
    renderMarkdown(body, content);
  } else {
    body.textContent = content;
  }

  article.append(label, body);

  if (meta) {
    const metaEl = document.createElement("div");
    metaEl.className = "message-meta";
    metaEl.textContent = meta;
    article.appendChild(metaEl);
  }

  messagesEl.appendChild(article);
  scrollToBottom();
  return article;
}

function renderStoredHistory() {
  if (!history.length) return;

  messagesEl.innerHTML = "";
  history.slice(-20).forEach((message) => {
    addMessageToDom(message.role, message.content);
  });
}

function saveHistory() {
  const compact = history.slice(-30).map(({ role, content }) => ({ role, content }));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(compact));
}

function loadHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function updateImagePreview() {
  if (!pendingImageDataUrl) {
    imagePreviewWrap.classList.add("hidden");
    imagePreview.removeAttribute("src");
    return;
  }

  imagePreview.src = pendingImageDataUrl;
  imagePreviewWrap.classList.remove("hidden");
}

function setControlsDisabled(disabled) {
  sendButton.disabled = disabled;
  imageButton.disabled = disabled;
  modeSelect.disabled = disabled;
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  });
}

async function checkHealth() {
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error();

    statusBar.classList.add("ok");
    statusBar.classList.remove("error");
    statusText.textContent =
      `${payload.fastModel} / ${payload.smartModel}` +
      (payload.supervisorEnabled ? " · supervisor ON" : " · supervisor OFF") +
      ` · UI ${UI_VERSION}`;
  } catch {
    statusBar.classList.add("error");
    statusBar.classList.remove("ok");
    statusText.textContent = "Сервер недоступен";
  }
}

async function compressImage(file) {
  const objectUrl = URL.createObjectURL(file);

  try {
    const img = await loadImage(objectUrl);
    const maxSide = 1600;
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.drawImage(img, 0, 0, width, height);

    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Безопасный Markdown-рендерер: не использует innerHTML.
function renderMarkdown(container, markdown) {
  container.textContent = "";

  const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
  let inCodeBlock = false;
  let codeLines = [];
  let currentList = null;
  let currentListType = null;

  const flushList = () => {
    if (!currentList) return;
    container.appendChild(currentList);
    currentList = null;
    currentListType = null;
  };

  const appendCodeBlock = () => {
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    code.textContent = codeLines.join("\n");
    pre.appendChild(code);
    container.appendChild(pre);
    codeLines = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/g, "");
    const trimmed = line.trim();

    if (/^```/.test(trimmed)) {
      if (!inCodeBlock) {
        flushList();
        inCodeBlock = true;
        codeLines = [];
      } else {
        appendCodeBlock();
        inCodeBlock = false;
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(rawLine);
      continue;
    }

    const heading = line.match(/^\s*(#{1,4})\s+(.+)$/);
    if (heading) {
      flushList();
      const level = Math.min(4, heading[1].length);
      const h = document.createElement(`h${level}`);
      renderInlineMarkdown(h, heading[2]);
      container.appendChild(h);
      continue;
    }

    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);

    if (bullet || ordered) {
      const type = ordered ? "ol" : "ul";
      if (!currentList || currentListType !== type) {
        flushList();
        currentList = document.createElement(type);
        currentListType = type;
      }

      const li = document.createElement("li");
      renderInlineMarkdown(li, (ordered || bullet)[1]);
      currentList.appendChild(li);
      continue;
    }

    flushList();

    if (!trimmed) continue;

    const p = document.createElement("p");
    renderInlineMarkdown(p, line);
    container.appendChild(p);
  }

  if (inCodeBlock) appendCodeBlock();
  flushList();
}

function renderInlineMarkdown(parent, text) {
  const source = String(text || "");
  const tokenPattern = /(\*\*[^*]+?\*\*|`[^`]+?`)/g;
  let lastIndex = 0;
  let match;

  while ((match = tokenPattern.exec(source)) !== null) {
    if (match.index > lastIndex) {
      parent.appendChild(document.createTextNode(source.slice(lastIndex, match.index)));
    }

    const token = match[0];
    if (token.startsWith("**")) {
      const strong = document.createElement("strong");
      strong.textContent = token.slice(2, -2);
      parent.appendChild(strong);
    } else {
      const code = document.createElement("code");
      code.textContent = token.slice(1, -1);
      parent.appendChild(code);
    }

    lastIndex = tokenPattern.lastIndex;
  }

  if (lastIndex < source.length) {
    parent.appendChild(document.createTextNode(source.slice(lastIndex)));
  }
}
