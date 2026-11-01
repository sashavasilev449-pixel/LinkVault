/* Работа с локальным хранилищем LinkVault */
const STORAGE_KEYS = { links: "linkvault_links_v1", categories: "linkvault_categories_v1" };
const DEFAULT_CATEGORIES = ["Обучение", "Работа", "Игры", "Развлечения", "Инструменты", "Другое"];

const Storage = {
  read(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch (error) {
      console.error("Не удалось прочитать данные:", error);
      return fallback;
    }
  },
  write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error("Не удалось сохранить данные:", error);
      return false;
    }
  },
  getLinks() { return this.read(STORAGE_KEYS.links, []); },
  saveLinks(links) { return this.write(STORAGE_KEYS.links, links); },
  getCategories() { return this.read(STORAGE_KEYS.categories, DEFAULT_CATEGORIES); },
  saveCategories(categories) { return this.write(STORAGE_KEYS.categories, categories); }
};
