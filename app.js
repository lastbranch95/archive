const DB_NAME = "archiveDb";
const STORE_NAME = "items";
const DB_VERSION = 1;
const APP_VERSION = "0.3.0";
const DEFAULT_PIN = "0908";

const STORAGE_KEYS = {
  pin: "archivePin",
  autoLockMinutes: "archiveAutoLockMinutes",
  blurNsfw: "archiveBlurNsfw"
};

let db;
let archiveItems = [];
let currentFilter = "active";
let currentSearch = "";
let selectedDetailItemId = null;
let nsfwUnlocked = false;
let autoLockTimerId = null;

const pinScreen = document.getElementById("pinScreen");
const appRoot = document.getElementById("appRoot");
const settingsRoot = document.getElementById("settingsRoot");
const pinInput = document.getElementById("pinInput");
const pinMessage = document.getElementById("pinMessage");
const formMessage = document.getElementById("formMessage");

window.addEventListener("load", async () => {
  db = await openDatabase();
  bindEvents();
  applySettingsToUi();
  pinInput.focus();
});

function bindEvents() {
  document.getElementById("unlockButton").addEventListener("click", unlockApp);

  pinInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") unlockApp();
  });

  document.getElementById("lockButton").addEventListener("click", lockApp);
  document.getElementById("openSettingsButton").addEventListener("click", openSettings);
  document.getElementById("backFromSettingsButton").addEventListener("click", closeSettings);

  document.getElementById("saveButton").addEventListener("click", saveArchiveItem);

  document.getElementById("searchInput").addEventListener("input", (event) => {
    currentSearch = event.target.value.trim().toLowerCase();
    renderArchiveList();
    resetAutoLockTimer();
  });

  document.getElementById("filterSelect").addEventListener("change", handleFilterChange);

  document.getElementById("exportButton").addEventListener("click", exportJson);
  document.getElementById("importInput").addEventListener("change", importJson);

  document.getElementById("closeDetailButton").addEventListener("click", () => {
    selectedDetailItemId = null;
    document.getElementById("detailDialog").close();
  });

  document.getElementById("saveDetailButton").addEventListener("click", saveDetailChanges);
  document.getElementById("detailImage").addEventListener("click", openImagePreview);
  document.getElementById("closePreviewButton").addEventListener("click", closeImagePreview);

  document.getElementById("changePinButton").addEventListener("click", changePin);
  document.getElementById("autoLockSelect").addEventListener("change", saveAutoLockSetting);
  document.getElementById("blurNsfwInput").addEventListener("change", saveBlurNsfwSetting);
  document.getElementById("emptyTrashButton").addEventListener("click", emptyTrash);

  document.getElementById("tagSuggestionChips").addEventListener("click", (event) => {
    handleTagChipClick(event, "tagsInput");
  });

  document.getElementById("detailTagSuggestionChips").addEventListener("click", (event) => {
    handleTagChipClick(event, "detailTagsInput");
  });

  ["click", "keydown", "touchstart", "scroll"].forEach((eventName) => {
    window.addEventListener(eventName, resetAutoLockTimer, { passive: true });
  });
}

function getCurrentPin() {
  return localStorage.getItem(STORAGE_KEYS.pin) || DEFAULT_PIN;
}

function unlockApp() {
  if (pinInput.value !== getCurrentPin()) {
    pinMessage.textContent = "PINが違います";
    pinInput.value = "";
    pinInput.focus();
    return;
  }

  pinMessage.textContent = "";
  pinInput.value = "";
  pinScreen.classList.add("hidden");
  appRoot.classList.remove("hidden");
  settingsRoot.classList.add("hidden");

  loadAndRender();
  resetAutoLockTimer();
}

function lockApp() {
  nsfwUnlocked = false;
  currentFilter = "active";
  selectedDetailItemId = null;

  const filterSelect = document.getElementById("filterSelect");
  if (filterSelect) filterSelect.value = "active";

  closeOpenDialogs();

  appRoot.classList.add("hidden");
  settingsRoot.classList.add("hidden");
  pinScreen.classList.remove("hidden");

  clearTimeout(autoLockTimerId);
  autoLockTimerId = null;

  pinInput.focus();
}

function openSettings() {
  appRoot.classList.add("hidden");
  settingsRoot.classList.remove("hidden");
  applySettingsToUi();
  resetAutoLockTimer();
}

function closeSettings() {
  settingsRoot.classList.add("hidden");
  appRoot.classList.remove("hidden");
  resetAutoLockTimer();
}

function closeOpenDialogs() {
  ["detailDialog", "imagePreviewDialog"].forEach((id) => {
    const dialog = document.getElementById(id);
    if (dialog && dialog.open) dialog.close();
  });
}

function handleFilterChange(event) {
  const nextFilter = event.target.value;

  if (nextFilter === "nsfw" && !nsfwUnlocked) {
    const inputPin = prompt("NSFWを表示するにはPINを入力してください");

    if (inputPin !== getCurrentPin()) {
      alert("PINが違います");
      event.target.value = currentFilter;
      return;
    }

    nsfwUnlocked = true;
  }

  currentFilter = nextFilter;
  renderStats();
  renderArchiveList();
  resetAutoLockTimer();
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

function deleteItem(id) {
  return new Promise((resolve, reject) => {
    const request = getStore("readwrite").delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function loadAndRender() {
  const items = await getAllItems();

  archiveItems = items.map(normalizeItem);

  archiveItems.sort((a, b) => {
    const dateA = new Date(a.createdAt || 0);
    const dateB = new Date(b.createdAt || 0);
    return dateB - dateA;
  });

  renderTagSuggestions();
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
  resetAutoLockTimer();
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function normalizeItem(item) {
  return {
    ...item,
    tags: normalizeTagList(item.tags),
    isFavorite: Boolean(item.isFavorite),
    isNsfw: Boolean(item.isNsfw),
    isDeleted: Boolean(item.isDeleted),
    deletedAt: item.deletedAt || null,
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: item.updatedAt || item.createdAt || new Date().toISOString()
  };
}

function normalizeTagList(value) {
  const values = Array.isArray(value) ? value : [value];
  const tags = [];

  values.forEach((item) => {
    String(item || "")
      .split(/[、,，\n]/)
      .map((tag) => tag.trim())
      .filter(Boolean)
      .forEach((tag) => {
        if (!tags.includes(tag)) tags.push(tag);
      });
  });

  return tags;
}

function parseTags(value) {
  return normalizeTagList(value);
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
  const visibleActiveItems = archiveItems.filter((item) => {
    if (item.isDeleted) return false;
    if (!nsfwUnlocked && item.isNsfw) return false;
    return true;
  });

  const visibleTrashItems = archiveItems.filter((item) => {
    if (!item.isDeleted) return false;
    if (!nsfwUnlocked && item.isNsfw) return false;
    return true;
  });

  document.getElementById("totalCount").textContent = visibleActiveItems.length;
  document.getElementById("favoriteCount").textContent = visibleActiveItems.filter((item) => item.isFavorite).length;
  document.getElementById("trashCount").textContent = visibleTrashItems.length;
}

function renderArchiveList() {
  const list = document.getElementById("archiveList");
  list.innerHTML = "";

  const filteredItems = archiveItems
    .filter(matchesFilter)
    .filter(matchesSearch);

  if (filteredItems.length === 0) {
    list.innerHTML = '<div class="empty-message">表示できる画像がありません</div>';
    return;
  }

  filteredItems.forEach((item) => {
    const card = document.createElement("article");
    card.className = `archive-card${item.isNsfw ? " is-nsfw" : ""}`;
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute("aria-label", "詳細を開く");

    card.innerHTML = `
      <div class="card-image-wrap">
        <img src="${item.image}" alt="保存画像" />
        <button
          class="card-favorite-button"
          data-action="favorite"
          data-id="${item.id}"
          aria-label="お気に入り切替"
        >
          ${item.isFavorite ? "★" : "☆"}
        </button>
      </div>

      <div class="card-body">
        <span class="pill">${escapeHtml(item.category || "未分類")}</span>
        <p class="card-memo">${escapeHtml(item.memo || "メモなし")}</p>

        <div class="tag-row">
          ${(item.tags || [])
            .slice(0, 2)
            .map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`)
            .join("")}
        </div>

        <div class="card-actions">
          <button data-action="delete" data-id="${item.id}">
            ${item.isDeleted ? "復元" : "削除"}
          </button>
        </div>
      </div>
    `;

    card.addEventListener("click", () => {
      openDetail(item);
    });

    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openDetail(item);
      }
    });

    card.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        handleCardAction(event);
      });
    });

    list.appendChild(card);
  });
}

function matchesFilter(item) {
  if (currentFilter === "active") {
    return !item.isDeleted && !item.isNsfw;
  }

  if (currentFilter === "favorite") {
    return !item.isDeleted && item.isFavorite && !item.isNsfw;
  }

  if (currentFilter === "unorganized") {
    return !item.isDeleted && !item.isNsfw && isUnorganized(item);
  }

  if (currentFilter === "nsfw") {
    return !item.isDeleted && item.isNsfw && nsfwUnlocked;
  }

  if (currentFilter === "trash") {
    if (!item.isDeleted) return false;
    if (!nsfwUnlocked && item.isNsfw) return false;
    return true;
  }

  return true;
}

function isUnorganized(item) {
  const hasNoMemo = !String(item.memo || "").trim();
  const hasNoTags = !Array.isArray(item.tags) || item.tags.length === 0;
  const hasNoCategory = !item.category || item.category === "未分類";

  return hasNoMemo || hasNoTags || hasNoCategory;
}

function matchesSearch(item) {
  if (!currentSearch) return true;

  const searchTarget = [
    item.memo,
    item.category,
    item.author,
    item.work,
    ...(item.tags || [])
  ]
    .join(" ")
    .toLowerCase();

  return searchTarget.includes(currentSearch);
}

async function handleCardAction(event) {
  const action = event.target.dataset.action;
  const id = event.target.dataset.id;
  const item = archiveItems.find((archiveItem) => archiveItem.id === id);

  if (!item) return;

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
  selectedDetailItemId = item.id;

  document.getElementById("detailImage").src = item.image;
  document.getElementById("detailDate").textContent =
    `保存日: ${formatDate(item.createdAt)}\n更新日: ${formatDate(item.updatedAt)}`;

  document.getElementById("detailCategoryInput").value = item.category || "未分類";
  document.getElementById("detailTagsInput").value = (item.tags || []).join(", ");
  document.getElementById("detailMemoInput").value = item.memo || "";
  document.getElementById("detailFavoriteInput").checked = Boolean(item.isFavorite);
  document.getElementById("detailNsfwInput").checked = Boolean(item.isNsfw);

  document.getElementById("detailDialog").showModal();
  resetAutoLockTimer();
}

async function saveDetailChanges() {
  if (!selectedDetailItemId) return;

  const item = archiveItems.find((archiveItem) => archiveItem.id === selectedDetailItemId);
  if (!item) return;

  item.category = document.getElementById("detailCategoryInput").value;
  item.tags = parseTags(document.getElementById("detailTagsInput").value);
  item.memo = document.getElementById("detailMemoInput").value.trim();
  item.isFavorite = document.getElementById("detailFavoriteInput").checked;
  item.isNsfw = document.getElementById("detailNsfwInput").checked;
  item.updatedAt = new Date().toISOString();

  await putItem(item);
  await loadAndRender();

  selectedDetailItemId = null;
  document.getElementById("detailDialog").close();
  resetAutoLockTimer();
}

function openImagePreview() {
  const src = document.getElementById("detailImage").src;
  if (!src) return;

  document.getElementById("previewImage").src = src;
  document.getElementById("imagePreviewDialog").showModal();
  resetAutoLockTimer();
}

function closeImagePreview() {
  document.getElementById("imagePreviewDialog").close();
}

function renderTagSuggestions() {
  const datalist = document.getElementById("tagSuggestions");
  const chips = document.getElementById("tagSuggestionChips");
  const detailChips = document.getElementById("detailTagSuggestionChips");

  const tags = new Set();

  archiveItems.forEach((item) => {
    (item.tags || []).forEach((tag) => {
      if (tag) tags.add(tag);
    });
  });

  const sortedTags = [...tags].sort((a, b) => a.localeCompare(b, "ja")).slice(0, 24);

  if (datalist) {
    datalist.innerHTML = "";
    sortedTags.forEach((tag) => {
      const option = document.createElement("option");
      option.value = tag;
      datalist.appendChild(option);
    });
  }

  [chips, detailChips].forEach((container) => {
    if (!container) return;

    container.innerHTML = "";

    if (sortedTags.length === 0) {
      container.innerHTML = '<span class="muted small-note">登録済みタグなし</span>';
      return;
    }

    sortedTags.forEach((tag) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tag-chip-button";
      button.dataset.tag = tag;
      button.textContent = tag;
      container.appendChild(button);
    });
  });
}

function handleTagChipClick(event, inputId) {
  const button = event.target.closest("button[data-tag]");
  if (!button) return;

  addTagToInput(inputId, button.dataset.tag);
  resetAutoLockTimer();
}

function addTagToInput(inputId, tag) {
  const input = document.getElementById(inputId);
  if (!input || !tag) return;

  const tags = parseTags(input.value);

  if (!tags.includes(tag)) {
    tags.push(tag);
  }

  input.value = tags.join(", ");
  input.focus();
}

function changePin() {
  const currentPin = document.getElementById("currentPinInput").value;
  const newPin = document.getElementById("newPinInput").value;
  const confirmPin = document.getElementById("confirmPinInput").value;
  const message = document.getElementById("settingsMessage");

  if (currentPin !== getCurrentPin()) {
    message.textContent = "現在のPINが違います";
    return;
  }

  if (!newPin || newPin.length < 4) {
    message.textContent = "新しいPINは4桁以上にしてください";
    return;
  }

  if (newPin !== confirmPin) {
    message.textContent = "新しいPINが一致しません";
    return;
  }

  localStorage.setItem(STORAGE_KEYS.pin, newPin);

  document.getElementById("currentPinInput").value = "";
  document.getElementById("newPinInput").value = "";
  document.getElementById("confirmPinInput").value = "";

  message.textContent = "PINを変更しました";
  resetAutoLockTimer();
}

function applySettingsToUi() {
  document.getElementById("appVersionText").textContent = APP_VERSION;

  const autoLockValue = localStorage.getItem(STORAGE_KEYS.autoLockMinutes) || "3";
  document.getElementById("autoLockSelect").value = autoLockValue;

  const blurNsfw = localStorage.getItem(STORAGE_KEYS.blurNsfw) === "true";
  document.getElementById("blurNsfwInput").checked = blurNsfw;
  document.body.classList.toggle("blur-nsfw", blurNsfw);
}

function saveAutoLockSetting() {
  const value = document.getElementById("autoLockSelect").value;
  localStorage.setItem(STORAGE_KEYS.autoLockMinutes, value);
  resetAutoLockTimer();
}

function saveBlurNsfwSetting() {
  const checked = document.getElementById("blurNsfwInput").checked;
  localStorage.setItem(STORAGE_KEYS.blurNsfw, String(checked));
  document.body.classList.toggle("blur-nsfw", checked);
  renderArchiveList();
  resetAutoLockTimer();
}

function resetAutoLockTimer() {
  const appVisible = !appRoot.classList.contains("hidden") || !settingsRoot.classList.contains("hidden");
  if (!appVisible) return;

  clearTimeout(autoLockTimerId);

  const minutes = Number(localStorage.getItem(STORAGE_KEYS.autoLockMinutes) || "3");
  if (!minutes) return;

  autoLockTimerId = setTimeout(() => {
    lockApp();
  }, minutes * 60 * 1000);
}

async function emptyTrash() {
  const trashedItems = archiveItems.filter((item) => item.isDeleted);

  if (trashedItems.length === 0) {
    alert("ゴミ箱は空です");
    return;
  }

  const ok = confirm(`ゴミ箱の${trashedItems.length}件を完全削除します。よろしいですか？`);
  if (!ok) return;

  for (const item of trashedItems) {
    await deleteItem(item.id);
  }

  await loadAndRender();
  alert("ゴミ箱を空にしました");
  resetAutoLockTimer();
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
  const includeNsfw = confirm(
    "JSON Exportには画像本体が含まれます。\n\nNSFW画像も含めてExportしますか？\n\nOK: 全件Export\nキャンセル: NSFWを除外してExport"
  );

  const exportItems = includeNsfw
    ? archiveItems
    : archiveItems.filter((item) => !item.isNsfw);

  const payload = {
    appName: "Archive",
    version: APP_VERSION,
    exportDate: new Date().toISOString(),
    includeNsfw,
    data: exportItems
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json"
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const exportType = includeNsfw ? "all" : "safe";

  link.href = url;
  link.download = `archive-backup-${exportType}-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();

  URL.revokeObjectURL(url);
  resetAutoLockTimer();
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

      await putItem(normalizeItem({
        ...item,
        updatedAt: new Date().toISOString()
      }));
    }

    event.target.value = "";
    await loadAndRender();

    alert("JSONをインポートしました");
  } catch (error) {
    alert("JSON Importに失敗しました");
  }

  resetAutoLockTimer();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}