import React, { useEffect, useState } from "react";
import { Bold, Italic, Underline, Code, Ban } from "lucide-react";

const HIGHLIGHTS = [
  { color: "#fef08a", name: "Jaune" },
  { color: "#bbf7d0", name: "Vert" },
  { color: "#bfdbfe", name: "Bleu" },
  { color: "#fbcfe8", name: "Rose" },
  { color: "#fed7aa", name: "Orange" },
];

function editableFromSelection() {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const node = sel.anchorNode;
  const el = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  return el?.closest?.("[data-rich]") || null;
}

// Applique une commande native puis resynchronise le bloc avec le store
// via son handler onInput React.
function exec(cmd, value = null) {
  const el = editableFromSelection();
  document.execCommand("styleWithCSS", false, true);
  document.execCommand(cmd, false, value);
  el?.dispatchEvent(new InputEvent("input", { bubbles: true }));
}

// L'ancêtre <code> de la sélection, borné au bloc éditable
function codeAncestorOf(node) {
  let n = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  while (n && !(n.nodeType === 1 && n.hasAttribute("data-rich"))) {
    if (n.nodeType === 1 && n.tagName === "CODE") return n;
    n = n.parentElement;
  }
  return null;
}

// Bascule le format « code » (pas de execCommand natif pour ça) :
// sélection dans un <code> → on le déballe entièrement ; sinon la sélection
// est enveloppée dans un <code> (stylé par [data-rich] code, cf. index.css).
function toggleCode() {
  const el = editableFromSelection();
  if (!el) return;
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  const inCode = codeAncestorOf(range.startContainer);
  if (inCode) {
    const parent = inCode.parentNode;
    while (inCode.firstChild) parent.insertBefore(inCode.firstChild, inCode);
    parent.removeChild(inCode);
    parent.normalize?.();
  } else {
    if (sel.isCollapsed) return; // rien à envelopper
    const code = document.createElement("code");
    code.appendChild(range.extractContents());
    // pas de code imbriqué
    code.querySelectorAll("code").forEach((c) => {
      while (c.firstChild) c.parentNode.insertBefore(c.firstChild, c);
      c.remove();
    });
    range.insertNode(code);
    const r = document.createRange();
    r.selectNodeContents(code);
    sel.removeAllRanges();
    sel.addRange(r);
  }
  el.dispatchEvent(new InputEvent("input", { bubbles: true }));
}

export default function FloatingToolbar() {
  const [pos, setPos] = useState(null);

  useEffect(() => {
    const onSelChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount || !editableFromSelection()) {
        setPos(null);
        return;
      }
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      if (!rect.width && !rect.height) {
        setPos(null);
        return;
      }
      setPos({
        x: Math.min(Math.max(rect.left + rect.width / 2, 160), window.innerWidth - 160),
        y: Math.max(rect.top, 60),
      });
    };
    document.addEventListener("selectionchange", onSelChange);
    return () => document.removeEventListener("selectionchange", onSelChange);
  }, []);

  // Raccourcis de mise en forme (⌘ sur Mac, Ctrl ailleurs) : B gras, I italique,
  // S souligné, U code. On intercepte AVANT l'action native (⌘U soulignerait,
  // ⌘S proposerait d'enregistrer) et on passe par les mêmes chemins que la barre.
  useEffect(() => {
    const onKeyDown = (e) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      const k = e.key.toLowerCase();
      if (!["b", "i", "s", "u"].includes(k)) return;
      const el = editableFromSelection();
      if (!el) {
        if (k === "s") e.preventDefault(); // jamais de dialogue « Enregistrer »
        return;
      }
      e.preventDefault();
      if (k === "b") exec("bold");
      else if (k === "i") exec("italic");
      else if (k === "s") exec("underline");
      else toggleCode();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  if (!pos) return null;

  const stop = (e) => e.preventDefault(); // garde la sélection active

  return (
    <div
      className="fixed z-50 flex items-center gap-0.5 bg-card border border-line rounded-lg shadow-xl shadow-black/10 dark:shadow-black/40 px-1 py-1"
      style={{ left: pos.x, top: pos.y - 8, transform: "translate(-50%, -100%)" }}
      onMouseDown={stop}
    >
      <button className="icon-btn w-7 h-7" title="Gras (⌘B)" onClick={() => exec("bold")}>
        <Bold size={15} />
      </button>
      <button className="icon-btn w-7 h-7" title="Italique (⌘I)" onClick={() => exec("italic")}>
        <Italic size={15} />
      </button>
      <button className="icon-btn w-7 h-7" title="Souligné (⌘S)" onClick={() => exec("underline")}>
        <Underline size={15} />
      </button>
      <button className="icon-btn w-7 h-7" title="Code (⌘U)" onClick={toggleCode}>
        <Code size={15} />
      </button>
      <span className="w-px h-5 bg-line mx-1" />
      {HIGHLIGHTS.map((h) => (
        <button
          key={h.color}
          className="w-6 h-6 rounded flex items-center justify-center hover:bg-hover"
          title={`Surligner en ${h.name.toLowerCase()}`}
          onClick={() => exec("hiliteColor", h.color)}
        >
          <span
            className="w-4 h-4 rounded-sm border border-black/10"
            style={{ backgroundColor: h.color }}
          />
        </button>
      ))}
      <button
        className="icon-btn w-7 h-7"
        title="Retirer le surlignage"
        onClick={() => exec("hiliteColor", "transparent")}
      >
        <Ban size={14} />
      </button>
    </div>
  );
}
