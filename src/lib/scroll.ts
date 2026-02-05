// header yüksekliğine göre offset’li, yumuşak scroll
export function scrollToId(id: string, headerPx = 64, extra = 0) {
  const el = document.getElementById(id);
  if (!el) return;

  const rect = el.getBoundingClientRect();
  const top = window.scrollY + rect.top - (headerPx + extra);

  window.scrollTo({ top, behavior: "smooth" });
}
