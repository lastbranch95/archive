const DB_NAME = "archiveDb";
const STORE_NAME = "items";
const DB_VERSION = 1;
const APP_VERSION = "0.5.2";
const DEFAULT_PIN = "0908";

const STORAGE_KEYS = {
  pin: "archivePin",
  privatePin: "archivePrivatePin",
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
let savedScrollY = 0;
let openDialogCount = 0;
let currentDetailImageInfoText = "";
let currentMangaPages = [];
let currentMangaPageIndex = 0;
let mangaTouchStartX = 0;
let mangaTouchStartY = 0;

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
  document.getElementById("imageInput").addEventListener("change", updateSelectedFileName);
  document.getElementById("refreshButton").addEventListener("click", refreshArchiveApp);

  document.getElementById("searchInput").addEventListener("input", (event) => {
    currentSearch = event.target.value.trim().toLowerCase();
    renderArchiveList();
    resetAutoLockTimer();
  });

  document.getElementById("filterSelect").addEventListener("change", handleFilterChange);

  document.getElementById("mangaGroupList").addEventListener("click", handleMangaGroupClick);

  document.getElementById("exportButton").addEventListener("click", exportJson);
  document.getElementById("importInput").addEventListener("change", importJson);

  document.getElementById("closeDetailButton").addEventListener("click", closeDetail);
  document.getElementById("saveDetailButton").addEventListener("click", saveDetailChanges);
  document.getElementById("detailDeleteButton").addEventListener("click", toggleDeleteFromDetail);
  document.getElementById("detailDownloadButton").addEventListener("click", downloadSelectedDetailImage);
  document.getElementById("toggleImageInfoButton").addEventListener("click", toggleImageInfoPanel);

  document.getElementById("detailImage").addEventListener("click", openImagePreview);
  document.getElementById("closePreviewButton").addEventListener("click", closeImagePreview);
  document.getElementById("closeMangaViewerButton").addEventListener("click", closeMangaViewer);
  document.getElementById("prevMangaPageButton").addEventListener("click", showPrevMangaPage);
  document.getElementById("nextMangaPageButton").addEventListener("click", showNextMangaPage);
  bindMangaSwipeEvents();

  document.getElementById("changePinButton").addEventListener("click", changePin);
  document.getElementById("autoLockSelect").addEventListener("change", saveAutoLockSetting);
  document.getElementById("blurNsfwInput").addEventListener("change", saveBlurNsfwSetting);
  document.getElementById("emptyTrashButton").addEventListener("click", emptyTrash);

  document.getElementById("openPrivateModeButton").addEventListener("click", openPrivateMode);
  document.getElementById("closePrivateModeButton").addEventListener("click", closePrivateMode);
  document.getElementById("changePrivatePinButton").addEventListener("click", changePrivatePin);

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

function getPrivatePin() {
  return localStorage.getItem(STORAGE_KEYS.privatePin) || getCurrentPin();
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

  closeOpenDialogs();
  forceUnlockBodyScroll();

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
  ["imagePreviewDialog", "detailDialog", "mangaViewerDialog"].forEach((id) => {
    const dialog = document.getElementById(id);
    if (dialog && dialog.open) dialog.close();
  });
}

function lockBodyScroll() {
  if (openDialogCount === 0) {
    savedScrollY = window.scrollY;
    document.body.style.top = `-${savedScrollY}px`;
    document.body.classList.add("modal-open");
  }

  openDialogCount += 1;
}

function unlockBodyScroll() {
  openDialogCount = Math.max(0, openDialogCount - 1);

  if (openDialogCount === 0) {
    document.body.classList.remove("modal-open");
    document.body.style.top = "";
    window.scrollTo(0, savedScrollY);
  }
}

function forceUnlockBodyScroll() {
  openDialogCount = 0;
  document.body.classList.remove("modal-open");
  document.body.style.top = "";
  window.scrollTo(0, savedScrollY);
}

function handleFilterChange(event) {
  const nextFilter = event.target.value;

  if (nextFilter.startsWith("private") && !nsfwUnlocked) {
    event.target.value = currentFilter;
    alert("Privateモードを設定画面から開いてください");
    return;
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
  refreshArchiveView();
}

function refreshArchiveView() {
  renderFilterOptions();
  renderStats();
  renderArchiveList();
  renderMangaGroups();
  updateDataSummary();
  updatePrivateSettingsUi();
  updatePrivateHeaderIndicator();
}

async function refreshArchiveApp() {
  const refreshButton = document.getElementById("refreshButton");

  if (refreshButton) {
    refreshButton.classList.add("refreshing");
    refreshButton.disabled = true;
  }

  try {
    await loadAndRender();
    await wait(280);
  } finally {
    if (refreshButton) {
      refreshButton.classList.remove("refreshing");
      refreshButton.disabled = false;
    }
  }

  resetAutoLockTimer();
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function saveArchiveItem() {
  const imageInput = document.getElementById("imageInput");
  const files = Array.from(imageInput.files || []);

  if (files.length === 0) {
    formMessage.textContent = "画像を選択してください";
    return;
  }

  const memo = document.getElementById("memoInput").value.trim();
  const tags = parseTags(document.getElementById("tagsInput").value);
  const category = document.getElementById("categoryInput").value;
  const mangaTitle = normalizeMangaTitle(document.getElementById("mangaTitleInput").value);
  const startPage = parsePageNumber(document.getElementById("mangaPageInput").value);
  const isFavorite = document.getElementById("favoriteInput").checked;
  const isNsfw = document.getElementById("nsfwInput").checked;

  for (let index = 0; index < files.length; index += 1) {
    const image = await readFileAsDataUrl(files[index]);
    const now = new Date().toISOString();
    const mangaPage = startPage ? startPage + index : null;

    const item = {
      id: crypto.randomUUID(),
      image,
      memo,
      tags,
      category,
      mangaTitle,
      mangaPage,
      isFavorite,
      isNsfw,
      author: "",
      work: "",
      rating: null,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
      deletedAt: null
    };

    await putItem(item);
  }

  clearForm();

  const tagText = tags.length > 0 ? tags.join(", ") : "タグなし";
  const pageText = mangaTitle && startPage
    ? `
漫画: ${mangaTitle} / ${startPage}P〜${startPage + files.length - 1}P`
    : mangaTitle
      ? `
漫画: ${mangaTitle}`
      : "";

  formMessage.textContent =
    `${files.length}枚保存しました
カテゴリ: ${category || "未分類"}
タグ: ${tagText}${pageText}`;

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
    mangaTitle: normalizeMangaTitle(item.mangaTitle || item.groupTitle || ""),
    mangaPage: parsePageNumber(item.mangaPage || item.pageNumber),
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

function normalizeMangaTitle(value) {
  return String(value || "").trim();
}

function parsePageNumber(value) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function createImageFileName(item) {
  const mimeType = getMimeTypeFromDataUrl(item.image);
  const extensionMap = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif"
  };

  const extension = extensionMap[mimeType] || "png";
  const date = String(item.createdAt || new Date().toISOString()).slice(0, 10);
  const title = item.mangaTitle
    ? item.mangaTitle.replace(/[\\/:*?"<>|]/g, "_").slice(0, 36)
    : "archive";

  const page = item.mangaPage ? `-${String(item.mangaPage).padStart(3, "0")}` : "";
  return `${title}${page}-${date}.${extension}`;
}

function downloadDataUrl(dataUrl, fileName) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function getVisibleItemsForGrouping() {
  return archiveItems.filter((item) => {
    if (item.isDeleted) return false;
    if (!nsfwUnlocked && item.isNsfw) return false;
    return true;
  });
}

function clearForm() {
  document.getElementById("imageInput").value = "";
  document.getElementById("memoInput").value = "";
  document.getElementById("tagsInput").value = "";
  document.getElementById("categoryInput").value = "未分類";
  document.getElementById("mangaTitleInput").value = "";
  document.getElementById("mangaPageInput").value = "";
  document.getElementById("favoriteInput").checked = false;
  document.getElementById("nsfwInput").checked = false;
  updateSelectedFileName();
}


function buildMangaGroups() {
  const groupMap = new Map();

  getVisibleItemsForGrouping()
    .filter((item) => item.mangaTitle)
    .forEach((item) => {
      if (!groupMap.has(item.mangaTitle)) {
        groupMap.set(item.mangaTitle, []);
      }

      groupMap.get(item.mangaTitle).push(item);
    });

  return [...groupMap.entries()]
    .map(([title, items]) => {
      const sortedItems = sortMangaPages(items);
      return {
        title,
        items: sortedItems,
        cover: sortedItems[0],
        updatedAt: sortedItems.reduce((latest, item) => {
          const itemDate = new Date(item.updatedAt || item.createdAt || 0);
          return itemDate > latest ? itemDate : latest;
        }, new Date(0))
      };
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

function sortMangaPages(items) {
  return [...items].sort((a, b) => {
    const pageA = a.mangaPage || 999999;
    const pageB = b.mangaPage || 999999;

    if (pageA !== pageB) {
      return pageA - pageB;
    }

    return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
  });
}

function renderMangaGroups() {
  const list = document.getElementById("mangaGroupList");
  if (!list) return;

  const groups = buildMangaGroups();

  if (groups.length === 0) {
    list.innerHTML = '<div class="empty-message">漫画グループはまだありません</div>';
    return;
  }

  list.innerHTML = "";

  groups.forEach((group) => {
    const card = document.createElement("article");
    card.className = "manga-group-card";
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.dataset.groupTitle = group.title;

    card.innerHTML = `
      <img src="${group.cover.image}" alt="漫画グループ表紙" />
      <div class="manga-group-body">
        <p class="manga-group-kicker">漫画グループ</p>
        <h3>${escapeHtml(group.title)}</h3>
        <p class="manga-group-meta">${group.items.length}ページ</p>
      </div>
    `;

    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openMangaViewer(group.title);
      }
    });

    list.appendChild(card);
  });
}

function handleMangaGroupClick(event) {
  const card = event.target.closest(".manga-group-card");
  if (!card) return;

  openMangaViewer(card.dataset.groupTitle);
}

function openMangaViewer(groupTitle) {
  currentMangaPages = sortMangaPages(
    getVisibleItemsForGrouping().filter((item) => item.mangaTitle === groupTitle)
  );
  currentMangaPageIndex = 0;

  if (currentMangaPages.length === 0) {
    alert("この漫画グループには表示できる画像がありません");
    return;
  }

  const dialog = document.getElementById("mangaViewerDialog");
  const title = document.getElementById("mangaViewerTitle");

  title.textContent = groupTitle;
  renderCurrentMangaPage();

  dialog.showModal();
  lockBodyScroll();
  resetAutoLockTimer();
}

function renderCurrentMangaPage() {
  const count = document.getElementById("mangaViewerCount");
  const images = document.getElementById("mangaViewerImages");
  const prevButton = document.getElementById("prevMangaPageButton");
  const nextButton = document.getElementById("nextMangaPageButton");
  const item = currentMangaPages[currentMangaPageIndex];

  if (!item) return;

  const pageLabel = item.mangaPage ? `${item.mangaPage}P` : `${currentMangaPageIndex + 1}P`;
  count.textContent = `${currentMangaPageIndex + 1} / ${currentMangaPages.length}　${pageLabel}`;

  images.innerHTML = `
    <section class="manga-slide-page">
      <div class="manga-viewer-page-label">${escapeHtml(pageLabel)}</div>
      <img src="${item.image}" alt="${escapeHtml(item.mangaTitle || "漫画")} ${currentMangaPageIndex + 1}ページ" />
    </section>
  `;

  if (prevButton) prevButton.disabled = currentMangaPageIndex === 0;
  if (nextButton) nextButton.disabled = currentMangaPageIndex >= currentMangaPages.length - 1;
}

function showNextMangaPage() {
  if (currentMangaPageIndex >= currentMangaPages.length - 1) return;

  currentMangaPageIndex += 1;
  renderCurrentMangaPage();
  resetAutoLockTimer();
}

function showPrevMangaPage() {
  if (currentMangaPageIndex <= 0) return;

  currentMangaPageIndex -= 1;
  renderCurrentMangaPage();
  resetAutoLockTimer();
}

function bindMangaSwipeEvents() {
  const viewer = document.getElementById("mangaViewerImages");
  if (!viewer) return;

  viewer.addEventListener("touchstart", (event) => {
    mangaTouchStartX = event.changedTouches[0].screenX;
    mangaTouchStartY = event.changedTouches[0].screenY;
  }, { passive: true });

  viewer.addEventListener("touchend", (event) => {
    const endX = event.changedTouches[0].screenX;
    const endY = event.changedTouches[0].screenY;
    handleMangaSwipe(endX, endY);
  }, { passive: true });
}

function handleMangaSwipe(endX, endY) {
  const diffX = mangaTouchStartX - endX;
  const diffY = mangaTouchStartY - endY;
  const threshold = 50;

  if (Math.abs(diffX) < threshold) return;
  if (Math.abs(diffY) > Math.abs(diffX) * 0.9) return;

  if (diffX > 0) {
    showNextMangaPage();
  } else {
    showPrevMangaPage();
  }
}

function closeMangaViewer() {
  const dialog = document.getElementById("mangaViewerDialog");

  if (dialog.open) {
    dialog.close();
    unlockBodyScroll();
  }

  currentMangaPages = [];
  currentMangaPageIndex = 0;
}

function downloadSelectedDetailImage() {
  if (!selectedDetailItemId) return;

  const item = archiveItems.find((archiveItem) => archiveItem.id === selectedDetailItemId);
  if (!item || !item.image) return;

  downloadDataUrl(item.image, createImageFileName(item));
  resetAutoLockTimer();
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
    const visibleTags = (item.tags || []).slice(0, 2);

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

        ${item.mangaTitle ? `
          <div class="manga-mini-info">
            漫画: ${escapeHtml(item.mangaTitle)}${item.mangaPage ? ` / ${escapeHtml(item.mangaPage)}P` : ""}
          </div>
        ` : ""}

        ${visibleTags.length > 0 ? `
          <div class="tag-row">
            ${visibleTags
              .map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`)
              .join("")}
          </div>
        ` : ""}
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

  if (currentFilter === "manga") {
    if (item.isDeleted || !item.mangaTitle) return false;
    if (!nsfwUnlocked && item.isNsfw) return false;
    return true;
  }

  if (currentFilter === "private") {
    return !item.isDeleted && item.isNsfw && nsfwUnlocked;
  }

  if (currentFilter === "privateManga") {
    return !item.isDeleted && item.isNsfw && nsfwUnlocked && Boolean(item.mangaTitle);
  }

  if (currentFilter === "privateSingle") {
    return !item.isDeleted && item.isNsfw && nsfwUnlocked && !item.mangaTitle;
  }

  if (currentFilter === "privateFavorite") {
    return !item.isDeleted && item.isNsfw && nsfwUnlocked && item.isFavorite;
  }

  if (currentFilter === "privateUnorganized") {
    return !item.isDeleted && item.isNsfw && nsfwUnlocked && isUnorganized(item);
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
    item.mangaTitle,
    item.mangaPage,
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
  }
}

function openDetail(item) {
  selectedDetailItemId = item.id;

  document.getElementById("detailImage").src = item.image;
  document.getElementById("detailDate").textContent =
    `保存日: ${formatDate(item.createdAt)}\n更新日: ${formatDate(item.updatedAt)}`;

  currentDetailImageInfoText = "画像情報を取得中です";
  document.getElementById("imageInfoPanel").classList.add("hidden");
  document.getElementById("imageInfoPanel").textContent = "";
  document.getElementById("toggleImageInfoButton").textContent = "画像情報";
  updateCurrentImageInfo(item.image);

  document.getElementById("detailCategoryInput").value = item.category || "未分類";
  document.getElementById("detailTagsInput").value = (item.tags || []).join(", ");
  document.getElementById("detailMemoInput").value = item.memo || "";
  document.getElementById("detailMangaTitleInput").value = item.mangaTitle || "";
  document.getElementById("detailMangaPageInput").value = item.mangaPage || "";
  document.getElementById("detailFavoriteInput").checked = Boolean(item.isFavorite);
  document.getElementById("detailNsfwInput").checked = Boolean(item.isNsfw);
  document.getElementById("detailDeleteButton").textContent = item.isDeleted ? "復元" : "削除";

  document.getElementById("detailDialog").showModal();
  lockBodyScroll();
  resetAutoLockTimer();
}

function closeDetail() {
  selectedDetailItemId = null;

  const detailDialog = document.getElementById("detailDialog");
  if (detailDialog.open) {
    detailDialog.close();
    unlockBodyScroll();
  }
}

async function saveDetailChanges() {
  if (!selectedDetailItemId) return;

  const item = archiveItems.find((archiveItem) => archiveItem.id === selectedDetailItemId);
  if (!item) return;

  item.category = document.getElementById("detailCategoryInput").value;
  item.tags = parseTags(document.getElementById("detailTagsInput").value);
  item.memo = document.getElementById("detailMemoInput").value.trim();
  item.mangaTitle = normalizeMangaTitle(document.getElementById("detailMangaTitleInput").value);
  item.mangaPage = parsePageNumber(document.getElementById("detailMangaPageInput").value);
  item.isFavorite = document.getElementById("detailFavoriteInput").checked;
  item.isNsfw = document.getElementById("detailNsfwInput").checked;
  item.updatedAt = new Date().toISOString();

  await putItem(item);
  await loadAndRender();

  selectedDetailItemId = null;

  const detailDialog = document.getElementById("detailDialog");
  if (detailDialog.open) {
    detailDialog.close();
    unlockBodyScroll();
  }

  resetAutoLockTimer();
}

async function toggleDeleteFromDetail() {
  if (!selectedDetailItemId) return;

  const item = archiveItems.find((archiveItem) => archiveItem.id === selectedDetailItemId);
  if (!item) return;

  const ok = item.isDeleted
    ? confirm("この画像を復元しますか？\n通常一覧に戻ります。")
    : confirm("この画像をゴミ箱に移動しますか？\nあとでゴミ箱から復元できます。");

  if (!ok) return;

  item.isDeleted = !item.isDeleted;
  item.deletedAt = item.isDeleted ? new Date().toISOString() : null;
  item.updatedAt = new Date().toISOString();

  await putItem(item);
  await loadAndRender();

  selectedDetailItemId = null;

  const detailDialog = document.getElementById("detailDialog");
  if (detailDialog.open) {
    detailDialog.close();
    unlockBodyScroll();
  }

  resetAutoLockTimer();
}

function openImagePreview() {
  const src = document.getElementById("detailImage").src;
  if (!src) return;

  document.getElementById("previewImage").src = src;
  document.getElementById("imagePreviewDialog").showModal();
  lockBodyScroll();
  resetAutoLockTimer();
}

function closeImagePreview() {
  const imagePreviewDialog = document.getElementById("imagePreviewDialog");

  if (imagePreviewDialog.open) {
    imagePreviewDialog.close();
    unlockBodyScroll();
  }
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

  const sortedTags = [...tags].sort((a, b) => a.localeCompare(b, "ja")).slice(0, 12);

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

function openPrivateMode() {
  const inputPin = prompt("Privateモードを開くにはPINを入力してください");

  if (inputPin !== getPrivatePin()) {
    alert("PINが違います");
    return;
  }

  nsfwUnlocked = true;
  currentFilter = "active";

  refreshArchiveView();
  resetAutoLockTimer();
}

function closePrivateMode() {
  nsfwUnlocked = false;
  currentFilter = "active";

  refreshArchiveView();
  resetAutoLockTimer();
}

function changePrivatePin() {
  const currentPin = document.getElementById("currentPrivatePinInput").value;
  const newPin = document.getElementById("newPrivatePinInput").value;
  const confirmPin = document.getElementById("confirmPrivatePinInput").value;
  const message = document.getElementById("privateSettingsMessage");

  if (currentPin !== getPrivatePin()) {
    message.textContent = "現在のPrivate PINが違います";
    return;
  }

  if (!newPin || newPin.length < 4) {
    message.textContent = "新しいPrivate PINは4桁以上にしてください";
    return;
  }

  if (newPin !== confirmPin) {
    message.textContent = "新しいPrivate PINが一致しません";
    return;
  }

  localStorage.setItem(STORAGE_KEYS.privatePin, newPin);

  document.getElementById("currentPrivatePinInput").value = "";
  document.getElementById("newPrivatePinInput").value = "";
  document.getElementById("confirmPrivatePinInput").value = "";

  message.textContent = "Private PINを変更しました";
  resetAutoLockTimer();
}

function updatePrivateSettingsUi() {
  const status = document.getElementById("privateModeStatus");
  const openButton = document.getElementById("openPrivateModeButton");
  const closeButton = document.getElementById("closePrivateModeButton");
  const privateSettingsArea = document.getElementById("privateSettingsArea");

  document.body.classList.toggle("private-unlocked", nsfwUnlocked);
  updatePrivateHeaderIndicator();

  if (!status || !openButton || !closeButton || !privateSettingsArea) return;

  status.textContent = nsfwUnlocked ? "Privateモード：ON" : "Privateモード：OFF";
  openButton.classList.toggle("hidden", nsfwUnlocked);
  closeButton.classList.toggle("hidden", !nsfwUnlocked);
  privateSettingsArea.classList.toggle("hidden", !nsfwUnlocked);
}

function updatePrivateHeaderIndicator() {
  const badge = document.getElementById("privateHeaderBadge");
  if (!badge) return;

  badge.classList.toggle("hidden", !nsfwUnlocked);
}

function renderFilterOptions() {
  const filterSelect = document.getElementById("filterSelect");
  if (!filterSelect) return;

  const options = [
    { value: "active", label: "通常" },
    { value: "favorite", label: "お気に入り" },
    { value: "unorganized", label: "未整理" },
    { value: "manga", label: "漫画" }
  ];

  if (nsfwUnlocked) {
    options.push({ value: "private", label: "Private" });
    options.push({ value: "privateManga", label: "Private漫画" });
    options.push({ value: "privateSingle", label: "Private単体" });
    options.push({ value: "privateFavorite", label: "Privateお気に入り" });
    options.push({ value: "privateUnorganized", label: "Private未整理" });
  }

  options.push({ value: "trash", label: "ゴミ箱" });

  if (!options.some((option) => option.value === currentFilter)) {
    currentFilter = "active";
  }

  filterSelect.innerHTML = "";

  options.forEach((option) => {
    const element = document.createElement("option");
    element.value = option.value;
    element.textContent = option.label;
    filterSelect.appendChild(element);
  });

  filterSelect.value = currentFilter;
}

function updateSelectedFileName() {
  const imageInput = document.getElementById("imageInput");
  const selectedFileName = document.getElementById("selectedFileName");

  if (!imageInput || !selectedFileName) return;

  const files = Array.from(imageInput.files || []);

  if (files.length === 0) {
    selectedFileName.textContent = "未選択";
    return;
  }

  if (files.length === 1) {
    selectedFileName.textContent = files[0].name;
    return;
  }

  selectedFileName.textContent = `${files.length}枚選択`;
}

function updateDataSummary() {
  const itemCount = document.getElementById("storageItemCount");
  const imageSize = document.getElementById("storageImageSize");
  const jsonSize = document.getElementById("storageJsonSize");

  if (!itemCount || !imageSize || !jsonSize) return;

  const activeItems = archiveItems.filter((item) => !item.isDeleted);
  const totalImageBytes = activeItems.reduce((sum, item) => {
    return sum + getByteSizeFromDataUrl(item.image);
  }, 0);

  const estimatedPayload = {
    appName: "Archive",
    version: APP_VERSION,
    exportDate: new Date().toISOString(),
    includeNsfw: true,
    data: activeItems
  };

  const estimatedJsonBytes = new Blob([JSON.stringify(estimatedPayload)]).size;

  itemCount.textContent = `${activeItems.length}件`;
  imageSize.textContent = formatBytes(totalImageBytes);
  jsonSize.textContent = formatBytes(estimatedJsonBytes);
}

async function updateCurrentImageInfo(dataUrl) {
  const mimeType = getMimeTypeFromDataUrl(dataUrl);
  const byteSize = getByteSizeFromDataUrl(dataUrl);

  try {
    const dimensions = await getImageDimensions(dataUrl);

    currentDetailImageInfoText = [
      `形式: ${mimeType || "不明"}`,
      `サイズ: ${dimensions.width} × ${dimensions.height}px`,
      `推定容量: ${formatBytes(byteSize)}`
    ].join("\n");
  } catch (error) {
    currentDetailImageInfoText = [
      `形式: ${mimeType || "不明"}`,
      "サイズ: 取得できませんでした",
      `推定容量: ${formatBytes(byteSize)}`
    ].join("\n");
  }

  const panel = document.getElementById("imageInfoPanel");
  if (!panel.classList.contains("hidden")) {
    panel.textContent = currentDetailImageInfoText;
  }
}

function toggleImageInfoPanel() {
  const panel = document.getElementById("imageInfoPanel");
  const button = document.getElementById("toggleImageInfoButton");

  const willShow = panel.classList.contains("hidden");

  if (willShow) {
    panel.textContent = currentDetailImageInfoText || "画像情報を取得中です";
    panel.classList.remove("hidden");
    button.textContent = "閉じる";
  } else {
    panel.classList.add("hidden");
    button.textContent = "画像情報";
  }

  resetAutoLockTimer();
}

function getMimeTypeFromDataUrl(dataUrl) {
  const match = String(dataUrl || "").match(/^data:([^;]+);base64,/);
  return match ? match[1] : "";
}

function getByteSizeFromDataUrl(dataUrl) {
  const base64 = String(dataUrl || "").split(",")[1] || "";
  const padding = (base64.match(/=+$/) || [""])[0].length;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

function getImageDimensions(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight
      });
    };

    image.onerror = reject;
    image.src = dataUrl;
  });
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "不明";

  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
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

  refreshArchiveView();
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
    "JSON Exportには画像本体が含まれます。\n\nPrivate画像も含めてExportしますか？\n\nOK: 全件Export\nキャンセル: Private画像を除外してExport"
  );

  const exportItems = includeNsfw
    ? archiveItems
    : archiveItems.filter((item) => !item.isNsfw);

  const payload = {
    appName: "Archive",
    version: APP_VERSION,
    exportDate: new Date().toISOString(),
    includePrivate: includeNsfw,
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