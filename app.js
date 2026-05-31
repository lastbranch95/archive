const DB_NAME = "archiveDb";
const STORE_NAME = "items";
const DB_VERSION = 1;
const APP_VERSION = "0.1.0";
const DEFAULT_PIN = "0908";

let db;
let archiveItems = [];
let currentFilter = "active";
let currentSearch = "";

const pinScreen = document.getElementById("pinScreen");
const appRoot = document.getElementById("appRoot");
const pinInput = document.getElementById("pinInput");
const pinMessage = document.getElementById("pinMessage");
const formMessage = document.getElementById("formMessage");

window.addEventListener("load", async () => {
  db = await openDatabase();
  bindEvents();
  pinInput.focus();
});

function bindEvents() {
  document.getElementById("unlockButton").addEventListener("click", unlockApp);
  pinInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") unlockApp();
  });

  document.getElementById("lockButton").addEventListener("click", lockApp);
  document.getElementById("saveButton").addEventListener("click", saveArchiveItem);
  document.getElementById("searchInput").addEventListener("input", (event) => {
    currentSearch = event.target.value.trim().toLowerCase();
    renderArchiveList();
  });
  document.getElementById("filterSelect").addEventListener("change", (event) => {
    currentFilter = event.target.value;
    renderArchiveList();
  });
  document.getElementById("exportButton").addEventListener("click", exportJson);
  document.getElementById("importInput").addEventListener("change", importJson);
  document.getElementById("closeDetailButton").addEventListener("click", () => {
    document.getElementById("detailDialog").close();
  });
}

function unlockApp() {
  if (pinInput.value !== DEFAULT_PIN) {
    pinMessage.textContent = "PINが違います";
    pinInput.value = "";
    pinInput.focus();
    return;
  }

  pinMessage.textContent = "";
  pinInput.value = "";
  pinScreen.classList.add("hidden");
  appRoot.classList.remove("hidden");
  loadAndRender();
}

function lockApp() {
  appRoot.classList.add("hidden");
  pinScreen.classList.remove("hidden");
  pinInput.focus();
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const database = event.target.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getStore(mode = "readonly") {
  const transaction = db.transaction(STORE_NAME, mode);
  return transaction.objectStore(STORE_NAME);
}

function getAllItems() {
  return new Promise((resolve, reject) => {
    const request = getStore().getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

function putItem(item) {
  return new Promise((resolve, reject) => {
    const request = getStore("readwrite").put(item);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function loadAndRender() {
  archiveItems = await getAllItems();
  archiveItems.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  renderStats();
  renderArchiveList();
}

async function saveArchiveItem() {
  const imageInput = document.getElementById("imageInput");
  const file = imageInput.files[0];

  if (!file) {
    formMessage.textContent = "画像を選択してください";
    return;
  }

  const image = await readFileAsDataUrl(file);
  const now = new Date().toISOString();
  const item = {
    id: crypto.randomUUID(),
    image,
    memo: document.getElementById("memoInput").value.trim(),
    tags: parseTags(document.getElementById("tagsInput").value),
    category: document.getElementById("categoryInput").value,
    isFavorite: document.getElementById("favoriteInput").checked,
    isNsfw: document.getElementById("nsfwInput").checked,
    author: "",
    work: "",
    rating: null,
    createdAt: now,
    updatedAt: now,
    isDeleted: false,
    deletedAt: null
  };

  await putItem(item);
  clearForm();
  formMessage.textContent = "保存しました";
  await loadAndRender();
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function parseTags(value) {
  return value
    .split(/[、,]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function clearForm() {
  document.getElementById("imageInput").value = "";
  document.getElementById("memoInput").value = "";
  document.getElementById("tagsInput").value = "";
  document.getElementById("categoryInput").value = "未分類";
  document.getElementById("favoriteInput").checked = false;
  document.getElementById("nsfwInput").checked = false;
}

function renderStats() {
  const activeItems = archiveItems.filter((item) => !item.isDeleted);
  document.getElementById("totalCount").textContent = activeItems.length;
  document.getElementById("favoriteCount").textContent = activeItems.filter((item) => item.isFavorite).length;
  document.getElementById("trashCount").textContent = archiveItems.filter((item) => item.isDeleted).length;
}

function renderArchiveList() {
  const list = document.getElementById("archiveList");
  list.innerHTML = "";

  const filteredItems = archiveItems.filter(matchesFilter).filter(matchesSearch);

  if (filteredItems.length === 0) {
    list.innerHTML = '<div class="empty-message">表示できる画像がありません</div>';
    return;
  }

  filteredItems.forEach((item) => {
    const card = document.createElement("article");
    card.className = "archive-card";

    card.innerHTML = `
      <img src="${item.image}" alt="保存画像" />
      <div class="card-body">
        <span class="pill">${escapeHtml(item.category || "未分類")}</span>
        <p class="card-memo">${escapeHtml(item.memo || "メモなし")}</p>
        <div class="tag-row">
          ${(item.tags || []).slice(0, 3).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}
        </div>
        <div class="card-actions">
          <button data-action="detail" data-id="${item.id}">詳細</button>
          <button data-action="favorite" data-id="${item.id}">${item.isFavorite ? "★" : "☆"}</button>
          <button data-action="delete" data-id="${item.id}">${item.isDeleted ? "復元" : "削除"}</button>
        </div>
      </div>
    `;

    card.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", handleCardAction);
    });

    list.appendChild(card);
  });
}

function matchesFilter(item) {
  if (currentFilter === "active") return !item.isDeleted;
  if (currentFilter === "favorite") return !item.isDeleted && item.isFavorite;
  if (currentFilter === "nsfw") return !item.isDeleted && item.isNsfw;
  if (currentFilter === "trash") return item.isDeleted;
  return true;
}

function matchesSearch(item) {
  if (!currentSearch) return true;

  const searchTarget = [
    item.memo,
    item.category,
    item.author,
    item.work,
    ...(item.tags || [])
  ].join(" ").toLowerCase();

  return searchTarget.includes(currentSearch);
}

async function handleCardAction(event) {
  const action = event.target.dataset.action;
  const id = event.target.dataset.id;
  const item = archiveItems.find((archiveItem) => archiveItem.id === id);

  if (!item) return;

  if (action === "detail") {
    openDetail(item);
    return;
  }

  if (action === "favorite") {
    item.isFavorite = !item.isFavorite;
    item.updatedAt = new Date().toISOString();
    await putItem(item);
    await loadAndRender();
    return;
  }

  if (action === "delete") {
    item.isDeleted = !item.isDeleted;
    item.deletedAt = item.isDeleted ? new Date().toISOString() : null;
    item.updatedAt = new Date().toISOString();
    await putItem(item);
    await loadAndRender();
  }
}

function openDetail(item) {
  document.getElementById("detailImage").src = item.image;
  document.getElementById("detailCategory").textContent = item.category || "未分類";
  document.getElementById("detailMemo").textContent = item.memo || "メモなし";
  document.getElementById("detailDate").textContent = `保存日: ${formatDate(item.createdAt)}`;

  const tags = document.getElementById("detailTags");
  tags.innerHTML = "";
  (item.tags || []).forEach((tag) => {
    const span = document.createElement("span");
    span.className = "tag";
    span.textContent = tag;
    tags.appendChild(span);
  });

  document.getElementById("detailDialog").showModal();
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function exportJson() {
  const payload = {
    appName: "Archive",
    version: APP_VERSION,
    exportDate: new Date().toISOString(),
    data: archiveItems
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `archive-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

async function importJson(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const payload = JSON.parse(text);
    const data = Array.isArray(payload.data) ? payload.data : [];

    for (const item of data) {
      if (!item.id || !item.image) continue;
      await putItem({
        ...item,
        updatedAt: new Date().toISOString()
      });
    }

    event.target.value = "";
    await loadAndRender();
    alert("JSONをインポートしました");
  } catch (error) {
    alert("JSON Importに失敗しました");
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
