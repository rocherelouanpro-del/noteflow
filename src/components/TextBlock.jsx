import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { uid, newBlock, stripHtml, focusEnd, fileToImageSrc } from "../utils";
import { parseMarkdown, mdToBlocks } from "../markdown";
import { handleArrowNav } from "../keynav";
import SlashMenu, { filterSlashItems } from "./SlashMenu";
import EmojiPicker from "./EmojiPicker";
import PagePicker from "./PagePicker";

const TYPE_CLASS = {
  paragraph: "block-p",
  bullet: "block-bullet",
  heading1: "block-h1",
  heading2: "block-h2",
  heading3: "block-h3",
};

const TYPE_PLACEHOLDER = {
  paragraph: "Écrivez, ou tapez « / » pour les commandes…",
  bullet: "Liste",
  heading1: "Titre 1",
  heading2: "Titre 2",
  heading3: "Titre 3",
};

// classe + placeholder d'un toggle selon son niveau de titre (block.h)
function toggleClass(block) {
  return block.h ? `block-h${block.h}` : "block-p font-medium";
}
function togglePlaceholder(block) {
  return block.h ? `Titre ${block.h} dépliant` : "Liste dépliante";
}

const TRANSFORM_IDS = [
  "text",
  "bullet",
  "heading1",
  "heading2",
  "heading3",
  "toggle",
  "toggle-h1",
  "toggle-h2",
  "toggle-h3",
];

// Position du caret en caractères depuis le début du bloc (-1 si sélection non simple)
function caretTextOffset(root) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount || !sel.isCollapsed) return -1;
  const r = sel.getRangeAt(0);
  if (!root.contains(r.startContainer)) return -1;
  const probe = document.createRange();
  probe.selectNodeContents(root);
  probe.setEnd(r.startContainer, r.startOffset);
  return probe.toString().length;
}

// Supprime le "/query" tapé avant d'appliquer une commande slash.
// On travaille sur le DOM du bloc (pas sur la sélection, qui peut être perdue).
function deleteSlashText(root, query) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (let i = nodes.length - 1; i >= 0; i--) {
    const idx = nodes[i].data.lastIndexOf("/");
    if (idx === -1) continue;
    const range = document.createRange();
    range.setStart(nodes[i], idx);
    let remaining = query.length + 1;
    let n = i;
    let start = idx;
    while (n < nodes.length) {
      const take = Math.min(remaining, nodes[n].data.length - start);
      remaining -= take;
      if (remaining === 0) {
        range.setEnd(nodes[n], start + take);
        break;
      }
      n++;
      start = 0;
    }
    if (remaining > 0) range.setEndAfter(nodes[nodes.length - 1]);
    range.deleteContents();
    return;
  }
}

export default function TextBlock({ page, parentBlockId, parentType, block, prevId }) {
  const {
    state,
    updateBlock,
    transformBlock,
    insertBlockAfter,
    removeBlock,
    replaceBlock,
    createPage,
    setView,
    focusId,
    setFocusId,
  } = useStore();

  const ref = useRef(null);
  const [menu, setMenu] = useState(null); // { x, y, query }
  const [selIdx, setSelIdx] = useState(0);
  const [emojiPicker, setEmojiPicker] = useState(null); // { x, y } — insertion via /emoji
  const [pagePicker, setPagePicker] = useState(null); // { x, y } — lien vers une page existante
  const emojiRangeRef = useRef(null); // caret mémorisé pour réinsérer l'emoji
  const imageInputRef = useRef(null); // input caché pour /image

  // Insère un bloc « autonome » (image, fichier…) : remplace le bloc vide,
  // sinon s'insère juste après (même règle que les tableaux).
  const insertStandalone = (nb) => {
    if (!stripHtml(ref.current?.innerHTML || "").trim()) {
      replaceBlock(page.id, parentBlockId, block.id, nb);
    } else {
      insertBlockAfter(page.id, parentBlockId, block.id, nb);
    }
  };

  const onImageFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const src = await fileToImageSrc(file);
      insertStandalone({ id: uid(), type: "image", src, name: file.name });
    } catch {
      /* image illisible : on ignore */
    }
  };

  // Lien vers un fichier local : nécessite le vrai chemin → dialogue natif (app).
  const pickFile = async () => {
    if (!window.__TAURI_INTERNALS__) {
      window.alert("L'ajout de fichiers est disponible dans l'application Noteflow.");
      return;
    }
    const { open } = await import("@tauri-apps/plugin-dialog");
    const path = await open({ multiple: false, directory: false, title: "Choisir un fichier" });
    if (!path) return;
    const name = String(path).split("/").pop();
    insertStandalone({ id: uid(), type: "file", path: String(path), name });
  };
  // parentType restreint le menu : "toggle" → sous-ensemble, "column" → pas de colonnes
  const items = menu ? filterSlashItems(menu.query, parentType) : [];

  // Le HTML n'est JAMAIS rendu par React (pas de dangerouslySetInnerHTML) :
  // React réassignerait innerHTML à chaque frappe et le caret sauterait au
  // début du bloc (texte tapé à l'envers). On ne touche au DOM que si l'état
  // diffère réellement de son contenu (montage initial, changement externe).
  useLayoutEffect(() => {
    if (ref.current && ref.current.innerHTML !== (block.html || "")) {
      ref.current.innerHTML = block.html || "";
    }
  });

  // Focus demandé par le store (bloc créé / transformé)
  useEffect(() => {
    if (focusId === block.id && ref.current) {
      focusEnd(ref.current);
      setFocusId(null);
    }
  }, [focusId, block.id, setFocusId]);

  const commit = () => {
    updateBlock(page.id, parentBlockId, block.id, { html: ref.current.innerHTML });
  };

  const openMenu = () => {
    const sel = window.getSelection();
    let rect = null;
    if (sel && sel.rangeCount) rect = sel.getRangeAt(0).getBoundingClientRect();
    if (!rect || (!rect.x && !rect.y)) rect = ref.current.getBoundingClientRect();
    setMenu({ x: rect.left, y: rect.bottom + 6, query: "" });
    setSelIdx(0);
  };

  const applySlash = (item) => {
    deleteSlashText(ref.current, menu.query);
    commit();
    setMenu(null);
    const html = ref.current.innerHTML;
    const isEmpty = !stripHtml(html).trim();

    if (TRANSFORM_IDS.includes(item.id)) {
      const type = item.id === "text" ? "paragraph" : item.id;
      transformBlock(page.id, parentBlockId, block.id, type);
      setFocusId(block.id);
    } else if (item.id === "table") {
      const tb = newBlock("table");
      if (isEmpty) replaceBlock(page.id, parentBlockId, block.id, tb);
      else insertBlockAfter(page.id, parentBlockId, block.id, tb);
    } else if (item.id.startsWith("columns")) {
      const cb = newBlock("columns", { count: Number(item.id.slice("columns".length)) });
      if (isEmpty) replaceBlock(page.id, parentBlockId, block.id, cb);
      else insertBlockAfter(page.id, parentBlockId, block.id, cb);
      setFocusId(cb.columns[0].blocks[0].id);
    } else if (item.id === "page") {
      // le texte restant dans le bloc sert de titre à la nouvelle page
      const title = stripHtml(html).trim();
      const pid = createPage(page.id, title);
      const pb = { id: uid(), type: "page", pageId: pid };
      replaceBlock(page.id, parentBlockId, block.id, pb);
      setView({ type: "page", id: pid });
    } else if (item.id === "linkpage") {
      // Lien vers une page DÉJÀ existante : la même page peut ainsi apparaître
      // à plusieurs endroits. On n'écrit RIEN dans la page cible (son parentId
      // et sa place dans l'arborescence restent inchangés) — c'est une référence.
      const sel = window.getSelection();
      let rect = sel && sel.rangeCount ? sel.getRangeAt(0).getBoundingClientRect() : null;
      if (!rect || (!rect.x && !rect.y)) rect = ref.current.getBoundingClientRect();
      setPagePicker({ x: rect.left, y: rect.bottom + 6 });
    } else if (item.id === "image") {
      imageInputRef.current?.click();
    } else if (item.id === "file") {
      pickFile();
    } else if (item.id === "emoji") {
      // le « /emoji » a déjà été retiré : on mémorise le caret et on ouvre le sélecteur
      const sel = window.getSelection();
      emojiRangeRef.current = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
      let rect = emojiRangeRef.current ? emojiRangeRef.current.getBoundingClientRect() : null;
      if (!rect || (!rect.x && !rect.y)) rect = ref.current.getBoundingClientRect();
      setEmojiPicker({ x: rect.left, y: rect.bottom + 6 });
    }
  };

  // Insère l'emoji choisi à la position mémorisée, puis referme le sélecteur
  const insertEmoji = (emoji) => {
    setEmojiPicker(null);
    const el = ref.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (emojiRangeRef.current) {
      sel.removeAllRanges();
      sel.addRange(emojiRangeRef.current);
    }
    document.execCommand("insertText", false, emoji);
    emojiRangeRef.current = null;
    commit();
  };

  const onInput = () => {
    if (menu) {
      const text = ref.current.textContent || "";
      const i = text.lastIndexOf("/");
      if (i === -1) setMenu(null);
      else {
        setMenu((m) => ({ ...m, query: text.slice(i + 1) }));
        setSelIdx(0);
      }
    }
    commit();
  };

  const onKeyDown = (e) => {
    if (menu) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelIdx((i) => Math.min(i + 1, items.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelIdx((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" && items.length > 0) {
        e.preventDefault();
        applySlash(items[Math.min(selIdx, items.length - 1)]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMenu(null);
        return;
      }
    }

    // navigation entre blocs aux flèches (menu fermé uniquement)
    if (!menu && handleArrowNav(e, ref.current)) return;

    // Cmd/Ctrl+A : une fois tout le bloc sélectionné (ou s'il est vide),
    // le raccourci sélectionne tous les blocs de la page (comme Notion)
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
      const len = (ref.current.textContent || "").length;
      const sel = window.getSelection();
      if (!len || (sel && sel.toString().length >= len)) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("nf-select-all"));
      }
      return;
    }

    // « - » (ou « * ») suivi d'un espace en tête de bloc → liste à puces (comme Notion).
    // Le tiret est retiré du DOM ; le caret ne bouge pas (le div n'est pas remonté).
    if (e.key === " " && !menu && block.type === "paragraph") {
      const t = ref.current.textContent || "";
      if ((t[0] === "-" || t[0] === "*") && caretTextOffset(ref.current) === 1) {
        e.preventDefault();
        const walker = document.createTreeWalker(ref.current, NodeFilter.SHOW_TEXT);
        const first = walker.nextNode();
        if (first) {
          const del = document.createRange();
          del.setStart(first, 0);
          del.setEnd(first, 1);
          del.deleteContents();
        }
        commit();
        transformBlock(page.id, parentBlockId, block.id, "bullet");
        return;
      }
    }

    if (e.key === "/") {
      // le caractère s'insère normalement, on ouvre le menu juste après
      requestAnimationFrame(openMenu);
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      // puce vide + Entrée : on sort de la liste (comme Notion)
      if (block.type === "bullet" && !(ref.current.textContent || "").length) {
        transformBlock(page.id, parentBlockId, block.id, "paragraph");
        setFocusId(block.id);
        return;
      }
      // dans une liste, Entrée enchaîne une nouvelle puce
      const nb = newBlock(block.type === "bullet" ? "bullet" : "paragraph");
      insertBlockAfter(page.id, parentBlockId, block.id, nb);
      setFocusId(nb.id);
      return;
    }

    if (e.key === "Backspace" && !(ref.current.textContent || "").length) {
      e.preventDefault();
      if (block.type !== "paragraph") {
        // un titre / toggle vide redevient un paragraphe
        transformBlock(page.id, parentBlockId, block.id, "paragraph");
        setFocusId(block.id);
      } else {
        removeBlock(page.id, parentBlockId, block.id);
        if (prevId) setFocusId(prevId);
      }
    }
  };

  // Collage : le Markdown est interprété (titres #, puces -, gras/italique,
  // listes numérotées, citations, tableaux) et produit les bons blocs, comme
  // sur Notion. Dans une liste à puces, les lignes simples restent des puces.
  const onPaste = (e) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    if (!["paragraph", "bullet", "heading1", "heading2", "heading3"].includes(block.type)) {
      document.execCommand("insertText", false, text);
      return;
    }
    let items = parseMarkdown(text);
    if (block.type === "bullet") {
      items = items.map((it) => (it.kind === "paragraph" ? { ...it, kind: "bullet" } : it));
    }
    if (!items.length) return;

    const empty = !stripHtml(ref.current.innerHTML).trim();
    // nature « fusionnable » dans le bloc courant : même famille que lui
    const mergeKind = block.type === "bullet" ? "bullet" : "paragraph";

    // une seule ligne dans un bloc non vide : insertion au caret
    if (items.length === 1 && items[0].kind !== "table" && !empty) {
      if (items[0].kind === mergeKind) {
        document.execCommand("insertHTML", false, items[0].html); // gras/italique fusionnés
      } else {
        document.execCommand("insertText", false, text.trimEnd()); // titre brut : on garde les caractères
      }
      return;
    }

    const blocks = mdToBlocks(items);
    let rest = blocks;
    if (empty) {
      // le 1er bloc prend la place du bloc courant (même id, coquille stable) ;
      // s'il est de la même famille, on garde le type du bloc (un Titre vide
      // qui reçoit du texte simple reste un Titre)
      blocks[0].id = block.id;
      if (items[0].kind === mergeKind) {
        updateBlock(page.id, parentBlockId, block.id, { html: items[0].html });
      } else {
        replaceBlock(page.id, parentBlockId, block.id, blocks[0]);
      }
      rest = blocks.slice(1);
    } else if (items[0].kind === mergeKind) {
      // 1re ligne fusionnée au caret, la suite en blocs
      document.execCommand("insertHTML", false, items[0].html);
      commit();
      blocks[0].id = block.id; // pour le calcul du focus
      rest = blocks.slice(1);
    }
    let after = block.id;
    for (const nb of rest) {
      insertBlockAfter(page.id, parentBlockId, after, nb);
      after = nb.id;
    }
    const lastFocusable = [...blocks].reverse().find((b) => b.type !== "table");
    if (lastFocusable) setFocusId(lastFocusable.id);
  };

  return (
    <>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        data-rich="1"
        data-nav="1"
        className={`${
          block.type === "toggle" ? toggleClass(block) : TYPE_CLASS[block.type] || "block-p"
        } ${["paragraph", "bullet"].includes(block.type) ? "ph-focus" : "ph-always"}`}
        data-placeholder={
          block.type === "toggle" ? togglePlaceholder(block) : TYPE_PLACEHOLDER[block.type] || ""
        }
        onInput={onInput}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onBlur={() => setTimeout(() => setMenu(null), 150)}
      />
      {menu && (
        <SlashMenu pos={menu} items={items} selected={selIdx} onPick={applySlash} />
      )}
      {emojiPicker && (
        <EmojiPicker
          pos={emojiPicker}
          heading="Emoji"
          onPick={insertEmoji}
          onClose={() => setEmojiPicker(null)}
        />
      )}
      {pagePicker && (
        <PagePicker
          pos={pagePicker}
          heading="Lien vers une page existante"
          pages={Object.values(state.pages)}
          excludeId={page.id}
          onPick={(pid) => {
            setPagePicker(null);
            insertStandalone({ id: uid(), type: "page", pageId: pid });
          }}
          onClose={() => setPagePicker(null)}
        />
      )}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onImageFile}
      />
    </>
  );
}
