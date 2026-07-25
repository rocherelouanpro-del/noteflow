export function uid() {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}

// ---- Dates (clés locales YYYY-MM-DD) ----

export function dateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function keyToDate(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key, n) {
  const d = keyToDate(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

const frFmt = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

export function formatDateFr(key) {
  return frFmt.format(keyToDate(key));
}

// Tous les jours de start à aujourd'hui inclus, du plus récent au plus ancien
export function daysSince(startKey) {
  const today = dateKey();
  const days = [];
  let k = startKey <= today ? startKey : today;
  while (k <= today) {
    days.push(k);
    k = addDays(k, 1);
  }
  return days.reverse();
}

// Couleur continue rouge (0%) -> vert (100%).
// Teinte pleine + fond en alpha : lisible en clair comme en sombre.
export function pctColor(pct) {
  return `hsl(${Math.round(pct * 1.2)}, 70%, 48%)`;
}

export function pctBgColor(pct) {
  return `hsla(${Math.round(pct * 1.2)}, 70%, 48%, 0.14)`;
}

// ---- Blocs ----

export const MAX_COLUMNS = 5;

export function newBlock(type = "paragraph", extra = {}) {
  const base = { id: uid(), type, html: "" };
  // h : niveau de titre d'un toggle (0 = liste dépliante simple, 1-3 = titre dépliant)
  if (type === "toggle") return { ...base, open: true, children: [], h: 0, ...extra };
  if (type === "table") return { id: uid(), type: "table", ...newTableData(), ...extra };
  if (type === "page") return { id: uid(), type: "page", pageId: extra.pageId };
  if (type === "columns") {
    const count = Math.min(Math.max(extra.count || 2, 2), MAX_COLUMNS);
    return {
      id: uid(),
      type: "columns",
      columns: Array.from({ length: count }, () => ({
        id: uid(),
        blocks: [newBlock("paragraph")],
      })),
    };
  }
  return { ...base, ...extra };
}

// Couleurs d'étiquettes : fond saturé, écriture TOUJOURS blanche.
// Chaque fond a un contraste ≥ 4,5:1 avec le blanc (WCAG AA) — vérifié.
export const TAG_TEXT = "#ffffff";

export const TAG_PALETTE = [
  { name: "Rouge", bg: "#dc2626", text: TAG_TEXT },
  { name: "Orange", bg: "#c2410c", text: TAG_TEXT },
  { name: "Ambre", bg: "#a16207", text: TAG_TEXT },
  { name: "Vert", bg: "#15803d", text: TAG_TEXT },
  { name: "Bleu", bg: "#2563eb", text: TAG_TEXT },
  { name: "Violet", bg: "#7c3aed", text: TAG_TEXT },
  { name: "Rose", bg: "#db2777", text: TAG_TEXT },
  { name: "Gris", bg: "#64748b", text: TAG_TEXT },
];

// Ancienne palette pastel (fond clair + écriture foncée), même ordre de teintes
// que la nouvelle : sert à convertir À L'AFFICHAGE les étiquettes déjà créées,
// sans réécrire les données de l'utilisateur.
const LEGACY_TAG_BG = [
  "#fee2e2", "#ffedd5", "#fef9c3", "#dcfce7",
  "#dbeafe", "#ede9fe", "#fce7f3", "#e7e5e4",
];

// Renvoie la couleur d'affichage d'une étiquette : toujours du blanc sur un
// fond de la palette. Une couleur pastel héritée est remontée sur la teinte
// correspondante ; une couleur inconnue retombe sur le gris.
export function tagColor(color) {
  if (!color) return TAG_PALETTE[TAG_PALETTE.length - 1];
  const bg = String(color.bg || "").toLowerCase();
  const current = TAG_PALETTE.find((p) => p.bg === bg);
  if (current) return current;
  const legacy = LEGACY_TAG_BG.indexOf(bg);
  if (legacy !== -1) return TAG_PALETTE[legacy];
  return TAG_PALETTE[TAG_PALETTE.length - 1];
}

// Style inline prêt à poser sur une puce d'étiquette.
export const tagStyle = (color) => ({
  backgroundColor: tagColor(color).bg,
  color: TAG_TEXT,
});

export function newTableData() {
  return {
    columns: [
      { id: uid(), name: "Nom", type: "text" },
      { id: uid(), name: "Nombre", type: "number" },
      { id: uid(), name: "Date", type: "date" },
      { id: uid(), name: "Tags", type: "select", options: [] },
    ],
    rows: [
      { id: uid(), cells: {} },
      { id: uid(), cells: {} },
      { id: uid(), cells: {} },
    ],
    sort: null,
  };
}

export const HABIT_COLORS = [
  "#8b5cf6",
  "#f97316",
  "#0ea5e9",
  "#ec4899",
  "#10b981",
  "#eab308",
  "#ef4444",
  "#14b8a6",
];

// Image importée → data URL : conservée telle quelle si raisonnable, sinon
// réduite (côté max 1600px, JPEG) pour ne pas faire enfler le fichier de données.
export function fileToImageSrc(file, maxDim = 1600, maxRaw = 1500000) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const raw = reader.result;
      const img = new Image();
      img.onload = () => {
        if (file.size <= maxRaw && Math.max(img.width, img.height) <= maxDim) {
          resolve(raw);
          return;
        }
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = reject;
      img.src = raw;
    };
    reader.readAsDataURL(file);
  });
}

export function stripHtml(html) {
  const el = document.createElement("div");
  el.innerHTML = html || "";
  return el.textContent || "";
}

export function escapeHtml(text) {
  const el = document.createElement("div");
  el.textContent = text;
  return el.innerHTML;
}

// Texte brut d'un bloc (copie de blocs sélectionnés) : toggles indentés,
// tableaux en TSV, colonnes mises bout à bout.
export function blockToText(block, pages, indent = "") {
  if (block.type === "page") {
    return indent + (pages?.[block.pageId]?.title || "Sans titre");
  }
  if (block.type === "image") {
    return indent + `[Image${block.name ? " : " + block.name : ""}]`;
  }
  if (block.type === "file") {
    return indent + (block.name || "Fichier") + (block.path ? ` (${block.path})` : "");
  }
  if (block.type === "table") {
    const head = block.columns.map((c) => c.name).join("\t");
    const rows = block.rows.map((r) =>
      block.columns
        .map((c) => {
          const v = r.cells[c.id];
          if (Array.isArray(v)) {
            return v.map((id) => c.options?.find((o) => o.id === id)?.label || "").join(", ");
          }
          if (v && typeof v === "object" && v.t === "page") {
            return pages?.[v.pageId]?.title || "Sans titre";
          }
          return v ?? "";
        })
        .join("\t")
    );
    return [head, ...rows].map((l) => indent + l).join("\n");
  }
  if (block.type === "columns") {
    return block.columns
      .map((col) => col.blocks.map((b) => blockToText(b, pages, indent)).join("\n"))
      .join("\n");
  }
  const own = indent + (block.type === "bullet" ? "- " : "") + stripHtml(block.html || "");
  if (block.type === "toggle" && block.children?.length) {
    return [own, ...block.children.map((c) => blockToText(c, pages, indent + "  "))].join("\n");
  }
  return own;
}

// Copie dans le presse-papiers, avec repli execCommand si l'API async échoue
export function copyText(text) {
  const fallback = () => {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  };
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(fallback);
  } else {
    fallback();
  }
}

export function focusEnd(el) {
  if (!el) return;
  el.focus();
  const sel = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

export function focusStart(el) {
  if (!el) return;
  el.focus();
  const sel = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}
