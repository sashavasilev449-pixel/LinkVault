/* Основная логика интерфейса */
const state = {
  links: Storage.getLinks(),
  categories: Storage.getCategories(),
  view: "all",
  category: null,
  query: "",
  sort: "newest",
  layout: "grid"
};

const $ = id => document.getElementById(id);
const grid = $("linksGrid");
let toastTimer;

function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2400);
}
let cloudSaveQueue = Promise.resolve();
function persist() {
  if (!Storage.saveLinks(state.links)) toast("Не удалось сохранить локальную копию.");
  const client = window.LVAuth?.client;
  const user = window.LVAuth?.getUser();
  if (!client || !user) return;
  cloudSaveQueue = cloudSaveQueue.then(async () => {
    const rows = state.links.map(link => ({ id: link.id, user_id: user.id, title: link.title, url: link.url, description: link.description || "", category: link.category || "Другое", favorite: Boolean(link.favorite), created_at: link.createdAt }));
    if (rows.length) {
      const { error } = await client.from("linkvault_links").upsert(rows, { onConflict: "id" });
      if (error) throw error;
    }
    const { data: existing, error: readError } = await client.from("linkvault_links").select("id").eq("user_id", user.id);
    if (readError) throw readError;
    const keep = new Set(state.links.map(link => link.id));
    const remove = (existing || []).filter(row => !keep.has(row.id)).map(row => row.id);
    if (remove.length) {
      const { error } = await client.from("linkvault_links").delete().in("id", remove);
      if (error) throw error;
    }
    const { error: categoryError } = await client.from("user_categories").upsert({ user_id: user.id, categories: state.categories }, { onConflict: "user_id" });
    if (categoryError) throw categoryError;
  }).catch(error => { console.error("Cloud sync error:", error); toast("Не удалось синхронизировать данные. Проверь подключение."); });
}
window.loadLibraryFromCloud = async function () {
  const client = window.LVAuth?.client;
  const user = window.LVAuth?.getUser();
  if (!client || !user) return;
  const [{ data: rows, error }, { data: categoryRow, error: categoryError }] = await Promise.all([
    client.from("linkvault_links").select("id,title,url,description,category,favorite,created_at").eq("user_id", user.id).order("created_at", { ascending: false }),
    client.from("user_categories").select("categories").eq("user_id", user.id).maybeSingle()
  ]);
  if (error || categoryError) { console.error(error || categoryError); toast("Не удалось загрузить облачную библиотеку."); return; }
  const localLinks = Storage.getLinks();
  if ((!rows || rows.length === 0) && localLinks.length && confirm(`Найдено ${localLinks.length} ссылок в этом браузере. Перенести их в облако этого аккаунта?`)) {
    state.links = localLinks;
    persist();
  } else {
    state.links = (rows || []).map(row => ({ id: row.id, title: row.title, url: row.url, description: row.description, category: row.category, favorite: row.favorite, createdAt: row.created_at }));
  }
  state.categories = categoryRow?.categories?.length ? categoryRow.categories : [...DEFAULT_CATEGORIES];
  Storage.saveLinks(state.links); Storage.saveCategories(state.categories);
  render();
};
function openModal(id) {
  $(id).hidden = false;
  document.body.style.overflow = "hidden";
}
function closeModal(id) {
  $(id).hidden = true;
  document.body.style.overflow = "";
}
function refreshIcons() {
  if (window.lucide) lucide.createIcons();
}
function currentLinks() {
  let list = [...state.links];
  if (state.view === "favorites") list = list.filter(link => link.favorite);
  if (state.view === "category" && state.category) list = list.filter(link => link.category === state.category);
  list = Links.search(list, state.query);
  return Links.sort(list, state.sort);
}
function renderStats() {
  $("statTotal").textContent = state.links.length;
  $("statFavorites").textContent = state.links.filter(link => link.favorite).length;
  $("statCategories").textContent = state.categories.length;
  $("allCount").textContent = state.links.length;
  $("favoriteCount").textContent = state.links.filter(link => link.favorite).length;
}
function renderCategories() {
  $("categoryNav").innerHTML = state.categories.map(category => `
    <button class="nav-item category-nav-item ${state.view === "category" && state.category === category ? "active" : ""}" data-category="${SearchUI.escape(category)}">
      <span class="category-dot"></span><span>${SearchUI.escape(category)}</span>
      <span class="nav-count">${state.links.filter(link => link.category === category).length}</span>
    </button>`).join("");
  $("linkCategory").innerHTML = state.categories.map(category => `<option value="${SearchUI.escape(category)}">${SearchUI.escape(category)}</option>`).join("");
  $("categoryList").innerHTML = state.categories.map(category => {
    const builtIn = DEFAULT_CATEGORIES.includes(category);
    return `<div class="category-row"><span>${SearchUI.escape(category)}</span><small>${state.links.filter(link => link.category === category).length} ссылок</small>${builtIn ? "" : `<button class="category-delete" data-delete-category="${SearchUI.escape(category)}" title="Удалить категорию"><i data-lucide="trash-2"></i></button>`}</div>`;
  }).join("");
}
function renderCard(link, index) {
  const title = SearchUI.escape(link.title);
  const url = SearchUI.escape(link.url);
  const description = SearchUI.escape(link.description || "Описание не добавлено.");
  const category = SearchUI.escape(link.category || "Другое");
  const domain = SearchUI.escape(Links.domain(link.url));
  const favicon = SearchUI.escape(SearchUI.favicon(link.url));
  return `<article class="link-card" style="animation-delay:${Math.min(index * 35, 210)}ms">
    <div class="card-top">
      <div class="site-icon"><img src="${favicon}" alt="" loading="lazy" onerror="this.style.display='none';this.parentElement.textContent='${title.slice(0,1).replace(/'/g,"&#39;")}'"></div>
      <div class="card-title-wrap"><h3 class="card-title" title="${title}">${title}</h3><div class="card-domain">${domain}</div></div>
      <div class="card-menu">
        <button class="card-icon-btn favorite ${link.favorite ? "active" : ""}" data-favorite="${link.id}" title="${link.favorite ? "Убрать из избранного" : "В избранное"}"><i data-lucide="star"></i></button>
        <button class="card-icon-btn" data-edit="${link.id}" title="Редактировать"><i data-lucide="pencil"></i></button>
        <button class="card-icon-btn" data-delete="${link.id}" title="Удалить"><i data-lucide="trash-2"></i></button>
      </div>
    </div>
    <p class="card-description">${description}</p>
    <div class="card-bottom"><span class="category-pill">${category}</span><span class="card-date">${SearchUI.date(link.createdAt)}</span><a class="card-open" href="${url}" target="_blank" rel="noopener noreferrer">Открыть <i data-lucide="external-link"></i></a></div>
  </article>`;
}
function render() {
  renderStats();
  renderCategories();
  const list = currentLinks();
  grid.classList.toggle("list-layout", state.layout === "list");
  grid.innerHTML = list.map(renderCard).join("");
  $("resultCount").textContent = `${list.length} ${plural(list.length, "ссылка", "ссылки", "ссылок")}`;
  $("clearSearchBtn").hidden = !state.query;
  const empty = list.length === 0;
  $("emptyState").hidden = !empty;
  grid.hidden = empty;
  if (empty) {
    if (state.query) {
      $("emptyTitle").textContent = "Ничего не найдено";
      $("emptyText").textContent = "Попробуй изменить запрос или сбросить поиск.";
      $("emptyAddBtn").hidden = true;
    } else if (state.view === "favorites") {
      $("emptyTitle").textContent = "Избранное пока пусто";
      $("emptyText").textContent = "Отмечай понравившиеся ссылки звёздочкой — они появятся здесь.";
      $("emptyAddBtn").hidden = true;
    } else {
      $("emptyTitle").textContent = "Пока здесь пусто";
      $("emptyText").textContent = "Добавь первую ссылку, чтобы начать собирать свою библиотеку.";
      $("emptyAddBtn").hidden = false;
    }
  }
  const titles = state.view === "favorites" ? ["Избранное", "Ссылки, которые ты отметил."] :
    state.view === "category" ? [state.category, `Ссылки в категории «${state.category}».`] :
    ["Все ссылки", "Всё важное — в одном месте."];
  $("pageTitle").innerHTML = `${SearchUI.escape(titles[0])}<span class="title-dot">.</span>`;
  $("pageSubtitle").textContent = titles[1];
  $("breadcrumbCurrent").textContent = titles[0];
  $("listHeading").textContent = state.query ? "Результаты поиска" : state.view === "favorites" ? "Избранные ссылки" : state.view === "category" ? state.category : "Недавно добавленные";
  document.querySelectorAll(".nav-item[data-view]").forEach(button => button.classList.toggle("active", button.dataset.view === state.view));
  document.querySelectorAll(".category-nav-item").forEach(button => button.classList.toggle("active", state.view === "category" && button.dataset.category === state.category));
  document.querySelectorAll(".view-btn").forEach(button => button.classList.toggle("active", button.dataset.layout === state.layout));
  refreshIcons();
}
function plural(n, one, few, many) {
  const n10 = n % 10, n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return one;
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
  return many;
}
function resetForm() {
  $("linkForm").reset();
  $("editId").value = "";
  $("modalTitle").textContent = "Добавить ссылку";
  $("saveButtonText").textContent = "Сохранить ссылку";
}
function showAddModal() {
  resetForm();
  openModal("linkModal");
  setTimeout(() => $("linkUrl").focus(), 50);
}
function editLink(id) {
  const link = state.links.find(item => item.id === id);
  if (!link) return;
  $("editId").value = id;
  $("linkUrl").value = link.url;
  $("linkTitle").value = link.title;
  $("linkDescription").value = link.description || "";
  $("linkCategory").value = link.category;
  $("modalTitle").textContent = "Редактировать ссылку";
  $("saveButtonText").textContent = "Сохранить изменения";
  openModal("linkModal");
}
function deleteLink(id) {
  const link = state.links.find(item => item.id === id);
  if (!link || !confirm(`Удалить ссылку «${link.title}»?`)) return;
  state.links = state.links.filter(item => item.id !== id);
  persist(); render(); toast("Ссылка удалена");
}
function exportLibrary() {
  const payload = { app: "LinkVault", version: 1, exportedAt: new Date().toISOString(), categories: state.categories, links: state.links };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = `linkvault-backup-${new Date().toISOString().slice(0,10)}.json`; a.click();
  URL.revokeObjectURL(url); toast("Резервная копия подготовлена");
}
function importLibrary(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data || !Array.isArray(data.links)) throw new Error("Неверный формат файла");
      const imported = data.links.map(item => {
        const url = Links.normalizeUrl(item.url);
        return { id: (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`), title: String(item.title || Links.domain(url)).slice(0,80), url, description: String(item.description || "").slice(0,220), category: state.categories.includes(item.category) ? item.category : "Другое", favorite: Boolean(item.favorite), createdAt: item.createdAt || new Date().toISOString() };
      });
      if (!confirm(`Импортировать ${imported.length} ссылок? Текущая библиотека будет заменена.`)) return;
      state.links = imported;
      if (Array.isArray(data.categories)) state.categories = [...new Set([...DEFAULT_CATEGORIES, ...data.categories.map(String).filter(x => x.length <= 24)])];
      Storage.saveCategories(state.categories); persist(); render(); toast("Библиотека импортирована");
    } catch (error) { alert("Не удалось импортировать файл: " + error.message); }
    $("importFile").value = "";
  };
  reader.readAsText(file);
}

$("addLinkBtn").addEventListener("click", showAddModal);
$("addLinkBtnTop").addEventListener("click", showAddModal);
$("emptyAddBtn").addEventListener("click", showAddModal);
$("linkForm").addEventListener("submit", event => {
  event.preventDefault();
  try {
    const data = { url: $("linkUrl").value, title: $("linkTitle").value, description: $("linkDescription").value, category: $("linkCategory").value };
    const editId = $("editId").value;
    if (editId) {
      const old = state.links.find(item => item.id === editId);
      if (!old) return;
      const updated = Links.create(data);
      Object.assign(old, data, { url: updated.url, createdAt: old.createdAt });
      toast("Изменения сохранены");
    } else {
      state.links.unshift(Links.create(data));
      toast("Ссылка добавлена в библиотеку");
    }
    persist(); closeModal("linkModal"); resetForm(); render();
  } catch (error) { toast(error.message || "Проверь введённые данные"); }
});
grid.addEventListener("click", event => {
  const favorite = event.target.closest("[data-favorite]");
  const edit = event.target.closest("[data-edit]");
  const remove = event.target.closest("[data-delete]");
  if (favorite) {
    const link = state.links.find(item => item.id === favorite.dataset.favorite);
    if (link) { link.favorite = !link.favorite; persist(); render(); toast(link.favorite ? "Добавлено в избранное" : "Убрано из избранного"); }
  } else if (edit) editLink(edit.dataset.edit);
  else if (remove) deleteLink(remove.dataset.delete);
});
document.querySelectorAll("[data-close]").forEach(button => button.addEventListener("click", () => closeModal(button.dataset.close)));
document.querySelectorAll(".modal-backdrop").forEach(backdrop => backdrop.addEventListener("click", event => { if (event.target === backdrop) closeModal(backdrop.id); }));
document.addEventListener("keydown", event => {
  if (event.key === "Escape") document.querySelectorAll(".modal-backdrop:not([hidden])").forEach(modal => closeModal(modal.id));
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); $("searchInput").focus(); }
});
$("searchInput").addEventListener("input", event => { state.query = event.target.value; render(); });
$("sortSelect").addEventListener("change", event => { state.sort = event.target.value; render(); });
$("clearSearchBtn").addEventListener("click", () => { state.query = ""; $("searchInput").value = ""; render(); });
document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => { state.view = button.dataset.view; state.category = null; render(); }));
$("categoryNav").addEventListener("click", event => {
  const button = event.target.closest("[data-category]");
  if (button) { state.view = "category"; state.category = button.dataset.category; render(); }
});
document.querySelectorAll("[data-layout]").forEach(button => button.addEventListener("click", () => { state.layout = button.dataset.layout; render(); }));
$("manageCategoriesBtn").addEventListener("click", () => { renderCategories(); openModal("categoryModal"); refreshIcons(); });
$("categoryForm").addEventListener("submit", event => {
  event.preventDefault();
  const name = $("newCategory").value.trim();
  if (!name) return;
  if (state.categories.some(item => item.toLowerCase() === name.toLowerCase())) { toast("Такая категория уже существует"); return; }
  if (name.length > 24) { toast("Максимум 24 символа"); return; }
  state.categories.push(name); Storage.saveCategories(state.categories); persist(); $("newCategory").value = ""; render(); toast("Категория создана");
});
$("categoryList").addEventListener("click", event => {
  const button = event.target.closest("[data-delete-category]");
  if (!button) return;
  const name = button.dataset.deleteCategory;
  if (!confirm(`Удалить категорию «${name}»? Ссылки переместятся в «Другое».`)) return;
  state.categories = state.categories.filter(item => item !== name);
  state.links.forEach(link => { if (link.category === name) link.category = "Другое"; });
  if (state.category === name) { state.view = "all"; state.category = null; }
  Storage.saveCategories(state.categories); persist(); render(); renderCategories(); toast("Категория удалена");
});
$("exportBtn").addEventListener("click", exportLibrary);
$("importBtn").addEventListener("click", () => $("importFile").click());
$("importFile").addEventListener("change", event => { if (event.target.files[0]) importLibrary(event.target.files[0]); });
$("menuBtn").addEventListener("click", () => $("sidebar").classList.toggle("open"));
document.addEventListener("click", event => {
  if (window.innerWidth <= 850 && $("sidebar").classList.contains("open") && !event.target.closest("#sidebar") && !event.target.closest("#menuBtn")) $("sidebar").classList.remove("open");
});
$("dateLabel").textContent = new Intl.DateTimeFormat("ru-RU", { weekday:"long", day:"numeric", month:"long" }).format(new Date()).toUpperCase();
render();

// Выбор цветовой темы с сохранением
(()=>{const b=document.getElementById('themeToggle');if(!b)return;const valid=['purple','teal','orange','red'];const set=t=>{const theme=valid.includes(t)?t:'purple';document.body.dataset.theme=theme;b.value=theme;localStorage.setItem('linkvault_theme',theme)};set(localStorage.getItem('linkvault_theme')||'red');b.addEventListener('change',()=>set(b.value));})();
