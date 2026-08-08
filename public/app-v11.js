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
const memoryCloudStatus = document.getElementById("memoryCloudStatus");
const knowledgeButton = document.getElementById("knowledgeButton");
const knowledgeModal = document.getElementById("knowledgeModal");
const closeKnowledgeButton = document.getElementById("closeKnowledgeButton");
const knowledgeTabs = Array.from(document.querySelectorAll(".knowledge-tab"));
const knowledgeSections = Array.from(document.querySelectorAll(".knowledge-section"));
const toolForm = document.getElementById("toolForm");
const materialForm = document.getElementById("materialForm");
const mCodeForm = document.getElementById("mCodeForm");
const journalForm = document.getElementById("journalForm");
const toolsList = document.getElementById("toolsList");
const materialsList = document.getElementById("materialsList");
const mCodesList = document.getElementById("mCodesList");
const journalList = document.getElementById("journalList");
const shopTurnButton = document.getElementById("shopTurnButton");
const shopTurnModal = document.getElementById("shopTurnModal");
const closeShopTurnButton = document.getElementById("closeShopTurnButton");
const shopTurnImageInput = document.getElementById("shopTurnImageInput");
const shopTurnImageWrap = document.getElementById("shopTurnImageWrap");
const shopTurnImagePreview = document.getElementById("shopTurnImagePreview");
const removeShopTurnImage = document.getElementById("removeShopTurnImage");
const shopTurnPrompt = document.getElementById("shopTurnPrompt");
const generateShopTurnButton = document.getElementById("generateShopTurnButton");
const saveShopTurnButton = document.getElementById("saveShopTurnButton");
const shopTurnGenerationStatus = document.getElementById("shopTurnGenerationStatus");
const shopTurnProjects = document.getElementById("shopTurnProjects");
const shopTurnHeaderItem = document.getElementById("shopTurnHeaderItem");
const shopTurnOperations = document.getElementById("shopTurnOperations");
const shopTurnHeaderForm = document.getElementById("shopTurnHeaderForm");
const shopTurnOperationForm = document.getElementById("shopTurnOperationForm");
const shopTurnWarnings = document.getElementById("shopTurnWarnings");
const shopTurnAssumptions = document.getElementById("shopTurnAssumptions");

const STORAGE_KEY = "cnc-ai-history-v2";
const MODE_KEY = "cnc-ai-mode-v2";
const MEMORY_KEY = "cnc-ai-project-memory-v1";
const UI_VERSION = "v11";

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
let cloudMemoryState = "unknown";
let cloudMemoryUpdatedAt = null;
let knowledgeCache = {
  tools: [],
  materials: [],
  mCodes: [],
  journal: []
};

let shopTurnImageDataUrl = null;
let shopTurnSelectedOperation = -1;
let shopTurnCurrentProjectId = null;
let shopTurnPlan = createEmptyShopTurnPlan();


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
    await syncMemoryFromCloud();
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
      await syncMemoryFromCloud();
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



shopTurnButton.addEventListener("click", openShopTurnModal);
closeShopTurnButton.addEventListener("click", closeShopTurnModal);

shopTurnModal.addEventListener("click", (event) => {
  if (event.target === shopTurnModal) closeShopTurnModal();
});

shopTurnImageInput.addEventListener("change", async () => {
  const file = shopTurnImageInput.files?.[0];
  if (!file) return;

  try {
    shopTurnImageDataUrl = await compressImage(file);
    shopTurnImagePreview.src = shopTurnImageDataUrl;
    shopTurnImageWrap.classList.remove("hidden");
  } catch (error) {
    alert(error.message || "Не удалось подготовить чертёж");
  } finally {
    shopTurnImageInput.value = "";
  }
});

removeShopTurnImage.addEventListener("click", () => {
  shopTurnImageDataUrl = null;
  shopTurnImagePreview.removeAttribute("src");
  shopTurnImageWrap.classList.add("hidden");
});

generateShopTurnButton.addEventListener("click", generateVisualShopTurn);
saveShopTurnButton.addEventListener("click", saveVisualShopTurn);

shopTurnHeaderItem.addEventListener("click", () => {
  shopTurnSelectedOperation = -1;
  renderShopTurnEditor();
});

knowledgeButton.addEventListener("click", openKnowledgeModal);
closeKnowledgeButton.addEventListener("click", closeKnowledgeModal);

knowledgeModal.addEventListener("click", (event) => {
  if (event.target === knowledgeModal) closeKnowledgeModal();
});

knowledgeTabs.forEach((button) => {
  button.addEventListener("click", () => {
    setKnowledgeTab(button.dataset.tab || "tools");
  });
});

toolForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await submitKnowledgeRecord("/api/knowledge/tools", "PUT", {
    toolNo: document.getElementById("toolNo").value,
    name: document.getElementById("toolName").value,
    holder: document.getElementById("toolHolder").value,
    insertCode: document.getElementById("toolInsertCode").value,
    widthMm: document.getElementById("toolWidthMm").value,
    noseRadiusMm: document.getElementById("toolNoseRadiusMm").value,
    purpose: document.getElementById("toolPurpose").value,
    notes: document.getElementById("toolNotes").value,
    confirmed: document.getElementById("toolConfirmed").checked
  });
  toolForm.reset();
  document.getElementById("toolConfirmed").checked = true;
});

materialForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await submitKnowledgeRecord("/api/knowledge/materials", "POST", {
    name: document.getElementById("materialName").value,
    grade: document.getElementById("materialGrade").value,
    condition: document.getElementById("materialCondition").value,
    notes: document.getElementById("materialNotes").value,
    confirmed: document.getElementById("materialConfirmed").checked
  });
  materialForm.reset();
  document.getElementById("materialConfirmed").checked = true;
});

mCodeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await submitKnowledgeRecord("/api/knowledge/mcodes", "PUT", {
    code: document.getElementById("mCodeCode").value,
    function: document.getElementById("mCodeFunction").value,
    source: document.getElementById("mCodeSource").value,
    notes: document.getElementById("mCodeNotes").value,
    confirmed: document.getElementById("mCodeConfirmed").checked
  });
  mCodeForm.reset();
});

journalForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await submitKnowledgeRecord("/api/knowledge/journal", "POST", {
    occurredAt: new Date().toISOString(),
    operation: document.getElementById("journalOperation").value,
    material: document.getElementById("journalMaterial").value,
    toolNo: document.getElementById("journalToolNo").value,
    diameterMm: document.getElementById("journalDiameterMm").value,
    spindle: document.getElementById("journalSpindle").value,
    feed: document.getElementById("journalFeed").value,
    result: document.getElementById("journalResult").value,
    notes: document.getElementById("journalNotes").value
  });
  journalForm.reset();
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

  if (event.key === "Escape" && !knowledgeModal.classList.contains("hidden")) {
    closeKnowledgeModal();
  }

  if (event.key === "Escape" && !shopTurnModal.classList.contains("hidden")) {
    closeShopTurnModal();
  }
});

saveMemoryButton.addEventListener("click", async () => {
  projectMemory = readMemoryForm();
  localStorage.setItem(MEMORY_KEY, JSON.stringify(projectMemory));

  saveMemoryButton.disabled = true;
  setMemoryCloudStatus("Сохраняю в облако…", "syncing");

  try {
    await saveMemoryToCloud(projectMemory);
    closeMemoryModal();
  } catch (error) {
    setMemoryCloudStatus(
      `Облако недоступно: ${error.message || "ошибка сохранения"}. Локальная копия сохранена.`,
      "error"
    );
  } finally {
    saveMemoryButton.disabled = false;
    updateStatusText();
  }
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

    try {
      await saveMemoryToCloud(projectMemory);
    } catch (error) {
      setMemoryCloudStatus(
        `Импортирован локально, но облако недоступно: ${error.message || "ошибка"}`,
        "error"
      );
    }
  } catch {
    alert("Не удалось импортировать память: нужен JSON-файл из CNC AI.");
  } finally {
    importMemoryInput.value = "";
  }
});

resetMemoryButton.addEventListener("click", async () => {
  if (!confirm("Сбросить всю память станка до базовых значений?")) return;

  projectMemory = { ...DEFAULT_MEMORY };
  localStorage.setItem(MEMORY_KEY, JSON.stringify(projectMemory));
  fillMemoryForm(projectMemory);
  updateStatusText();

  try {
    await saveMemoryToCloud(projectMemory);
  } catch (error) {
    setMemoryCloudStatus(
      `Сброшено локально, но облако недоступно: ${error.message || "ошибка"}`,
      "error"
    );
  }
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





function createEmptyShopTurnOperation(type = "turning") {
  return {
    type,
    title:
      type === "thread" ? "Резьба" :
      type === "cutoff" ? "Отрез" :
      type === "contour" ? "Контур" :
      "Обработка резаньем",
    tool: "",
    edge: null,
    feed: null,
    speedMode: "S",
    speed: null,
    machining: type === "cutoff" || type === "contour" ? "none" : "rough",
    X0: null, Z0: null, X1: null, Z1: null, D: null, UX: null, UZ: null,
    FS: null, R: null, FR: null, SR: null, X2: null,
    threadTable: "none", threadSize: "", P: null, G: null,
    threadSide: "none", LW: null, LW2: null, LR: null, H1: null,
    DP: null, alphaP: null,
    contourName: "", contourStartX: null, contourStartZ: null,
    contourTransitionType: "none", contourTransitionValue: null,
    contourElements: [],
    confidence: "medium",
    note: ""
  };
}

function createEmptyShopTurnPlan() {
  return {
    program: {
      name: "SHOPTURN_1",
      unit: "mm",
      workOffset: "G54",
      stockShape: "cylinder",
      XA: null, XI: null, ZA: 0, ZI: null, ZB: null,
      XRA: null, ZRA: null, SC: null, Smax: null
    },
    operations: [],
    warnings: [],
    assumptions: []
  };
}

async function openShopTurnModal() {
  shopTurnModal.classList.remove("hidden");
  shopTurnModal.setAttribute("aria-hidden", "false");
  await loadShopTurnProjects();
  renderShopTurnEditor();
}

function closeShopTurnModal() {
  shopTurnModal.classList.add("hidden");
  shopTurnModal.setAttribute("aria-hidden", "true");
  promptInput.focus();
}

function setShopTurnStatus(text, state = "ready") {
  shopTurnGenerationStatus.textContent = text;
  shopTurnGenerationStatus.dataset.state = state;
}

async function generateVisualShopTurn() {
  if (!shopTurnImageDataUrl && !shopTurnPrompt.value.trim()) {
    alert("Добавь чертёж или опиши деталь.");
    return;
  }

  generateShopTurnButton.disabled = true;
  setShopTurnStatus("GPT-5.6 Sol разбирает геометрию и заполняет ShopTurn…", "working");

  try {
    const response = await fetchApi("/api/shopturn/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: shopTurnPrompt.value.trim(),
        imageDataUrl: shopTurnImageDataUrl,
        memory: projectMemory
      })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    shopTurnPlan = normalizeShopTurnPlan(data.plan);
    shopTurnCurrentProjectId = null;
    shopTurnSelectedOperation = -1;
    renderShopTurnEditor();

    const review = data.supervised
      ? ` · supervisor ${data.supervisorModel || "ON"}`
      : "";

    setShopTurnStatus(
      `Заполнено моделью ${data.model || "smart"}${review}. Проверь пустые/жёлтые поля перед станком.`,
      "ready"
    );
  } catch (error) {
    setShopTurnStatus(error.message || "Ошибка построения ShopTurn", "error");
  } finally {
    generateShopTurnButton.disabled = false;
  }
}

function normalizeNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeShopTurnPlan(value) {
  const source = value && typeof value === "object" ? value : {};
  const program = source.program && typeof source.program === "object"
    ? source.program
    : {};

  const normalized = createEmptyShopTurnPlan();

  normalized.program = {
    ...normalized.program,
    ...program,
    XA: normalizeNumberOrNull(program.XA),
    XI: normalizeNumberOrNull(program.XI),
    ZA: normalizeNumberOrNull(program.ZA),
    ZI: normalizeNumberOrNull(program.ZI),
    ZB: normalizeNumberOrNull(program.ZB),
    XRA: normalizeNumberOrNull(program.XRA),
    ZRA: normalizeNumberOrNull(program.ZRA),
    SC: normalizeNumberOrNull(program.SC),
    Smax: normalizeNumberOrNull(program.Smax)
  };

  normalized.operations = Array.isArray(source.operations)
    ? source.operations.map((item) => ({
        ...createEmptyShopTurnOperation(item?.type || "turning"),
        ...(item || {}),
        edge: normalizeNumberOrNull(item?.edge),
        feed: normalizeNumberOrNull(item?.feed),
        speed: normalizeNumberOrNull(item?.speed),
        X0: normalizeNumberOrNull(item?.X0),
        Z0: normalizeNumberOrNull(item?.Z0),
        X1: normalizeNumberOrNull(item?.X1),
        Z1: normalizeNumberOrNull(item?.Z1),
        D: normalizeNumberOrNull(item?.D),
        UX: normalizeNumberOrNull(item?.UX),
        UZ: normalizeNumberOrNull(item?.UZ),
        FS: normalizeNumberOrNull(item?.FS),
        R: normalizeNumberOrNull(item?.R),
        FR: normalizeNumberOrNull(item?.FR),
        SR: normalizeNumberOrNull(item?.SR),
        X2: normalizeNumberOrNull(item?.X2),
        P: normalizeNumberOrNull(item?.P),
        G: normalizeNumberOrNull(item?.G),
        LW: normalizeNumberOrNull(item?.LW),
        LW2: normalizeNumberOrNull(item?.LW2),
        LR: normalizeNumberOrNull(item?.LR),
        H1: normalizeNumberOrNull(item?.H1),
        DP: normalizeNumberOrNull(item?.DP),
        alphaP: normalizeNumberOrNull(item?.alphaP),
        contourStartX: normalizeNumberOrNull(item?.contourStartX),
        contourStartZ: normalizeNumberOrNull(item?.contourStartZ),
        contourTransitionValue: normalizeNumberOrNull(item?.contourTransitionValue),
        contourElements: Array.isArray(item?.contourElements)
          ? item.contourElements
          : []
      }))
    : [];

  normalized.warnings = Array.isArray(source.warnings) ? source.warnings.map(String) : [];
  normalized.assumptions = Array.isArray(source.assumptions) ? source.assumptions.map(String) : [];

  return normalized;
}

async function saveVisualShopTurn() {
  syncVisibleShopTurnForm();

  const title =
    shopTurnPlan.program.name ||
    shopTurnPrompt.value.trim().slice(0, 80) ||
    "ShopTurn project";

  saveShopTurnButton.disabled = true;

  try {
    const response = await fetchApi("/api/shopturn/projects", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: shopTurnCurrentProjectId,
        title,
        payload: shopTurnPlan
      })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    shopTurnCurrentProjectId = data.project?.id || shopTurnCurrentProjectId;
    setShopTurnStatus("Проект сохранён в Railway Postgres.", "ready");
    await loadShopTurnProjects();
  } catch (error) {
    setShopTurnStatus(error.message || "Не удалось сохранить проект", "error");
  } finally {
    saveShopTurnButton.disabled = false;
  }
}

async function loadShopTurnProjects() {
  shopTurnProjects.textContent = "";

  try {
    const response = await fetchApi("/api/shopturn/projects", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) throw new Error(data.error || "Проекты недоступны");

    const projects = Array.isArray(data.projects) ? data.projects : [];

    if (!projects.length) {
      const empty = document.createElement("div");
      empty.className = "shopturn-empty";
      empty.textContent = "Сохранённых проектов пока нет.";
      shopTurnProjects.appendChild(empty);
      return;
    }

    for (const project of projects) {
      const row = document.createElement("div");
      row.className = "shopturn-project-row";

      const open = document.createElement("button");
      open.className = "shopturn-project-open";
      open.textContent = project.title || `Проект ${project.id}`;
      open.addEventListener("click", () => {
        shopTurnPlan = normalizeShopTurnPlan(project.payload);
        shopTurnCurrentProjectId = project.id;
        shopTurnSelectedOperation = -1;
        renderShopTurnEditor();
        setShopTurnStatus(`Открыт проект #${project.id}.`, "ready");
      });

      const del = document.createElement("button");
      del.className = "shopturn-project-delete";
      del.textContent = "×";
      del.title = "Удалить проект";
      del.addEventListener("click", async () => {
        if (!confirm(`Удалить проект "${project.title}"?`)) return;
        const response = await fetchApi(`/api/shopturn/projects/${project.id}`, {
          method: "DELETE"
        });
        if (response.ok) {
          if (shopTurnCurrentProjectId === project.id) shopTurnCurrentProjectId = null;
          await loadShopTurnProjects();
        }
      });

      row.append(open, del);
      shopTurnProjects.appendChild(row);
    }
  } catch (error) {
    const div = document.createElement("div");
    div.className = "shopturn-empty";
    div.textContent = error.message || "Проекты недоступны";
    shopTurnProjects.appendChild(div);
  }
}

function renderShopTurnEditor() {
  renderShopTurnSequence();
  renderShopTurnWarnings();

  if (shopTurnSelectedOperation < 0) {
    shopTurnHeaderForm.classList.remove("hidden");
    shopTurnOperationForm.classList.add("hidden");
    renderShopTurnHeader();
  } else {
    shopTurnHeaderForm.classList.add("hidden");
    shopTurnOperationForm.classList.remove("hidden");
    renderShopTurnOperation(shopTurnSelectedOperation);
  }
}

function renderShopTurnSequence() {
  shopTurnHeaderItem.classList.toggle("active", shopTurnSelectedOperation < 0);
  shopTurnOperations.textContent = "";

  shopTurnPlan.operations.forEach((operation, index) => {
    const button = document.createElement("button");
    button.className = "shopturn-sequence-item";
    if (index === shopTurnSelectedOperation) button.classList.add("active");

    const typeLabel =
      operation.type === "thread" ? "Резьба · CYCLE99" :
      operation.type === "cutoff" ? "Отрез · CYCLE92" :
      operation.type === "contour" ? "Контур" :
      "Резание · CYCLE951";

    button.textContent = `${index + 1}. ${operation.title || typeLabel}`;
    button.title = typeLabel;
    button.addEventListener("click", () => {
      syncVisibleShopTurnForm();
      shopTurnSelectedOperation = index;
      renderShopTurnEditor();
    });

    shopTurnOperations.appendChild(button);
  });

  const add = document.createElement("button");
  add.className = "shopturn-add-op";
  add.textContent = "＋ Добавить операцию";
  add.addEventListener("click", () => {
    syncVisibleShopTurnForm();
    shopTurnPlan.operations.push(createEmptyShopTurnOperation("turning"));
    shopTurnSelectedOperation = shopTurnPlan.operations.length - 1;
    renderShopTurnEditor();
  });
  shopTurnOperations.appendChild(add);
}

function renderShopTurnWarnings() {
  shopTurnWarnings.textContent = "";
  shopTurnAssumptions.textContent = "";

  const warnings = shopTurnPlan.warnings || [];
  const assumptions = shopTurnPlan.assumptions || [];

  if (!warnings.length) {
    shopTurnWarnings.appendChild(makeShopTurnMessage("Нет предупреждений.", "ok"));
  } else {
    warnings.forEach((item) => {
      shopTurnWarnings.appendChild(makeShopTurnMessage(item, "warn"));
    });
  }

  if (!assumptions.length) {
    shopTurnAssumptions.appendChild(makeShopTurnMessage("Без дополнительных допущений.", "ok"));
  } else {
    assumptions.forEach((item) => {
      shopTurnAssumptions.appendChild(makeShopTurnMessage(item, "assume"));
    });
  }
}

function makeShopTurnMessage(text, kind) {
  const div = document.createElement("div");
  div.className = `shopturn-review-message ${kind}`;
  div.textContent = text;
  return div;
}

function fieldHtml(id, label, value, options = {}) {
  const unit = options.unit ? `<span class="shopturn-unit">${options.unit}</span>` : "";
  const unknown = value === null || value === undefined || value === "";
  const cls = unknown ? "shopturn-cell unknown" : "shopturn-cell";

  if (options.select) {
    const opts = options.select.map(([v, text]) =>
      `<option value="${escapeHtml(v)}"${String(value) === String(v) ? " selected" : ""}>${escapeHtml(text)}</option>`
    ).join("");

    return `
      <label class="shopturn-field">
        <span>${escapeHtml(label)}</span>
        <select id="${id}" class="${cls}">${opts}</select>
        ${unit}
      </label>`;
  }

  return `
    <label class="shopturn-field">
      <span>${escapeHtml(label)}</span>
      <input id="${id}" class="${cls}" ${options.type === "text" ? 'type="text"' : 'type="number" step="any"'}
        value="${unknown ? "" : escapeHtml(String(value))}" placeholder="${options.placeholder || "—"}" />
      ${unit}
    </label>`;
}

function renderShopTurnHeader() {
  const p = shopTurnPlan.program;

  shopTurnHeaderForm.innerHTML = `
    <div class="shopturn-form-title">Заголовок программы</div>
    <div class="shopturn-form-grid">
      ${fieldHtml("st_program_name", "Имя", p.name, { type: "text" })}
      ${fieldHtml("st_unit", "Единица", p.unit, { select: [["mm","мм"],["inch","дюйм"]] })}
      ${fieldHtml("st_workOffset", "Смещ. нулевой точки", p.workOffset, { type: "text" })}
      ${fieldHtml("st_stockShape", "Заготовка", p.stockShape, { select: [["cylinder","Цилиндр"],["tube","Труба"],["unknown","Не определено"]] })}
      ${fieldHtml("st_XA", "XA · наружный Ø", p.XA, { unit: "мм" })}
      ${fieldHtml("st_XI", "XI · внутренний Ø", p.XI, { unit: "мм" })}
      ${fieldHtml("st_ZA", "ZA · начало", p.ZA, { unit: "мм" })}
      ${fieldHtml("st_ZI", "ZI · конец", p.ZI, { unit: "мм" })}
      ${fieldHtml("st_ZB", "ZB · под обработку", p.ZB, { unit: "мм" })}
      ${fieldHtml("st_XRA", "XRA · отвод X", p.XRA, { unit: "мм" })}
      ${fieldHtml("st_ZRA", "ZRA · отвод Z", p.ZRA, { unit: "мм" })}
      ${fieldHtml("st_SC", "SC · безопасное расстояние", p.SC, { unit: "мм" })}
      ${fieldHtml("st_Smax", "S max", p.Smax, { unit: "об/мин" })}
    </div>
    <div class="shopturn-form-note">
      Параметры заголовка основаны на маске ShopTurn: заготовка, плоскости отвода, безопасное расстояние и ограничение шпинделя.
    </div>
  `;
}

function renderShopTurnOperation(index) {
  const op = shopTurnPlan.operations[index];
  if (!op) return;

  const common = `
    ${fieldHtml("st_op_type", "Операция", op.type, {
      select: [
        ["turning","Обработка резаньем · CYCLE951"],
        ["thread","Резьба · CYCLE99"],
        ["cutoff","Отрез · CYCLE92"],
        ["contour","Контурная обточка"]
      ]
    })}
    ${fieldHtml("st_op_title", "Название кадра", op.title, { type: "text" })}
    ${fieldHtml("st_op_tool", "T · инструмент", op.tool, { type: "text" })}
    ${fieldHtml("st_op_edge", "D · режущая кромка", op.edge)}
    ${fieldHtml("st_op_feed", "F · подача", op.feed, { unit: "мм/об" })}
    ${fieldHtml("st_op_speedMode", "S / V", op.speedMode, { select: [["S","S · об/мин"],["V","V · м/мин"]] })}
    ${fieldHtml("st_op_speed", op.speedMode === "V" ? "V · скорость резания" : "S · обороты", op.speed, { unit: op.speedMode === "V" ? "м/мин" : "об/мин" })}
  `;

  let specific = "";

  if (op.type === "turning") {
    specific = `
      ${fieldHtml("st_op_machining", "Обработка", op.machining, { select: [["rough","Черновая"],["finish","Чистовая"],["combined","Черн. + чист."],["none","—"]] })}
      ${fieldHtml("st_op_X0", "X0 · опорная Ø", op.X0, { unit: "мм" })}
      ${fieldHtml("st_op_Z0", "Z0 · опорная", op.Z0, { unit: "мм" })}
      ${fieldHtml("st_op_X1", "X1 · конечная", op.X1, { unit: "мм" })}
      ${fieldHtml("st_op_Z1", "Z1 · конечная", op.Z1, { unit: "мм" })}
      ${fieldHtml("st_op_Ddepth", "D · макс. глубина", op.D, { unit: "мм" })}
      ${fieldHtml("st_op_UX", "UX · припуск X", op.UX, { unit: "мм" })}
      ${fieldHtml("st_op_UZ", "UZ · припуск Z", op.UZ, { unit: "мм" })}
      ${fieldHtml("st_op_FS", "FS · фаска", op.FS, { unit: "мм" })}
      ${fieldHtml("st_op_R", "R · радиус", op.R, { unit: "мм" })}
    `;
  } else if (op.type === "cutoff") {
    specific = `
      ${fieldHtml("st_op_X0", "X0 · исходная Ø", op.X0, { unit: "мм" })}
      ${fieldHtml("st_op_Z0", "Z0 · позиция отреза", op.Z0, { unit: "мм" })}
      ${fieldHtml("st_op_FS", "FS · фаска", op.FS, { unit: "мм" })}
      ${fieldHtml("st_op_R", "R · закругление", op.R, { unit: "мм" })}
      ${fieldHtml("st_op_X1", "X1 · глубина снижения", op.X1, { unit: "мм" })}
      ${fieldHtml("st_op_FR", "FR · сниженная подача", op.FR, { unit: "мм/об" })}
      ${fieldHtml("st_op_SR", "SR · сниженные обороты", op.SR, { unit: "об/мин" })}
      ${fieldHtml("st_op_X2", "X2 · конечная глубина", op.X2, { unit: "мм" })}
    `;
  } else if (op.type === "thread") {
    specific = `
      ${fieldHtml("st_op_threadTable", "Таблица резьбы", op.threadTable, { select: [["none","Без таблицы"],["ISO_metric","ISO метрическая"],["BSW","BSW"],["BSP","BSP"],["UNC","UNC"]] })}
      ${fieldHtml("st_op_threadSize", "Размер", op.threadSize, { type: "text", placeholder: "M12" })}
      ${fieldHtml("st_op_P", "P · шаг", op.P, { unit: "мм/об" })}
      ${fieldHtml("st_op_G", "G · изменение шага", op.G, { unit: "мм/об²" })}
      ${fieldHtml("st_op_threadSide", "Резьба", op.threadSide, { select: [["external","Наружная"],["internal","Внутренняя"],["none","Не определено"]] })}
      ${fieldHtml("st_op_X0", "X0 · опорная Ø", op.X0, { unit: "мм" })}
      ${fieldHtml("st_op_Z0", "Z0 · начало", op.Z0, { unit: "мм" })}
      ${fieldHtml("st_op_Z1", "Z1 · конец / длина", op.Z1, { unit: "мм" })}
      ${fieldHtml("st_op_LW", "LW · заход", op.LW, { unit: "мм" })}
      ${fieldHtml("st_op_LW2", "LW2 · вход", op.LW2, { unit: "мм" })}
      ${fieldHtml("st_op_LR", "LR · выход", op.LR, { unit: "мм" })}
      ${fieldHtml("st_op_H1", "H1 · глубина резьбы", op.H1, { unit: "мм" })}
      ${fieldHtml("st_op_DP", "DP · боковая подача", op.DP, { unit: "мм" })}
      ${fieldHtml("st_op_alphaP", "αP · угол подачи", op.alphaP, { unit: "°" })}
    `;
  } else if (op.type === "contour") {
    specific = `
      ${fieldHtml("st_op_contourName", "Имя контура", op.contourName, { type: "text" })}
      ${fieldHtml("st_op_contourStartX", "Старт X Ø", op.contourStartX, { unit: "мм" })}
      ${fieldHtml("st_op_contourStartZ", "Старт Z", op.contourStartZ, { unit: "мм" })}
      ${fieldHtml("st_op_contourTransitionType", "Переход в начале", op.contourTransitionType, { select: [["none","Нет"],["radius","Радиус"],["chamfer","Фаска"]] })}
      ${fieldHtml("st_op_contourTransitionValue", "R / FS", op.contourTransitionValue, { unit: "мм" })}
      <div class="shopturn-contour-editor">
        <div class="shopturn-contour-title">Элементы контура</div>
        <div id="st_contour_elements"></div>
        <button id="st_add_contour_element" class="secondary-button" type="button">＋ Элемент</button>
      </div>
    `;
  }

  shopTurnOperationForm.innerHTML = `
    <div class="shopturn-form-title">
      Кадр ${index + 1}
      <button id="st_delete_operation" class="shopturn-delete-op" type="button">Удалить кадр</button>
    </div>
    <div class="shopturn-form-grid">
      ${common}
      ${specific}
      ${fieldHtml("st_op_confidence", "Уверенность", op.confidence, { select: [["high","Высокая"],["medium","Средняя"],["low","Низкая"]] })}
      ${fieldHtml("st_op_note", "Примечание", op.note, { type: "text" })}
    </div>
    <div class="shopturn-form-note">
      Жёлтая/пустая ячейка означает, что параметр не был надёжно определён и требует проверки.
    </div>
  `;

  const typeSelect = document.getElementById("st_op_type");
  typeSelect?.addEventListener("change", () => {
    syncVisibleShopTurnForm();
    const current = shopTurnPlan.operations[index];
    const replacement = {
      ...createEmptyShopTurnOperation(typeSelect.value),
      tool: current.tool,
      edge: current.edge,
      feed: current.feed,
      speedMode: current.speedMode,
      speed: current.speed
    };
    shopTurnPlan.operations[index] = replacement;
    renderShopTurnEditor();
  });

  document.getElementById("st_delete_operation")?.addEventListener("click", () => {
    if (!confirm("Удалить этот кадр ShopTurn?")) return;
    shopTurnPlan.operations.splice(index, 1);
    shopTurnSelectedOperation = Math.min(index, shopTurnPlan.operations.length - 1);
    if (shopTurnPlan.operations.length === 0) shopTurnSelectedOperation = -1;
    renderShopTurnEditor();
  });

  if (op.type === "contour") {
    renderContourElements(index);
    document.getElementById("st_add_contour_element")?.addEventListener("click", () => {
      syncVisibleShopTurnForm();
      shopTurnPlan.operations[index].contourElements.push({
        kind: "lineZ",
        x: null,
        z: null,
        radius: null,
        transitionType: "none",
        transitionValue: null
      });
      renderShopTurnEditor();
    });
  }
}

function renderContourElements(operationIndex) {
  const container = document.getElementById("st_contour_elements");
  if (!container) return;

  const elements = shopTurnPlan.operations[operationIndex].contourElements || [];
  container.textContent = "";

  elements.forEach((element, index) => {
    const row = document.createElement("div");
    row.className = "shopturn-contour-row";

    row.innerHTML = `
      <select data-ce="${index}" data-key="kind" class="shopturn-cell">
        <option value="lineX"${element.kind === "lineX" ? " selected" : ""}>Прямая X</option>
        <option value="lineZ"${element.kind === "lineZ" ? " selected" : ""}>Прямая Z</option>
        <option value="lineDiag"${element.kind === "lineDiag" ? " selected" : ""}>Диагональ</option>
        <option value="arc"${element.kind === "arc" ? " selected" : ""}>Дуга</option>
      </select>
      <input data-ce="${index}" data-key="x" type="number" step="any" value="${element.x ?? ""}" placeholder="X Ø" class="shopturn-cell ${element.x == null ? "unknown" : ""}" />
      <input data-ce="${index}" data-key="z" type="number" step="any" value="${element.z ?? ""}" placeholder="Z" class="shopturn-cell ${element.z == null ? "unknown" : ""}" />
      <input data-ce="${index}" data-key="radius" type="number" step="any" value="${element.radius ?? ""}" placeholder="R дуги" class="shopturn-cell ${element.radius == null ? "unknown" : ""}" />
      <select data-ce="${index}" data-key="transitionType" class="shopturn-cell">
        <option value="none"${element.transitionType === "none" ? " selected" : ""}>без перехода</option>
        <option value="radius"${element.transitionType === "radius" ? " selected" : ""}>R</option>
        <option value="chamfer"${element.transitionType === "chamfer" ? " selected" : ""}>фаска</option>
      </select>
      <input data-ce="${index}" data-key="transitionValue" type="number" step="any" value="${element.transitionValue ?? ""}" placeholder="R/FS" class="shopturn-cell ${element.transitionValue == null ? "unknown" : ""}" />
      <button data-remove-ce="${index}" type="button" class="shopturn-project-delete">×</button>
    `;

    container.appendChild(row);
  });

  container.querySelectorAll("[data-remove-ce]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.removeCe);
      shopTurnPlan.operations[operationIndex].contourElements.splice(index, 1);
      renderShopTurnEditor();
    });
  });
}

function syncVisibleShopTurnForm() {
  if (shopTurnSelectedOperation < 0) {
    const p = shopTurnPlan.program;
    const get = (id) => document.getElementById(id)?.value ?? "";

    if (document.getElementById("st_program_name")) {
      p.name = get("st_program_name");
      p.unit = get("st_unit") || "mm";
      p.workOffset = get("st_workOffset");
      p.stockShape = get("st_stockShape") || "unknown";
      ["XA","XI","ZA","ZI","ZB","XRA","ZRA","SC","Smax"].forEach((key) => {
        p[key] = normalizeNumberOrNull(get(`st_${key}`));
      });
    }
    return;
  }

  const op = shopTurnPlan.operations[shopTurnSelectedOperation];
  if (!op || !document.getElementById("st_op_type")) return;

  const get = (id) => document.getElementById(id)?.value ?? "";

  op.title = get("st_op_title");
  op.tool = get("st_op_tool");
  op.edge = normalizeNumberOrNull(get("st_op_edge"));
  op.feed = normalizeNumberOrNull(get("st_op_feed"));
  op.speedMode = get("st_op_speedMode") || "S";
  op.speed = normalizeNumberOrNull(get("st_op_speed"));
  op.confidence = get("st_op_confidence") || "medium";
  op.note = get("st_op_note");

  const numericMap = {
    X0: "st_op_X0", Z0: "st_op_Z0", X1: "st_op_X1", Z1: "st_op_Z1",
    D: "st_op_Ddepth", UX: "st_op_UX", UZ: "st_op_UZ",
    FS: "st_op_FS", R: "st_op_R", FR: "st_op_FR", SR: "st_op_SR",
    X2: "st_op_X2", P: "st_op_P", G: "st_op_G", LW: "st_op_LW",
    LW2: "st_op_LW2", LR: "st_op_LR", H1: "st_op_H1",
    DP: "st_op_DP", alphaP: "st_op_alphaP",
    contourStartX: "st_op_contourStartX", contourStartZ: "st_op_contourStartZ",
    contourTransitionValue: "st_op_contourTransitionValue"
  };

  Object.entries(numericMap).forEach(([key, id]) => {
    if (document.getElementById(id)) op[key] = normalizeNumberOrNull(get(id));
  });

  if (document.getElementById("st_op_machining")) op.machining = get("st_op_machining");
  if (document.getElementById("st_op_threadTable")) op.threadTable = get("st_op_threadTable");
  if (document.getElementById("st_op_threadSize")) op.threadSize = get("st_op_threadSize");
  if (document.getElementById("st_op_threadSide")) op.threadSide = get("st_op_threadSide");
  if (document.getElementById("st_op_contourName")) op.contourName = get("st_op_contourName");
  if (document.getElementById("st_op_contourTransitionType")) {
    op.contourTransitionType = get("st_op_contourTransitionType");
  }

  document.querySelectorAll("[data-ce]").forEach((input) => {
    const index = Number(input.dataset.ce);
    const key = input.dataset.key;
    const element = op.contourElements?.[index];
    if (!element || !key) return;

    if (["x","z","radius","transitionValue"].includes(key)) {
      element[key] = normalizeNumberOrNull(input.value);
    } else {
      element[key] = input.value;
    }
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function setKnowledgeTab(tabName) {
  knowledgeTabs.forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tabName);
  });

  knowledgeSections.forEach((section) => {
    section.classList.toggle("active", section.dataset.section === tabName);
  });
}

async function openKnowledgeModal() {
  knowledgeModal.classList.remove("hidden");
  knowledgeModal.setAttribute("aria-hidden", "false");
  setKnowledgeTab("tools");
  await loadKnowledge();
}

function closeKnowledgeModal() {
  knowledgeModal.classList.add("hidden");
  knowledgeModal.setAttribute("aria-hidden", "true");
  promptInput.focus();
}

async function submitKnowledgeRecord(url, method, payload) {
  const response = await fetchApi(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    alert(data.error || `Ошибка ${response.status}`);
    return;
  }

  await loadKnowledge();
}

async function deleteKnowledgeRecord(url) {
  if (!confirm("Удалить эту запись из базы?")) return;

  const response = await fetchApi(url, { method: "DELETE" });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    alert(data.error || `Ошибка ${response.status}`);
    return;
  }

  await loadKnowledge();
}

async function loadKnowledge() {
  const response = await fetchApi("/api/knowledge", {
    cache: "no-store"
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    renderKnowledgeError(data.error || "База недоступна");
    return;
  }

  knowledgeCache = {
    tools: Array.isArray(data.tools) ? data.tools : [],
    materials: Array.isArray(data.materials) ? data.materials : [],
    mCodes: Array.isArray(data.mCodes) ? data.mCodes : [],
    journal: Array.isArray(data.journal) ? data.journal : []
  };

  renderKnowledgeLists();
}

function renderKnowledgeError(message) {
  [toolsList, materialsList, mCodesList, journalList].forEach((node) => {
    node.textContent = "";
    const div = document.createElement("div");
    div.className = "knowledge-empty";
    div.textContent = message;
    node.appendChild(div);
  });
}

function makeKnowledgeCard(title, lines, deleteHandler, confirmed = null) {
  const card = document.createElement("article");
  card.className = "knowledge-card";

  const head = document.createElement("div");
  head.className = "knowledge-card-head";

  const titleEl = document.createElement("strong");
  titleEl.textContent = title || "Без названия";
  head.appendChild(titleEl);

  if (confirmed !== null) {
    const badge = document.createElement("span");
    badge.className = confirmed ? "knowledge-badge ok" : "knowledge-badge warn";
    badge.textContent = confirmed ? "подтверждено" : "не подтверждено";
    head.appendChild(badge);
  }

  card.appendChild(head);

  for (const line of lines.filter(Boolean)) {
    const p = document.createElement("div");
    p.className = "knowledge-card-line";
    p.textContent = line;
    card.appendChild(p);
  }

  const del = document.createElement("button");
  del.className = "knowledge-delete";
  del.type = "button";
  del.textContent = "Удалить";
  del.addEventListener("click", deleteHandler);
  card.appendChild(del);

  return card;
}

function renderKnowledgeLists() {
  toolsList.textContent = "";
  materialsList.textContent = "";
  mCodesList.textContent = "";
  journalList.textContent = "";

  if (!knowledgeCache.tools.length) {
    toolsList.appendChild(makeEmpty("Инструментов пока нет."));
  } else {
    for (const item of knowledgeCache.tools) {
      toolsList.appendChild(
        makeKnowledgeCard(
          `${item.toolNo} · ${item.name || "инструмент"}`,
          [
            item.holder ? `Державка: ${item.holder}` : "",
            item.insertCode ? `Пластина: ${item.insertCode}` : "",
            item.widthMm != null ? `Ширина: ${item.widthMm} мм` : "",
            item.noseRadiusMm != null ? `R: ${item.noseRadiusMm} мм` : "",
            item.purpose ? `Назначение: ${item.purpose}` : "",
            item.notes ? `Заметки: ${item.notes}` : ""
          ],
          () => deleteKnowledgeRecord(`/api/knowledge/tools/${encodeURIComponent(item.toolNo)}`),
          Boolean(item.confirmed)
        )
      );
    }
  }

  if (!knowledgeCache.materials.length) {
    materialsList.appendChild(makeEmpty("Материалов пока нет."));
  } else {
    for (const item of knowledgeCache.materials) {
      materialsList.appendChild(
        makeKnowledgeCard(
          `${item.name}${item.grade ? ` · ${item.grade}` : ""}`,
          [
            item.condition ? `Состояние: ${item.condition}` : "",
            item.notes ? `Заметки: ${item.notes}` : ""
          ],
          () => deleteKnowledgeRecord(`/api/knowledge/materials/${item.id}`),
          Boolean(item.confirmed)
        )
      );
    }
  }

  if (!knowledgeCache.mCodes.length) {
    mCodesList.appendChild(makeEmpty("OEM M-кодов пока нет."));
  } else {
    for (const item of knowledgeCache.mCodes) {
      mCodesList.appendChild(
        makeKnowledgeCard(
          item.code,
          [
            item.function ? `Функция: ${item.function}` : "",
            item.source ? `Источник: ${item.source}` : "",
            item.notes ? `Заметки: ${item.notes}` : ""
          ],
          () => deleteKnowledgeRecord(`/api/knowledge/mcodes/${encodeURIComponent(item.code)}`),
          Boolean(item.confirmed)
        )
      );
    }
  }

  if (!knowledgeCache.journal.length) {
    journalList.appendChild(makeEmpty("Журнал пока пуст."));
  } else {
    for (const item of knowledgeCache.journal) {
      journalList.appendChild(
        makeKnowledgeCard(
          `${formatJournalDate(item.occurredAt)} · ${item.operation || "операция"}`,
          [
            item.material ? `Материал: ${item.material}` : "",
            item.toolNo ? `Инструмент: ${item.toolNo}` : "",
            item.diameterMm != null ? `Диаметр: ${item.diameterMm} мм` : "",
            item.spindle ? `Шпиндель: ${item.spindle}` : "",
            item.feed ? `Подача: ${item.feed}` : "",
            item.result ? `Результат: ${item.result}` : "",
            item.notes ? `Заметки: ${item.notes}` : ""
          ],
          () => deleteKnowledgeRecord(`/api/knowledge/journal/${item.id}`)
        )
      );
    }
  }
}

function makeEmpty(text) {
  const div = document.createElement("div");
  div.className = "knowledge-empty";
  div.textContent = text;
  return div;
}

function formatJournalDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

function setMemoryCloudStatus(message, state = "ready") {
  cloudMemoryState = state;

  if (memoryCloudStatus) {
    memoryCloudStatus.textContent = message;
    memoryCloudStatus.dataset.state = state;
  }

  updateStatusText();
}

function refreshMemoryCloudStatus() {
  if (!memoryCloudStatus) return;

  if (cloudMemoryState === "ready") {
    const suffix = cloudMemoryUpdatedAt
      ? ` · ${new Date(cloudMemoryUpdatedAt).toLocaleString()}`
      : "";

    memoryCloudStatus.textContent = `Облачная память синхронизирована${suffix}`;
    memoryCloudStatus.dataset.state = "ready";
    return;
  }

  if (cloudMemoryState === "syncing") {
    memoryCloudStatus.textContent = "Синхронизация с Postgres…";
    memoryCloudStatus.dataset.state = "syncing";
    return;
  }

  memoryCloudStatus.textContent =
    "Работаю с локальной резервной копией. Проверь DATABASE_URL/Postgres.";
  memoryCloudStatus.dataset.state = "error";
}

function memoryEquals(a, b) {
  return JSON.stringify(normalizeProjectMemory(a)) ===
    JSON.stringify(normalizeProjectMemory(b));
}

async function syncMemoryFromCloud() {
  cloudMemoryState = "syncing";
  updateStatusText();
  refreshMemoryCloudStatus();

  try {
    const response = await fetchApi("/api/memory", {
      cache: "no-store"
    });

    const payload = await response.json().catch(() => ({}));

    if (response.status === 503) {
      cloudMemoryState = "local";
      refreshMemoryCloudStatus();
      updateStatusText();
      return;
    }

    if (!response.ok) {
      throw new Error(payload.error || `HTTP ${response.status}`);
    }

    if (payload.exists && payload.memory) {
      projectMemory = normalizeProjectMemory(payload.memory);
      localStorage.setItem(MEMORY_KEY, JSON.stringify(projectMemory));
      cloudMemoryUpdatedAt = payload.updatedAt || null;
      cloudMemoryState = "ready";
      fillMemoryForm(projectMemory);
      refreshMemoryCloudStatus();
      updateStatusText();
      return;
    }

    // First run with an empty database: migrate the current browser memory to Postgres.
    await saveMemoryToCloud(projectMemory);
  } catch (error) {
    cloudMemoryState = "local";
    setMemoryCloudStatus(
      `Облачная память недоступна: ${error.message || "ошибка соединения"}. Используется локальная копия.`,
      "error"
    );
  }
}

async function saveMemoryToCloud(memory) {
  cloudMemoryState = "syncing";
  updateStatusText();
  refreshMemoryCloudStatus();

  const response = await fetchApi("/api/memory", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      memory: normalizeProjectMemory(memory)
    })
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    cloudMemoryState = "local";
    throw new Error(payload.error || `HTTP ${response.status}`);
  }

  projectMemory = normalizeProjectMemory(payload.memory || memory);
  localStorage.setItem(MEMORY_KEY, JSON.stringify(projectMemory));
  cloudMemoryUpdatedAt = payload.updatedAt || null;
  cloudMemoryState = "ready";
  fillMemoryForm(projectMemory);
  refreshMemoryCloudStatus();
  updateStatusText();

  return projectMemory;
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

  const memoryLabel =
    cloudMemoryState === "ready"
      ? "cloud"
      : cloudMemoryState === "syncing"
        ? "sync"
        : "local";

  statusText.textContent =
    `${lastHealthPayload.fastModel} / ${lastHealthPayload.smartModel}` +
    (lastHealthPayload.supervisorEnabled ? " · supervisor ON" : " · supervisor OFF") +
    ` · память ${memoryItemCount()} ${memoryLabel}` +
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
  refreshMemoryCloudStatus();
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
