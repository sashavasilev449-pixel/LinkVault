/* Небольшие вспомогательные функции отображения */
const SearchUI = {
  escape(value = "") {
    return String(value).replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[char]));
  },
  date(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("ru-RU", { day:"numeric", month:"short" }).format(date).replace(".", "");
  },
  favicon(url) {
    const domain = Links.domain(url);
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
  }
};
