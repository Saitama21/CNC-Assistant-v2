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
const memoryButton = document.getElementById("memoryButton");
const memoryModal = document.getElementById("memoryModal");
const closeMemoryButton = document.getElementById("closeMemoryButton");
const saveMemoryButton = document.getElementById("saveMemoryButton");
const exportMemoryButton = document.getElementById("exportMemoryButton");
const importMemoryButton = document.getElementById("importMemoryButton");
const importMemoryInput = document.getElementById("importMemoryInput");
const resetMemoryButton = document.getElementById("resetMemoryButton");
const memoryMachine = document.getElementById("memoryMachine");
const memoryMaterials = document.getElementById("memoryMaterials");
const memoryTools = document.getElementById("memoryTools");
const memoryMCodes = document.getElementById("memoryMCodes");
const memoryCutting = document.getElementById("memoryCutting");
const memoryNotes = document.getElementById("memoryNotes");
const loginModal = document.getElementById("loginModal");
const loginForm = document.getElementById("loginForm");
const loginPassword = document.getElementById("loginPassword");
const loginSubmitButton = document.getElementById("loginSubmitButton");
const loginError = document.getElementById("loginError");
const loginMessage = document.getElementById("loginMessage");

const STORAGE_KEY = "cnc-ai-history-v2";
const MODE_KEY = "cnc-ai-mode-v2";
const MEMORY_KEY = "cnc-ai-project-memory-v1";
const UI_VERSION = "v8";

const DEFAULT_MEMORY = Object.freeze({
  machine: "Станок: SK52PT-Y\nСтойка: SINUMERIK 828D / ShopTurn",
  materials: "",
  tools: "",
  mCodes: "",
  cutting: "",
  notes: ""
});

let history = loadHistory();
let projectMemory = loadProjectMemory();
let pendingImageDataUrl = null;
let busy = false;
let lastHealthPayload = null;

modeSelect.value = localStorage.getItem(MODE_KEY) || "auto";
renderStoredHistory();
initializeApp();


loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const password = loginPassword.value;
  if (!password) return;

  loginSubmitButton.disabled = true;
  loginError.classList.add("hidden");
  loginError.textContent = "";

  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ password })
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.error || "Неверный пароль");
    }

    loginPassword.value = "";
    hideLogin();
    await checkHealth();
  } catch (error) {
    loginError.textContent = error.message || "Не удалось войти";
    loginError.classList.remove("hidden");
  } finally {
    loginSubmitButton.disabled = false;
  }
});

async function initializeApp() {
  try {
    const response = await fetch("/api/auth/status", {
      cache: "no-store",
      credentials: "same-origin"
    });

    const payload = await response.json().catch(() => ({}));

    if (!payload.configured) {
      showLogin("В Railway Variables сначала добавь APP_PASSWORD, затем перезапусти deployment.");
      loginPassword.disabled = true;
      loginSubmitButton.disabled = true;
      return;
    }

    if (payload.authenticated) {
      hideLogin();
      await checkHealth();
      return;
    }

    showLogin();
  } catch {
    showLogin("Не удалось связаться с сервером.");
  }
}

function showLogin(message = "") {
  loginModal.classList.remove("hidden");
  loginModal.setAttribute("aria-hidden", "false");
  loginMessage.textContent =
    message ||
    "Введи пароль приложения. Он хранится только в Railway Variables и не передаётся OpenAI.";
  setControlsDisabled(true);
  setTimeout(() => loginPassword.focus(), 50);
}

function hideLogin() {
  loginModal.classList.add("hidden");
  loginModal.setAttribute("aria-hidden", "true");
  setControlsDisabled(false);
  promptInput.focus();
}

async function fetchApi(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    credentials: "same-origin"
  });

  if (response.status === 401) {
    showLogin("Сессия истекла. Введи пароль ещё раз.");
  }

  return response;
}

modeSelect.addEventListener("change", () => {
  localStorage.setItem(MODE_KEY, modeSelect.value);
});

memoryButton.addEventListener("click", openMemoryModal);
closeMemoryButton.addEventListener("click", closeMemoryModal);

memoryModal.addEventListener("click", (event) => {
  if (event.target === memoryModal) closeMemoryModal();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !memoryModal.classList.contains("hidden")) {
    closeMemoryModal();
  }
});

saveMemoryButton.addEventListener("click", () => {
  projectMemory = readMemoryForm();
  localStorage.setItem(MEMORY_KEY, JSON.stringify(projectMemory));
  updateStatusText();
  closeMemoryModal();
});

exportMemoryButton.addEventListener("click", exportProjectMemory);

importMemoryButton.addEventListener("click", () => importMemoryInput.click());

importMemoryInput.addEventListener("change", async () => {
  const file = importMemoryInput.files?.[0];
  if (!file) return;

  try {
    const parsed = JSON.parse(await file.text());
    projectMemory = normalizeProjectMemory(parsed?.memory || parsed);
    localStorage.setItem(MEMORY_KEY, JSON.stringify(projectMemory));
    fillMemoryForm(projectMemory);
    updateStatusText();
  } catch {
    alert("Не удалось импортировать память: нужен JSON-файл из CNC AI.");
  } finally {
    importMemoryInput.value = "";
  }
});

resetMemoryButton.addEventListener("click", () => {
  if (!confirm("Сбросить всю память станка до базовых значений?")) return;
  projectMemory = { ...DEFAULT_MEMORY };
  localStorage.setItem(MEMORY_KEY, JSON.stringify(projectMemory));
  fillMemoryForm(projectMemory);
  updateStatusText();
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
    const response = await fetchApi("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: history.slice(-14),
        imageDataUrl: photoForThisTurn,
        mode: modeSelect.value,
        memory: projectMemory
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
    const response = await fetchApi("/api/health", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error();

    lastHealthPayload = payload;
    statusBar.classList.add("ok");
    statusBar.classList.remove("error");
    updateStatusText();
  } catch {
    statusBar.classList.add("error");
    statusBar.classList.remove("ok");
    statusText.textContent = "Сервер недоступен";
  }
}


function normalizeProjectMemory(value) {
  const source = value && typeof value === "object" ? value : {};
  const clean = (input, fallback = "") =>
    typeof input === "string" ? input.slice(0, 12000) : fallback;

  return {
    machine: clean(source.machine, DEFAULT_MEMORY.machine),
    materials: clean(source.materials),
    tools: clean(source.tools),
    mCodes: clean(source.mCodes),
    cutting: clean(source.cutting),
    notes: clean(source.notes)
  };
}

function loadProjectMemory() {
  try {
    const raw = localStorage.getItem(MEMORY_KEY);
    if (!raw) return { ...DEFAULT_MEMORY };
    return normalizeProjectMemory(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_MEMORY };
  }
}

function memoryItemCount(memory = projectMemory) {
  return Object.values(memory)
    .flatMap((value) => String(value || "").split("\n"))
    .map((line) => line.trim())
    .filter(Boolean)
    .length;
}

function updateStatusText() {
  if (!lastHealthPayload) return;

  statusText.textContent =
    `${lastHealthPayload.fastModel} / ${lastHealthPayload.smartModel}` +
    (lastHealthPayload.supervisorEnabled ? " · supervisor ON" : " · supervisor OFF") +
    ` · память ${memoryItemCount()}` +
    ` · UI ${UI_VERSION}`;
}

function fillMemoryForm(memory) {
  memoryMachine.value = memory.machine || "";
  memoryMaterials.value = memory.materials || "";
  memoryTools.value = memory.tools || "";
  memoryMCodes.value = memory.mCodes || "";
  memoryCutting.value = memory.cutting || "";
  memoryNotes.value = memory.notes || "";
}

function readMemoryForm() {
  return normalizeProjectMemory({
    machine: memoryMachine.value,
    materials: memoryMaterials.value,
    tools: memoryTools.value,
    mCodes: memoryMCodes.value,
    cutting: memoryCutting.value,
    notes: memoryNotes.value
  });
}

function openMemoryModal() {
  fillMemoryForm(projectMemory);
  memoryModal.classList.remove("hidden");
  memoryModal.setAttribute("aria-hidden", "false");
  memoryMachine.focus();
}

function closeMemoryModal() {
  memoryModal.classList.add("hidden");
  memoryModal.setAttribute("aria-hidden", "true");
  promptInput.focus();
}

function exportProjectMemory() {
  const payload = {
    format: "cnc-ai-memory",
    version: 1,
    exportedAt: new Date().toISOString(),
    memory: projectMemory
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "cnc-ai-memory.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
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
