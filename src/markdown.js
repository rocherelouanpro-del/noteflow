// Interprétation du Markdown collé (façon Notion) : titres, puces, listes
// numérotées, citations, gras/italique, code, liens et tableaux → blocs Noteflow.
// Le HTML éventuel est toujours échappé : du code collé reste du texte.

import { uid, newBlock, escapeHtml } from "./utils";

// Ne garde que les URL sûres (http/https/mailto, ancre, relatif, domaine nu) ;
// sinon renvoie null (le lien devient alors du texte simple).
function safeHref(url) {
  if (/^(https?:|mailto:)/i.test(url)) return url;
  if (/^[#/]/.test(url)) return url;
  if (/^[\w.-]+\.[a-z]{2,}(?:[/?#].*)?$/i.test(url)) return "https://" + url;
  return null;
}

// Formatage en ligne : code `x`, liens [txt](url), gras **/__ puis italique */_.
// Le code et les liens sont d'abord mis de côté (placeholder NUL·index·NUL, le
// caractère NUL étant absent d'un texte collé) pour épargner leur contenu au gras/italique.
const NUL = String.fromCharCode(0);
const RESTORE = new RegExp(NUL + "(\\d+)" + NUL, "g");

export function mdInline(text) {
  let s = escapeHtml(text);
  const stash = [];
  const keep = (html) => NUL + (stash.push(html) - 1) + NUL;

  // code en ligne `x` : contenu jamais reformaté
  s = s.replace(/`([^`\n]+)`/g, (_, c) => keep(`<code>${c}</code>`));
  // liens [texte](url) — l'URL a déjà été échappée par escapeHtml
  s = s.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (_, label, url) => {
    const href = safeHref(url);
    return href ? keep(`<a href="${href}">${label}</a>`) : label;
  });

  s = s.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  s = s.replace(/__(.+?)__/g, "<b>$1</b>");
  s = s.replace(/\*([^*\n]+)\*/g, "<i>$1</i>");
  // _italique_ : bornes hors mot, pour épargner les snake_case
  s = s.replace(/(^|[^\w])_([^_\n]+)_(?=[^\w]|$)/g, "$1<i>$2</i>");

  return s.replace(RESTORE, (_, i) => stash[Number(i)]); // restauration
}

const TABLE_SEP = /^\s*\|?[\s:|-]+\|?\s*$/; // ligne |---|:---:|--- sous l'en-tête
const HR = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;

function splitCells(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

// Découpe un texte Markdown en descripteurs de blocs :
// { kind: "heading", level, html } | { kind: "bullet", html }
// { kind: "paragraph", html } | { kind: "table", columns, rows }
export function parseMarkdown(text) {
  const lines = text.split(/\r?\n/);
  const out = [];
  let inCode = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      inCode = !inCode; // les clôtures ``` sont ignorées
      continue;
    }
    if (inCode) {
      out.push({ kind: "paragraph", html: escapeHtml(line) }); // contenu verbatim
      continue;
    }
    if (!line.trim()) continue; // ligne vide = séparateur de blocs
    if (HR.test(line)) continue; // filet horizontal : pas d'équivalent

    // tableau : ligne à « | » suivie d'une séparatrice (sinon simple texte)
    if (
      line.includes("|") &&
      i + 1 < lines.length &&
      lines[i + 1].includes("-") &&
      TABLE_SEP.test(lines[i + 1])
    ) {
      const columns = splitCells(line);
      const rows = [];
      let j = i + 2;
      while (j < lines.length && lines[j].trim() && lines[j].includes("|")) {
        rows.push(splitCells(lines[j]));
        j++;
      }
      out.push({ kind: "table", columns, rows });
      i = j - 1;
      continue;
    }

    let m;
    if ((m = line.match(/^(#{1,6})\s+(.*)$/))) {
      out.push({ kind: "heading", level: Math.min(m[1].length, 3), html: mdInline(m[2]) });
    } else if ((m = line.match(/^\s*[-*+]\s+(.*)$/))) {
      out.push({ kind: "bullet", html: mdInline(m[1]) });
    } else if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
      out.push({ kind: "bullet", html: mdInline(m[1]) }); // pas de liste numérotée : → puce
    } else if ((m = line.match(/^\s*(?:>\s?)+(.*)$/))) {
      out.push({ kind: "paragraph", html: mdInline(m[1]) }); // citation → texte simple
    } else {
      out.push({ kind: "paragraph", html: mdInline(line) });
    }
  }
  return out;
}

// Fabrique les vrais blocs Noteflow depuis les descripteurs
export function mdToBlocks(items) {
  return items.map((it) => {
    if (it.kind === "heading") return newBlock(`heading${it.level}`, { html: it.html });
    if (it.kind === "bullet") return newBlock("bullet", { html: it.html });
    if (it.kind === "table") {
      const columns = it.columns.map((name) => ({ id: uid(), name, type: "text" }));
      const rows = it.rows.map((cells) => ({
        id: uid(),
        cells: Object.fromEntries(columns.map((c, k) => [c.id, cells[k] ?? ""])),
      }));
      return { id: uid(), type: "table", columns, rows, sort: null };
    }
    return newBlock("paragraph", { html: it.html });
  });
}
