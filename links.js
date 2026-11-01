/* Операции над ссылками и безопасная проверка URL */
const Links = {
  normalizeUrl(value) {
    const raw = value.trim();
    const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const parsed = new URL(candidate);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Разрешены только адреса http и https.");
    if (!parsed.hostname.includes(".") && parsed.hostname !== "localhost") throw new Error("Проверь адрес сайта.");
    return parsed.href;
  },
  domain(url) {
    try { return new URL(url).hostname.replace(/^www\./, ""); }
    catch { return url; }
  },
  create(data) {
    return {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      title: data.title.trim(),
      url: this.normalizeUrl(data.url),
      description: (data.description || "").trim(),
      category: data.category || "Другое",
      favorite: false,
      createdAt: new Date().toISOString()
    };
  },
  search(links, query) {
    const q = query.trim().toLowerCase();
    if (!q) return links;
    return links.filter(link => [link.title, link.url, link.description, link.category].some(value => (value || "").toLowerCase().includes(q)));
  },
  sort(links, mode) {
    const copy = [...links];
    if (mode === "oldest") return copy.sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
    if (mode === "az") return copy.sort((a,b) => a.title.localeCompare(b.title, "ru"));
    if (mode === "za") return copy.sort((a,b) => b.title.localeCompare(a.title, "ru"));
    return copy.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
};
