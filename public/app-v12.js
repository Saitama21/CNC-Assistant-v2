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
const shopTurnGeometryItem = document.getElementById("shopTurnGeometryItem");
const shopTurnHeaderItem = document.getElementById("shopTurnHeaderItem");
const shopTurnSetups = document.getElementById("shopTurnSetups");
const shopTurnGeometryForm = document.getElementById("shopTurnGeometryForm");
const shopTurnHeaderForm = document.getElementById("shopTurnHeaderForm");
const shopTurnSetupForm = document.getElementById("shopTurnSetupForm");
const shopTurnOperationForm = document.getElementById("shopTurnOperationForm");
const shopTurnGeometryWarnings = document.getElementById("shopTurnGeometryWarnings");
const shopTurnWarnings = document.getElementById("shopTurnWarnings");
const shopTurnAssumptions = document.getElementById("shopTurnAssumptions");

const STORAGE_KEY = "cnc-ai-history-v2";
const MODE_KEY = "cnc-ai-mode-v2";
const MEMORY_KEY = "cnc-ai-project-memory-v1";
const UI_VERSION = "v12";

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
let shopTurnCurrentProjectId = null;
let shopTurnPlan = createEmptyShopTurnPlan();
let shopTurnSelection = { kind: "geometry", setupIndex: -1, opIndex: -1 };


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
shopTurnGeometryItem.addEventListener("click", () => selectShopTurn("geometry"));
shopTurnHeaderItem.addEventListener("click", () => selectShopTurn("program"));

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





function createEmptyGeometry() {
  return {
    partName: "",
    unit: "mm",
    stockOuterDiameter: null,
    stockInnerDiameter: null,
    totalLength: null,
    features: [],
    setupsRequired: 1,
    setupHints: [],
    warnings: []
  };
}

function createEmptyShopTurnOperation(type = "turning") {
  const titles = {
    turning: "Обработка резаньем",
    threadTurning: "Резьба резцом",
    cutoff: "Отрез",
    contour: "Контур",
    drilling: "Сверление",
    tapping: "Нарезание внутренней резьбы"
  };

  return {
    type,
    title: titles[type] || "Операция",
    tool: "",
    edge: null,
    feed: null,
    speedMode: "S",
    speed: null,
    machining: type === "turning" || type === "threadTurning" ? "rough" : "none",
    X0: null, Z0: null, X1: null, Z1: null, D: null, UX: null, UZ: null,
    FS: null, R: null, FR: null, SR: null, X2: null,
    threadTable: "none", threadSize: "", P: null, G: null,
    threadSide: "none", LW: null, LW2: null, LR: null, H1: null, DP: null, alphaP: null,
    contourName: "", contourStartX: null, contourStartZ: null,
    contourTransitionType: "none", contourTransitionValue: null, contourElements: [],
    drillSurface: "unknown", drillPosition: "unknown", drillDepthReference: "unknown",
    pilotBore: null, ZA: null, FA: null, throughDrilling: null, ZD: null, FD: null, DT: null,
    tapChuckMode: "unknown", tapSensorMode: "unknown", tapProcess: "unknown",
    tapRetractMode: "unknown", V2: null, VR: null,
    confidence: "medium",
    note: ""
  };
}

function createEmptySetup(index = 0) {
  return {
    id: `SETUP${index + 1}`,
    title: `Установка ${index + 1}`,
    orientation: "unknown",
    workOffset: "",
    zZeroReference: "unknown",
    zZeroNote: "",
    ZA: null,
    ZI: null,
    XRA: null,
    ZRA: null,
    note: "",
    operations: []
  };
}

function createEmptyShopTurnPlan() {
  return {
    geometry: createEmptyGeometry(),
    program: {
      name: "SHOPTURN_1",
      unit: "mm",
      stockShape: "cylinder",
      XA: null,
      XI: null,
      ZB: null,
      SC: null,
      Smax: null
    },
    setups: [createEmptySetup(0)],
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
  setShopTurnStatus("1/3 Читаю геометрию → 2/3 проверяю размеры → 3/3 строю установки и ShopTurn…", "working");

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
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);

    shopTurnPlan = normalizeShopTurnPlan(data.plan);
    shopTurnCurrentProjectId = null;
    shopTurnSelection = { kind: "geometry", setupIndex: -1, opIndex: -1 };
    renderShopTurnEditor();

    const review = data.supervised ? ` · supervisor ${data.supervisorModel || "ON"}` : "";
    setShopTurnStatus(
      `Готово: drawing→geometry→validation→setups→ShopTurn${review}. Пустые/жёлтые поля требуют проверки.`,
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

function normalizeBoolOrNull(value) {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return null;
}

function normalizeGeometry(value) {
  const source = value && typeof value === "object" ? value : {};
  const base = createEmptyGeometry();

  return {
    ...base,
    ...source,
    stockOuterDiameter: normalizeNumberOrNull(source.stockOuterDiameter),
    stockInnerDiameter: normalizeNumberOrNull(source.stockInnerDiameter),
    totalLength: normalizeNumberOrNull(source.totalLength),
    setupsRequired: normalizeNumberOrNull(source.setupsRequired),
    features: Array.isArray(source.features)
      ? source.features.map((feature, index) => ({
          id: feature?.id || `F${index + 1}`,
          type: feature?.type || "other",
          side: feature?.side || "unknown",
          diameter: normalizeNumberOrNull(feature?.diameter),
          innerDiameter: normalizeNumberOrNull(feature?.innerDiameter),
          length: normalizeNumberOrNull(feature?.length),
          fromZ: normalizeNumberOrNull(feature?.fromZ),
          toZ: normalizeNumberOrNull(feature?.toZ),
          threadSize: String(feature?.threadSize || ""),
          pitch: normalizeNumberOrNull(feature?.pitch),
          value: normalizeNumberOrNull(feature?.value),
          quantity: normalizeNumberOrNull(feature?.quantity),
          confidence: feature?.confidence || "medium",
          sourceText: String(feature?.sourceText || ""),
          note: String(feature?.note || "")
        }))
      : [],
    setupHints: Array.isArray(source.setupHints) ? source.setupHints : [],
    warnings: Array.isArray(source.warnings) ? source.warnings.map(String) : []
  };
}

function normalizeOperation(item) {
  const op = {
    ...createEmptyShopTurnOperation(item?.type || "turning"),
    ...(item || {})
  };

  [
    "edge","feed","speed","X0","Z0","X1","Z1","D","UX","UZ","FS","R","FR","SR","X2",
    "P","G","LW","LW2","LR","H1","DP","alphaP","contourStartX","contourStartZ",
    "contourTransitionValue","ZA","FA","ZD","FD","DT","V2","VR"
  ].forEach((key) => { op[key] = normalizeNumberOrNull(op[key]); });

  op.pilotBore = normalizeBoolOrNull(op.pilotBore);
  op.throughDrilling = normalizeBoolOrNull(op.throughDrilling);
  op.contourElements = Array.isArray(op.contourElements) ? op.contourElements.map((el) => ({
    kind: el?.kind || "lineZ",
    x: normalizeNumberOrNull(el?.x),
    z: normalizeNumberOrNull(el?.z),
    radius: normalizeNumberOrNull(el?.radius),
    transitionType: el?.transitionType || "none",
    transitionValue: normalizeNumberOrNull(el?.transitionValue)
  })) : [];
  return op;
}

function normalizeShopTurnPlan(value) {
  const source = value && typeof value === "object" ? value : {};
  const normalized = createEmptyShopTurnPlan();

  normalized.geometry = normalizeGeometry(source.geometry);
  normalized.program = {
    ...normalized.program,
    ...(source.program || {}),
    XA: normalizeNumberOrNull(source.program?.XA),
    XI: normalizeNumberOrNull(source.program?.XI),
    ZB: normalizeNumberOrNull(source.program?.ZB),
    SC: normalizeNumberOrNull(source.program?.SC),
    Smax: normalizeNumberOrNull(source.program?.Smax)
  };

  // v11 compatibility: old flat operations become Setup 1.
  if (Array.isArray(source.setups)) {
    normalized.setups = source.setups.map((setup, index) => ({
      ...createEmptySetup(index),
      ...(setup || {}),
      ZA: normalizeNumberOrNull(setup?.ZA),
      ZI: normalizeNumberOrNull(setup?.ZI),
      XRA: normalizeNumberOrNull(setup?.XRA),
      ZRA: normalizeNumberOrNull(setup?.ZRA),
      operations: Array.isArray(setup?.operations) ? setup.operations.map(normalizeOperation) : []
    }));
  } else if (Array.isArray(source.operations)) {
    normalized.setups = [{
      ...createEmptySetup(0),
      workOffset: source.program?.workOffset || "",
      ZA: normalizeNumberOrNull(source.program?.ZA),
      ZI: normalizeNumberOrNull(source.program?.ZI),
      XRA: normalizeNumberOrNull(source.program?.XRA),
      ZRA: normalizeNumberOrNull(source.program?.ZRA),
      operations: source.operations.map(normalizeOperation)
    }];
  }

  if (!normalized.setups.length) normalized.setups = [createEmptySetup(0)];
  normalized.warnings = Array.isArray(source.warnings) ? source.warnings.map(String) : [];
  normalized.assumptions = Array.isArray(source.assumptions) ? source.assumptions.map(String) : [];
  return normalized;
}

async function saveVisualShopTurn() {
  syncVisibleShopTurnForm();
  const title = shopTurnPlan.program.name || shopTurnPlan.geometry.partName || shopTurnPrompt.value.trim().slice(0, 80) || "ShopTurn project";
  saveShopTurnButton.disabled = true;

  try {
    const response = await fetchApi("/api/shopturn/projects", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: shopTurnCurrentProjectId, title, payload: shopTurnPlan })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    shopTurnCurrentProjectId = data.project?.id || shopTurnCurrentProjectId;
    setShopTurnStatus("Проект v12 сохранён в Railway Postgres.", "ready");
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
        shopTurnSelection = { kind: "geometry", setupIndex: -1, opIndex: -1 };
        renderShopTurnEditor();
        setShopTurnStatus(`Открыт проект #${project.id}.`, "ready");
      });
      const del = document.createElement("button");
      del.className = "shopturn-project-delete";
      del.textContent = "×";
      del.title = "Удалить проект";
      del.addEventListener("click", async () => {
        if (!confirm(`Удалить проект "${project.title}"?`)) return;
        const response = await fetchApi(`/api/shopturn/projects/${project.id}`, { method: "DELETE" });
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

function selectShopTurn(kind, setupIndex = -1, opIndex = -1) {
  syncVisibleShopTurnForm();
  shopTurnSelection = { kind, setupIndex, opIndex };
  renderShopTurnEditor();
}

function renderShopTurnEditor() {
  renderShopTurnSequence();
  renderShopTurnWarnings();

  [shopTurnGeometryForm, shopTurnHeaderForm, shopTurnSetupForm, shopTurnOperationForm].forEach((node) => node.classList.add("hidden"));

  if (shopTurnSelection.kind === "geometry") {
    shopTurnGeometryForm.classList.remove("hidden");
    renderShopTurnGeometry();
  } else if (shopTurnSelection.kind === "program") {
    shopTurnHeaderForm.classList.remove("hidden");
    renderShopTurnHeader();
  } else if (shopTurnSelection.kind === "setup") {
    shopTurnSetupForm.classList.remove("hidden");
    renderShopTurnSetup(shopTurnSelection.setupIndex);
  } else {
    shopTurnOperationForm.classList.remove("hidden");
    renderShopTurnOperation(shopTurnSelection.setupIndex, shopTurnSelection.opIndex);
  }
}

function renderShopTurnSequence() {
  shopTurnGeometryItem.classList.toggle("active", shopTurnSelection.kind === "geometry");
  shopTurnHeaderItem.classList.toggle("active", shopTurnSelection.kind === "program");
  shopTurnSetups.textContent = "";

  shopTurnPlan.setups.forEach((setup, setupIndex) => {
    const group = document.createElement("div");
    group.className = "shopturn-setup-group";

    const setupButton = document.createElement("button");
    setupButton.className = "shopturn-setup-item";
    if (shopTurnSelection.kind === "setup" && shopTurnSelection.setupIndex === setupIndex) setupButton.classList.add("active");
    setupButton.textContent = `${setupIndex + 1}. ${setup.title || `Установка ${setupIndex + 1}`}`;
    setupButton.addEventListener("click", () => selectShopTurn("setup", setupIndex, -1));
    group.appendChild(setupButton);

    setup.operations.forEach((operation, opIndex) => {
      const button = document.createElement("button");
      button.className = "shopturn-sequence-item nested";
      if (shopTurnSelection.kind === "operation" && shopTurnSelection.setupIndex === setupIndex && shopTurnSelection.opIndex === opIndex) button.classList.add("active");
      button.textContent = `${opIndex + 1}. ${operation.title || operationTypeLabel(operation.type)}`;
      button.addEventListener("click", () => selectShopTurn("operation", setupIndex, opIndex));
      group.appendChild(button);
    });

    const addOp = document.createElement("button");
    addOp.className = "shopturn-add-op nested";
    addOp.textContent = "＋ Кадр";
    addOp.addEventListener("click", () => {
      syncVisibleShopTurnForm();
      setup.operations.push(createEmptyShopTurnOperation("turning"));
      shopTurnSelection = { kind: "operation", setupIndex, opIndex: setup.operations.length - 1 };
      renderShopTurnEditor();
    });
    group.appendChild(addOp);
    shopTurnSetups.appendChild(group);
  });

  const addSetup = document.createElement("button");
  addSetup.className = "shopturn-add-op";
  addSetup.textContent = "＋ Добавить установку";
  addSetup.addEventListener("click", () => {
    syncVisibleShopTurnForm();
    shopTurnPlan.setups.push(createEmptySetup(shopTurnPlan.setups.length));
    shopTurnSelection = { kind: "setup", setupIndex: shopTurnPlan.setups.length - 1, opIndex: -1 };
    renderShopTurnEditor();
  });
  shopTurnSetups.appendChild(addSetup);
}

function operationTypeLabel(type) {
  return {
    turning: "Обработка резаньем · CYCLE951",
    threadTurning: "Резьба резцом · CYCLE99",
    cutoff: "Отрез · CYCLE92",
    contour: "Контурная обточка",
    drilling: "Сверление · CYCLE82",
    tapping: "Внутренняя резьба · CYCLE84/840"
  }[type] || type;
}

function renderShopTurnWarnings() {
  shopTurnGeometryWarnings.textContent = "";
  shopTurnWarnings.textContent = "";
  shopTurnAssumptions.textContent = "";

  const geometryWarnings = shopTurnPlan.geometry?.warnings || [];
  const warnings = shopTurnPlan.warnings || [];
  const assumptions = shopTurnPlan.assumptions || [];

  (geometryWarnings.length ? geometryWarnings : ["Геометрические выбросы не обнаружены."]).forEach((item) => {
    shopTurnGeometryWarnings.appendChild(makeShopTurnMessage(item, geometryWarnings.length ? "warn" : "ok"));
  });
  (warnings.length ? warnings : ["Нет дополнительных предупреждений ShopTurn."]).forEach((item) => {
    shopTurnWarnings.appendChild(makeShopTurnMessage(item, warnings.length ? "warn" : "ok"));
  });
  (assumptions.length ? assumptions : ["Без дополнительных допущений."]).forEach((item) => {
    shopTurnAssumptions.appendChild(makeShopTurnMessage(item, assumptions.length ? "assume" : "ok"));
  });
}

function makeShopTurnMessage(text, kind) {
  const div = document.createElement("div");
  div.className = `shopturn-review-message ${kind}`;
  div.textContent = text;
  return div;
}

function fieldHtml(id, label, value, options = {}) {
  const unit = options.unit ? `<span class="shopturn-unit">${escapeHtml(options.unit)}</span>` : "";
  const unknown = value === null || value === undefined || value === "";
  const cls = unknown ? "shopturn-cell unknown" : "shopturn-cell";

  if (options.select) {
    const opts = options.select.map(([v, text]) => `<option value="${escapeHtml(v)}"${String(value) === String(v) ? " selected" : ""}>${escapeHtml(text)}</option>`).join("");
    return `<label class="shopturn-field"><span>${escapeHtml(label)}</span><select id="${id}" class="${cls}">${opts}</select>${unit}</label>`;
  }

  return `<label class="shopturn-field"><span>${escapeHtml(label)}</span><input id="${id}" class="${cls}" ${options.type === "text" ? 'type="text"' : 'type="number" step="any"'} value="${unknown ? "" : escapeHtml(String(value))}" placeholder="${escapeHtml(options.placeholder || "—")}" />${unit}</label>`;
}

function renderShopTurnGeometry() {
  const g = shopTurnPlan.geometry;
  const features = g.features || [];

  shopTurnGeometryForm.innerHTML = `
    <div class="shopturn-form-title">Проверенная геометрия чертежа</div>
    <div class="shopturn-form-grid">
      ${fieldHtml("st_geo_partName", "Имя детали", g.partName, { type: "text" })}
      ${fieldHtml("st_geo_unit", "Единица", g.unit, { select: [["mm","мм"],["inch","дюйм"]] })}
      ${fieldHtml("st_geo_stockOD", "Заготовка Ø наружный", g.stockOuterDiameter, { unit: "мм" })}
      ${fieldHtml("st_geo_stockID", "Заготовка Ø внутренний", g.stockInnerDiameter, { unit: "мм" })}
      ${fieldHtml("st_geo_totalLength", "Общая длина", g.totalLength, { unit: "мм" })}
      ${fieldHtml("st_geo_setupsRequired", "Требуется установок", g.setupsRequired)}
    </div>
    <div class="shopturn-geometry-title">Элементы детали · ${features.length}</div>
    <div id="st_geometry_features" class="shopturn-feature-list"></div>
    <button id="st_add_geometry_feature" type="button" class="secondary-button">＋ Элемент геометрии</button>
    <div class="shopturn-form-note">Этот слой существует специально, чтобы числа из штампа/рамки не попадали напрямую в ShopTurn. Сначала проверь геометрию, затем установки.</div>
  `;

  const container = document.getElementById("st_geometry_features");
  features.forEach((feature, index) => {
    const card = document.createElement("div");
    card.className = `shopturn-feature-card confidence-${feature.confidence || "medium"}`;
    card.innerHTML = `
      <div class="shopturn-feature-head"><strong>${escapeHtml(feature.id || `F${index + 1}`)}</strong><button type="button" data-gf-remove="${index}" class="shopturn-project-delete">×</button></div>
      <div class="shopturn-feature-grid">
        <select data-gf="${index}" data-key="type" class="shopturn-cell">
          ${[["cylinder","Цилиндр"],["step","Ступень"],["hole","Отверстие"],["thread","Резьба"],["chamfer","Фаска"],["radius","Радиус"],["face","Торец"],["other","Другое"]].map(([v,t]) => `<option value="${v}"${feature.type===v?" selected":""}>${t}</option>`).join("")}
        </select>
        <select data-gf="${index}" data-key="side" class="shopturn-cell">
          ${[["front","Спереди"],["back","Сзади"],["axial","По оси"],["unknown","Неясно"]].map(([v,t]) => `<option value="${v}"${feature.side===v?" selected":""}>${t}</option>`).join("")}
        </select>
        <input data-gf="${index}" data-key="diameter" class="shopturn-cell ${feature.diameter==null?"unknown":""}" type="number" step="any" value="${feature.diameter ?? ""}" placeholder="Ø" />
        <input data-gf="${index}" data-key="length" class="shopturn-cell ${feature.length==null?"unknown":""}" type="number" step="any" value="${feature.length ?? ""}" placeholder="L" />
        <input data-gf="${index}" data-key="fromZ" class="shopturn-cell ${feature.fromZ==null?"unknown":""}" type="number" step="any" value="${feature.fromZ ?? ""}" placeholder="от Z" />
        <input data-gf="${index}" data-key="toZ" class="shopturn-cell ${feature.toZ==null?"unknown":""}" type="number" step="any" value="${feature.toZ ?? ""}" placeholder="до Z" />
        <input data-gf="${index}" data-key="threadSize" class="shopturn-cell ${feature.threadSize?"":"unknown"}" type="text" value="${escapeHtml(feature.threadSize || "")}" placeholder="M12" />
        <input data-gf="${index}" data-key="pitch" class="shopturn-cell ${feature.pitch==null?"unknown":""}" type="number" step="any" value="${feature.pitch ?? ""}" placeholder="шаг" />
        <input data-gf="${index}" data-key="value" class="shopturn-cell ${feature.value==null?"unknown":""}" type="number" step="any" value="${feature.value ?? ""}" placeholder="R/фаска" />
        <select data-gf="${index}" data-key="confidence" class="shopturn-cell">
          <option value="high"${feature.confidence==="high"?" selected":""}>высокая</option>
          <option value="medium"${feature.confidence==="medium"?" selected":""}>средняя</option>
          <option value="low"${feature.confidence==="low"?" selected":""}>низкая</option>
        </select>
      </div>
      <div class="shopturn-feature-source">${escapeHtml(feature.sourceText || feature.note || "Источник не указан")}</div>
    `;
    container.appendChild(card);
  });

  container.querySelectorAll("[data-gf-remove]").forEach((button) => {
    button.addEventListener("click", () => {
      shopTurnPlan.geometry.features.splice(Number(button.dataset.gfRemove), 1);
      renderShopTurnEditor();
    });
  });

  document.getElementById("st_add_geometry_feature")?.addEventListener("click", () => {
    syncVisibleShopTurnForm();
    shopTurnPlan.geometry.features.push({ id: `F${shopTurnPlan.geometry.features.length + 1}`, type: "other", side: "unknown", diameter: null, innerDiameter: null, length: null, fromZ: null, toZ: null, threadSize: "", pitch: null, value: null, quantity: null, confidence: "medium", sourceText: "ручная запись", note: "" });
    renderShopTurnEditor();
  });
}

function renderShopTurnHeader() {
  const p = shopTurnPlan.program;
  shopTurnHeaderForm.innerHTML = `
    <div class="shopturn-form-title">Глобальный заголовок программы</div>
    <div class="shopturn-form-grid">
      ${fieldHtml("st_program_name", "Имя", p.name, { type: "text" })}
      ${fieldHtml("st_unit", "Единица", p.unit, { select: [["mm","мм"],["inch","дюйм"]] })}
      ${fieldHtml("st_stockShape", "Заготовка", p.stockShape, { select: [["cylinder","Цилиндр"],["tube","Труба"],["unknown","Не определено"]] })}
      ${fieldHtml("st_XA", "XA · наружный Ø", p.XA, { unit: "мм" })}
      ${fieldHtml("st_XI", "XI · внутренний Ø", p.XI, { unit: "мм" })}
      ${fieldHtml("st_ZB", "ZB · под обработку", p.ZB, { unit: "мм" })}
      ${fieldHtml("st_SC", "SC · безопасное расстояние", p.SC, { unit: "мм" })}
      ${fieldHtml("st_Smax", "S max", p.Smax, { unit: "об/мин" })}
    </div>
    <div class="shopturn-form-note">Z0/workOffset/ZA/ZI/XRA/ZRA теперь задаются отдельно для каждой физической установки.</div>`;
}

function renderShopTurnSetup(setupIndex) {
  const s = shopTurnPlan.setups[setupIndex];
  if (!s) return;
  shopTurnSetupForm.innerHTML = `
    <div class="shopturn-form-title">${escapeHtml(s.title || `Установка ${setupIndex + 1}`)}<button id="st_delete_setup" class="shopturn-delete-op" type="button">Удалить установку</button></div>
    <div class="shopturn-form-grid">
      ${fieldHtml("st_setup_title", "Название", s.title, { type: "text" })}
      ${fieldHtml("st_setup_orientation", "Ориентация", s.orientation, { select: [["front","Передняя сторона"],["back","Обратная сторона"],["unknown","Не определено"]] })}
      ${fieldHtml("st_setup_workOffset", "Рабочее смещение", s.workOffset, { type: "text", placeholder: "G54 / пусто" })}
      ${fieldHtml("st_setup_zZeroReference", "Z0 привязан к", s.zZeroReference, { select: [["front_face","Передний торец"],["back_face","Задний торец"],["custom","Другое"],["unknown","Не определено"]] })}
      ${fieldHtml("st_setup_zZeroNote", "Описание Z0", s.zZeroNote, { type: "text" })}
      ${fieldHtml("st_setup_ZA", "ZA · начало заготовки", s.ZA, { unit: "мм" })}
      ${fieldHtml("st_setup_ZI", "ZI · конец заготовки", s.ZI, { unit: "мм" })}
      ${fieldHtml("st_setup_XRA", "XRA · отвод X", s.XRA, { unit: "мм" })}
      ${fieldHtml("st_setup_ZRA", "ZRA · отвод Z", s.ZRA, { unit: "мм" })}
      ${fieldHtml("st_setup_note", "Заметка установки", s.note, { type: "text" })}
    </div>
    <div class="shopturn-form-note">У каждой установки своя система координат. Координаты Z другой установки сюда не переносятся автоматически.</div>`;

  document.getElementById("st_delete_setup")?.addEventListener("click", () => {
    if (!confirm("Удалить установку вместе с её кадрами?")) return;
    shopTurnPlan.setups.splice(setupIndex, 1);
    if (!shopTurnPlan.setups.length) shopTurnPlan.setups.push(createEmptySetup(0));
    shopTurnSelection = { kind: "geometry", setupIndex: -1, opIndex: -1 };
    renderShopTurnEditor();
  });
}

function renderShopTurnOperation(setupIndex, opIndex) {
  const setup = shopTurnPlan.setups[setupIndex];
  const op = setup?.operations?.[opIndex];
  if (!op) return;

  const common = `
    ${fieldHtml("st_op_type", "Операция", op.type, { select: [["turning","Обработка резаньем · CYCLE951"],["threadTurning","Резьба резцом · CYCLE99"],["drilling","Сверление · CYCLE82"],["tapping","Внутренняя резьба · CYCLE84/840"],["cutoff","Отрез · CYCLE92"],["contour","Контурная обточка"]] })}
    ${fieldHtml("st_op_title", "Название кадра", op.title, { type: "text" })}
    ${fieldHtml("st_op_tool", "T · инструмент", op.tool, { type: "text" })}
    ${fieldHtml("st_op_edge", "D · режущая кромка", op.edge)}
    ${fieldHtml("st_op_feed", "F · подача", op.feed, { unit: "мм/об" })}
    ${fieldHtml("st_op_speedMode", "S / V", op.speedMode, { select: [["S","S · об/мин"],["V","V · м/мин"]] })}
    ${fieldHtml("st_op_speed", op.speedMode === "V" ? "V · скорость резания" : "S · обороты", op.speed, { unit: op.speedMode === "V" ? "м/мин" : "об/мин" })}`;

  let specific = "";
  if (op.type === "turning") {
    specific = `${fieldHtml("st_op_machining", "Обработка", op.machining, { select: [["rough","Черновая"],["finish","Чистовая"],["combined","Черн. + чист."],["none","—"]] })}${fieldHtml("st_op_X0", "X0 · опорная Ø", op.X0, { unit: "мм" })}${fieldHtml("st_op_Z0", "Z0 · опорная", op.Z0, { unit: "мм" })}${fieldHtml("st_op_X1", "X1 · конечная", op.X1, { unit: "мм" })}${fieldHtml("st_op_Z1", "Z1 · конечная", op.Z1, { unit: "мм" })}${fieldHtml("st_op_Ddepth", "D · макс. глубина", op.D, { unit: "мм" })}${fieldHtml("st_op_UX", "UX · припуск X", op.UX, { unit: "мм" })}${fieldHtml("st_op_UZ", "UZ · припуск Z", op.UZ, { unit: "мм" })}${fieldHtml("st_op_FS", "FS · фаска", op.FS, { unit: "мм" })}${fieldHtml("st_op_R", "R · радиус", op.R, { unit: "мм" })}`;
  } else if (op.type === "cutoff") {
    specific = `${fieldHtml("st_op_X0", "X0 · исходная Ø", op.X0, { unit: "мм" })}${fieldHtml("st_op_Z0", "Z0 · позиция отреза", op.Z0, { unit: "мм" })}${fieldHtml("st_op_FS", "FS · фаска", op.FS, { unit: "мм" })}${fieldHtml("st_op_R", "R · закругление", op.R, { unit: "мм" })}${fieldHtml("st_op_X1", "X1 · глубина снижения", op.X1, { unit: "мм" })}${fieldHtml("st_op_FR", "FR · сниженная подача", op.FR, { unit: "мм/об" })}${fieldHtml("st_op_SR", "SR · сниженные обороты", op.SR, { unit: "об/мин" })}${fieldHtml("st_op_X2", "X2 · конечная глубина", op.X2, { unit: "мм" })}`;
  } else if (op.type === "threadTurning") {
    specific = threadFields(op) + `${fieldHtml("st_op_X0", "X0 · опорная Ø", op.X0, { unit: "мм" })}${fieldHtml("st_op_Z0", "Z0 · начало", op.Z0, { unit: "мм" })}${fieldHtml("st_op_Z1", "Z1 · конец / длина", op.Z1, { unit: "мм" })}${fieldHtml("st_op_LW", "LW · заход", op.LW, { unit: "мм" })}${fieldHtml("st_op_LW2", "LW2 · вход", op.LW2, { unit: "мм" })}${fieldHtml("st_op_LR", "LR · выход", op.LR, { unit: "мм" })}${fieldHtml("st_op_H1", "H1 · глубина", op.H1, { unit: "мм" })}${fieldHtml("st_op_DP", "DP · боковая подача", op.DP, { unit: "мм" })}${fieldHtml("st_op_alphaP", "αP · угол подачи", op.alphaP, { unit: "°" })}`;
  } else if (op.type === "drilling") {
    specific = `${drillingPlacementFields(op)}${fieldHtml("st_op_drillDepthReference", "Глубина относительно", op.drillDepthReference, { select: [["tip","Острие"],["shank","Хвостовик"],["unknown","Не определено"]] })}${fieldHtml("st_op_Z1", "Z1 · глубина сверления", op.Z1, { unit: "мм" })}${fieldHtml("st_op_pilotBore", "Засверловка", boolToSelect(op.pilotBore), { select: [["unknown","Не определено"],["true","Да"],["false","Нет"]] })}${fieldHtml("st_op_ZA", "ZA · глубина засверловки", op.ZA, { unit: "мм" })}${fieldHtml("st_op_FA", "FA · подача засверловки", op.FA, { unit: "%" })}${fieldHtml("st_op_throughDrilling", "Сквозное", boolToSelect(op.throughDrilling), { select: [["unknown","Не определено"],["true","Да"],["false","Нет"]] })}${fieldHtml("st_op_ZD", "ZD · глубина снижения F", op.ZD, { unit: "мм" })}${fieldHtml("st_op_FD", "FD · сниженная подача", op.FD, { unit: "%/F" })}${fieldHtml("st_op_DT", "DT · выдержка", op.DT, { unit: "с/об" })}`;
  } else if (op.type === "tapping") {
    specific = `${drillingPlacementFields(op)}${fieldHtml("st_op_tapChuckMode", "Компенсирующий патрон", op.tapChuckMode, { select: [["compensating","С компенсирующим"],["rigid","Без компенсирующего"],["unknown","Не определено"]] })}${fieldHtml("st_op_tapSensorMode", "Датчик шпинделя", op.tapSensorMode, { select: [["sensor","С датчиком"],["no_sensor","Без датчика"],["unknown","Не определено"]] })}${threadFields(op)}${fieldHtml("st_op_Z1", "Z1 · конец резьбы", op.Z1, { unit: "мм" })}${fieldHtml("st_op_X1", "X1 · конец на боковой поверхности", op.X1, { unit: "мм" })}${fieldHtml("st_op_SR", "SR · обороты отвода", op.SR, { unit: "об/мин" })}${fieldHtml("st_op_VR", "VR · V отвода", op.VR, { unit: "м/мин" })}${fieldHtml("st_op_tapProcess", "Обработка", op.tapProcess, { select: [["one_pass","1 проход"],["chip_break","Ломка стружки"],["chip_removal","Удаление стружки"],["unknown","Не определено"]] })}${fieldHtml("st_op_Ddepth", "D · макс. подача на глубину", op.D, { unit: "мм" })}${fieldHtml("st_op_tapRetractMode", "Отвод", op.tapRetractMode, { select: [["manual","Вручную"],["automatic","Автоматически"],["unknown","Не определено"]] })}${fieldHtml("st_op_V2", "V2 · величина отвода", op.V2, { unit: "мм" })}${fieldHtml("st_op_DT", "DT · выдержка", op.DT, { unit: "с" })}`;
  } else if (op.type === "contour") {
    specific = `${fieldHtml("st_op_contourName", "Имя контура", op.contourName, { type: "text" })}${fieldHtml("st_op_contourStartX", "Старт X Ø", op.contourStartX, { unit: "мм" })}${fieldHtml("st_op_contourStartZ", "Старт Z", op.contourStartZ, { unit: "мм" })}${fieldHtml("st_op_contourTransitionType", "Переход в начале", op.contourTransitionType, { select: [["none","Нет"],["radius","Радиус"],["chamfer","Фаска"]] })}${fieldHtml("st_op_contourTransitionValue", "R / FS", op.contourTransitionValue, { unit: "мм" })}<div class="shopturn-contour-editor"><div class="shopturn-contour-title">Элементы контура</div><div id="st_contour_elements"></div><button id="st_add_contour_element" class="secondary-button" type="button">＋ Элемент</button></div>`;
  }

  shopTurnOperationForm.innerHTML = `<div class="shopturn-form-title">${escapeHtml(setup.title)} · кадр ${opIndex + 1}<button id="st_delete_operation" class="shopturn-delete-op" type="button">Удалить кадр</button></div><div class="shopturn-form-grid">${common}${specific}${fieldHtml("st_op_confidence", "Уверенность", op.confidence, { select: [["high","Высокая"],["medium","Средняя"],["low","Низкая"]] })}${fieldHtml("st_op_note", "Примечание", op.note, { type: "text" })}</div><div class="shopturn-form-note">Поля CYCLE82 и CYCLE84/840 повторяют терминологию ShopTurn из руководства Siemens. Неизвестная глубина остаётся пустой.</div>`;

  document.getElementById("st_op_type")?.addEventListener("change", (event) => {
    const newType = event.target.value;
    syncVisibleShopTurnForm();
    const current = setup.operations[opIndex];
    setup.operations[opIndex] = { ...createEmptyShopTurnOperation(newType), tool: current.tool, edge: current.edge, feed: current.feed, speedMode: current.speedMode, speed: current.speed };
    renderShopTurnEditor();
  });
  document.getElementById("st_delete_operation")?.addEventListener("click", () => {
    if (!confirm("Удалить этот кадр ShopTurn?")) return;
    setup.operations.splice(opIndex, 1);
    shopTurnSelection = { kind: "setup", setupIndex, opIndex: -1 };
    renderShopTurnEditor();
  });
  if (op.type === "contour") {
    renderContourElements(setupIndex, opIndex);
    document.getElementById("st_add_contour_element")?.addEventListener("click", () => {
      syncVisibleShopTurnForm();
      setup.operations[opIndex].contourElements.push({ kind: "lineZ", x: null, z: null, radius: null, transitionType: "none", transitionValue: null });
      renderShopTurnEditor();
    });
  }
}

function drillingPlacementFields(op) {
  return `${fieldHtml("st_op_drillSurface", "Поверхность", op.drillSurface, { select: [["faceC","Торец C"],["faceY","Торец Y"],["faceB","Торец B"],["sideC","Боковая C"],["sideY","Боковая Y"],["unknown","Не определено"]] })}${fieldHtml("st_op_drillPosition", "Положение", op.drillPosition, { select: [["front","Спереди"],["back","Сзади"],["outside","Снаружи"],["inside","Внутри"],["unknown","Не определено"]] })}`;
}

function threadFields(op) {
  return `${fieldHtml("st_op_threadTable", "Таблица резьбы", op.threadTable, { select: [["none","Без таблицы"],["ISO_metric","ISO метрическая"],["BSW","BSW"],["BSP","BSP"],["UNC","UNC"]] })}${fieldHtml("st_op_threadSize", "Размер", op.threadSize, { type: "text", placeholder: "M12" })}${fieldHtml("st_op_P", "P · шаг", op.P, { unit: "мм/об" })}${fieldHtml("st_op_threadSide", "Резьба", op.threadSide, { select: [["external","Наружная"],["internal","Внутренняя"],["none","Не определено"]] })}`;
}

function boolToSelect(value) {
  return value === true ? "true" : value === false ? "false" : "unknown";
}

function renderContourElements(setupIndex, opIndex) {
  const container = document.getElementById("st_contour_elements");
  if (!container) return;
  const elements = shopTurnPlan.setups[setupIndex].operations[opIndex].contourElements || [];
  container.textContent = "";
  elements.forEach((element, index) => {
    const row = document.createElement("div");
    row.className = "shopturn-contour-row";
    row.innerHTML = `<select data-ce="${index}" data-key="kind" class="shopturn-cell"><option value="lineX"${element.kind === "lineX" ? " selected" : ""}>Прямая X</option><option value="lineZ"${element.kind === "lineZ" ? " selected" : ""}>Прямая Z</option><option value="lineDiag"${element.kind === "lineDiag" ? " selected" : ""}>Диагональ</option><option value="arc"${element.kind === "arc" ? " selected" : ""}>Дуга</option></select><input data-ce="${index}" data-key="x" type="number" step="any" value="${element.x ?? ""}" placeholder="X Ø" class="shopturn-cell ${element.x == null ? "unknown" : ""}" /><input data-ce="${index}" data-key="z" type="number" step="any" value="${element.z ?? ""}" placeholder="Z" class="shopturn-cell ${element.z == null ? "unknown" : ""}" /><input data-ce="${index}" data-key="radius" type="number" step="any" value="${element.radius ?? ""}" placeholder="R дуги" class="shopturn-cell ${element.radius == null ? "unknown" : ""}" /><select data-ce="${index}" data-key="transitionType" class="shopturn-cell"><option value="none"${element.transitionType === "none" ? " selected" : ""}>без перехода</option><option value="radius"${element.transitionType === "radius" ? " selected" : ""}>R</option><option value="chamfer"${element.transitionType === "chamfer" ? " selected" : ""}>фаска</option></select><input data-ce="${index}" data-key="transitionValue" type="number" step="any" value="${element.transitionValue ?? ""}" placeholder="R/FS" class="shopturn-cell ${element.transitionValue == null ? "unknown" : ""}" /><button data-remove-ce="${index}" type="button" class="shopturn-project-delete">×</button>`;
    container.appendChild(row);
  });
  container.querySelectorAll("[data-remove-ce]").forEach((button) => button.addEventListener("click", () => {
    elements.splice(Number(button.dataset.removeCe), 1);
    renderShopTurnEditor();
  }));
}

function syncVisibleShopTurnForm() {
  const get = (id) => document.getElementById(id)?.value ?? "";

  if (shopTurnSelection.kind === "geometry") {
    const g = shopTurnPlan.geometry;
    if (!document.getElementById("st_geo_partName")) return;
    g.partName = get("st_geo_partName");
    g.unit = get("st_geo_unit") || "mm";
    g.stockOuterDiameter = normalizeNumberOrNull(get("st_geo_stockOD"));
    g.stockInnerDiameter = normalizeNumberOrNull(get("st_geo_stockID"));
    g.totalLength = normalizeNumberOrNull(get("st_geo_totalLength"));
    g.setupsRequired = normalizeNumberOrNull(get("st_geo_setupsRequired"));
    document.querySelectorAll("[data-gf]").forEach((input) => {
      const index = Number(input.dataset.gf);
      const key = input.dataset.key;
      const feature = g.features[index];
      if (!feature || !key) return;
      if (["diameter","innerDiameter","length","fromZ","toZ","pitch","value","quantity"].includes(key)) feature[key] = normalizeNumberOrNull(input.value);
      else feature[key] = input.value;
    });
    return;
  }

  if (shopTurnSelection.kind === "program") {
    const p = shopTurnPlan.program;
    if (!document.getElementById("st_program_name")) return;
    p.name = get("st_program_name");
    p.unit = get("st_unit") || "mm";
    p.stockShape = get("st_stockShape") || "unknown";
    ["XA","XI","ZB","SC","Smax"].forEach((key) => { p[key] = normalizeNumberOrNull(get(`st_${key}`)); });
    return;
  }

  const setup = shopTurnPlan.setups[shopTurnSelection.setupIndex];
  if (!setup) return;

  if (shopTurnSelection.kind === "setup") {
    if (!document.getElementById("st_setup_title")) return;
    setup.title = get("st_setup_title");
    setup.orientation = get("st_setup_orientation");
    setup.workOffset = get("st_setup_workOffset");
    setup.zZeroReference = get("st_setup_zZeroReference");
    setup.zZeroNote = get("st_setup_zZeroNote");
    ["ZA","ZI","XRA","ZRA"].forEach((key) => { setup[key] = normalizeNumberOrNull(get(`st_setup_${key}`)); });
    setup.note = get("st_setup_note");
    return;
  }

  const op = setup.operations[shopTurnSelection.opIndex];
  if (!op || !document.getElementById("st_op_type")) return;
  op.title = get("st_op_title"); op.tool = get("st_op_tool"); op.edge = normalizeNumberOrNull(get("st_op_edge"));
  op.feed = normalizeNumberOrNull(get("st_op_feed")); op.speedMode = get("st_op_speedMode") || "S"; op.speed = normalizeNumberOrNull(get("st_op_speed"));
  op.confidence = get("st_op_confidence") || "medium"; op.note = get("st_op_note");
  const numericMap = { X0:"st_op_X0",Z0:"st_op_Z0",X1:"st_op_X1",Z1:"st_op_Z1",D:"st_op_Ddepth",UX:"st_op_UX",UZ:"st_op_UZ",FS:"st_op_FS",R:"st_op_R",FR:"st_op_FR",SR:"st_op_SR",X2:"st_op_X2",P:"st_op_P",G:"st_op_G",LW:"st_op_LW",LW2:"st_op_LW2",LR:"st_op_LR",H1:"st_op_H1",DP:"st_op_DP",alphaP:"st_op_alphaP",contourStartX:"st_op_contourStartX",contourStartZ:"st_op_contourStartZ",contourTransitionValue:"st_op_contourTransitionValue",ZA:"st_op_ZA",FA:"st_op_FA",ZD:"st_op_ZD",FD:"st_op_FD",DT:"st_op_DT",V2:"st_op_V2",VR:"st_op_VR" };
  Object.entries(numericMap).forEach(([key,id]) => { if (document.getElementById(id)) op[key] = normalizeNumberOrNull(get(id)); });
  ["machining","threadTable","threadSize","threadSide","contourName","contourTransitionType","drillSurface","drillPosition","drillDepthReference","tapChuckMode","tapSensorMode","tapProcess","tapRetractMode"].forEach((key) => {
    const id = `st_op_${key}`; if (document.getElementById(id)) op[key] = get(id);
  });
  if (document.getElementById("st_op_pilotBore")) op.pilotBore = normalizeBoolOrNull(get("st_op_pilotBore"));
  if (document.getElementById("st_op_throughDrilling")) op.throughDrilling = normalizeBoolOrNull(get("st_op_throughDrilling"));
  document.querySelectorAll("[data-ce]").forEach((input) => {
    const index = Number(input.dataset.ce), key = input.dataset.key, element = op.contourElements?.[index];
    if (!element || !key) return;
    element[key] = ["x","z","radius","transitionValue"].includes(key) ? normalizeNumberOrNull(input.value) : input.value;
  });
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
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
