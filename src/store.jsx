import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { loadData, saveData } from "./storage";
import { uid, newBlock, dateKey, addDays, HABIT_COLORS, MAX_COLUMNS } from "./utils";

const StoreContext = createContext(null);

const DEFAULT_HABITS = ["Méditation", "Sport", "Travail", "Coucher sans tél", "Boire 3L"];

function defaultState() {
  const pageId = uid();
  const welcome = {
    id: pageId,
    title: "Bienvenue",
    parentId: null,
    createdAt: Date.now(),
    blocks: [
      newBlock("heading1", { html: "Bienvenue sur Noteflow 👋" }),
      newBlock("paragraph", {
        html: "Une application de notes 100% locale. Tapez <b>/</b> dans un bloc pour insérer une sous-page, une liste dépliante, un titre ou un tableau.",
      }),
      newBlock("paragraph", {
        html: "Sélectionnez du texte pour le mettre en <b>gras</b>, en <i>italique</i> ou le <span style=\"background-color:#fef08a\">surligner</span>.",
      }),
      newBlock("toggle", {
        html: "Une liste dépliante, ça ressemble à ça",
        children: [
          newBlock("paragraph", { html: "Et voici son contenu caché. Cliquez sur la flèche pour replier." }),
        ],
      }),
      newBlock("paragraph", { html: "" }),
    ],
  };
  return {
    theme: "light",
    ui: { sidebarWidth: 256, sidebarCollapsed: false },
    pages: { [pageId]: welcome },
    habits: DEFAULT_HABITS.map((name, i) => ({
      id: uid(),
      name,
      color: HABIT_COLORS[i % HABIT_COLORS.length],
      visible: true,
    })),
    habitLog: {},
    habitStart: addDays(dateKey(), -6),
  };
}

// Liste de blocs ciblée : racine de la page, enfants d'un toggle ou d'une
// colonne. Recherche récursive : un toggle ou un tableau peut vivre dans une colonne.
function getList(page, parentBlockId) {
  if (!parentBlockId) return page.blocks;
  return findList(page.blocks, parentBlockId);
}

function findList(list, parentBlockId) {
  for (const b of list) {
    if (b.id === parentBlockId) return b.children ?? null;
    if (b.type === "toggle" && b.children) {
      const r = findList(b.children, parentBlockId);
      if (r) return r;
    }
    if (b.type === "columns") {
      for (const col of b.columns) {
        if (col.id === parentBlockId) return col.blocks;
        const r = findList(col.blocks, parentBlockId);
        if (r) return r;
      }
    }
  }
  return null;
}

// Localise la liste contenant un bloc (n'importe où dans l'arbre) + son index
function findContaining(list, blockId) {
  const idx = list.findIndex((b) => b.id === blockId);
  if (idx >= 0) return { list, idx };
  for (const b of list) {
    if (b.type === "toggle" && b.children) {
      const r = findContaining(b.children, blockId);
      if (r) return r;
    }
    if (b.type === "columns") {
      for (const col of b.columns) {
        const r = findContaining(col.blocks, blockId);
        if (r) return r;
      }
    }
  }
  return null;
}

// Tous les ids internes d'un bloc (lui-même, ses enfants, ses colonnes) —
// pour interdire de déposer un bloc à l'intérieur de lui-même.
function innerIds(block, acc = new Set()) {
  acc.add(block.id);
  if (block.type === "toggle") for (const c of block.children || []) innerIds(c, acc);
  if (block.type === "columns") {
    for (const col of block.columns) {
      acc.add(col.id);
      for (const c of col.blocks) innerIds(c, acc);
    }
  }
  return acc;
}

// Nature de la liste ciblée par parentId : racine, enfants de toggle ou colonne
function listKind(page, parentId) {
  if (!parentId) return "root";
  const walk = (list) => {
    for (const b of list) {
      if (b.id === parentId) return b.type === "toggle" ? "toggle" : null;
      if (b.type === "toggle" && b.children) {
        const r = walk(b.children);
        if (r) return r;
      }
      if (b.type === "columns") {
        for (const col of b.columns) {
          if (col.id === parentId) return "column";
          const r = walk(col.blocks);
          if (r) return r;
        }
      }
    }
    return null;
  };
  return walk(page.blocks);
}

// Une colonne vidée disparaît ; s'il reste au plus une colonne, le bloc
// colonnes se dissout et son contenu remonte dans la liste parente (comme Notion).
function collapseColumns(list) {
  for (let i = list.length - 1; i >= 0; i--) {
    const b = list[i];
    if (b.type === "toggle" && b.children) collapseColumns(b.children);
    if (b.type !== "columns") continue;
    for (const col of b.columns) collapseColumns(col.blocks);
    b.columns = b.columns.filter((c) => c.blocks.length > 0);
    if (b.columns.length <= 1) {
      list.splice(i, 1, ...(b.columns[0]?.blocks || []));
    }
  }
}

// Réattribue de nouveaux ids à un sous-arbre de bloc cloné (les liens de page
// conservent leur cible). Pour un tableau : colonnes, lignes, cellules et tri remappés.
function reassignIds(block) {
  block.id = uid();
  if (block.type === "toggle") for (const c of block.children || []) reassignIds(c);
  if (block.type === "columns") {
    for (const col of block.columns) {
      col.id = uid();
      for (const c of col.blocks) reassignIds(c);
    }
  }
  if (block.type === "table") {
    const map = {};
    for (const c of block.columns) {
      const nid = uid();
      map[c.id] = nid;
      c.id = nid;
    }
    for (const r of block.rows) {
      r.id = uid();
      const cells = {};
      for (const k in r.cells) cells[map[k] ?? k] = r.cells[k];
      r.cells = cells;
    }
    if (block.sort?.colId)
      block.sort = { ...block.sort, colId: map[block.sort.colId] ?? block.sort.colId };
  }
}

// Copie profonde d'un bloc avec ids neufs. Un bloc « page » dupliqué reçoit une
// vraie nouvelle page (titre + icône + contenu clonés) rattachée à ownerPageId.
function cloneBlockDeep(block, s, ownerPageId) {
  const copy = structuredClone(block);
  if (copy.type === "page" && s.pages[copy.pageId]) {
    const orig = s.pages[copy.pageId];
    const newPid = uid();
    s.pages[newPid] = {
      id: newPid,
      title: orig.title ? `${orig.title} (copie)` : "",
      parentId: ownerPageId,
      icon: orig.icon || null,
      createdAt: Date.now(),
      blocks: orig.blocks.map((b) => {
        const c = structuredClone(b);
        reassignIds(c);
        return c;
      }),
    };
    return { id: uid(), type: "page", pageId: newPid };
  }
  reassignIds(copy);
  return copy;
}

export function StoreProvider({ children }) {
  const [state, setState] = useState(null);
  const [view, setView] = useState({ type: "habits" });
  const [focusId, setFocusId] = useState(null);
  const saveTimer = useRef(null);
  const stateRef = useRef(null);
  stateRef.current = state;

  // Chargement initial
  useEffect(() => {
    let cancelled = false;
    loadData().then((data) => {
      if (cancelled) return;
      // données existantes d'avant l'ajout du thème : "light" par défaut
      const s = data ? { theme: "light", ...data } : defaultState();
      // préférences d'interface (barre latérale, période des habitudes)
      s.ui = { sidebarWidth: 256, sidebarCollapsed: false, ...(s.ui || {}) };
      // Migration : les habitudes autrefois « masquées » sont supprimées
      // définitivement (elles ne comptent plus dans les pourcentages).
      if (s.habits?.some((h) => h.visible === false)) {
        const dead = new Set(s.habits.filter((h) => h.visible === false).map((h) => h.id));
        s.habits = s.habits.filter((h) => h.visible !== false);
        for (const day of Object.keys(s.habitLog || {})) {
          for (const id of dead) delete s.habitLog[day][id];
        }
      }
      setState(s);
      const firstPage = Object.values(s.pages).find((p) => !p.parentId);
      setView(firstPage ? { type: "page", id: firstPage.id } : { type: "habits" });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Sauvegarde débouncée
  useEffect(() => {
    if (!state) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveData(state), 400);
    return () => clearTimeout(saveTimer.current);
  }, [state]);

  const mutate = useCallback((fn) => {
    setState((prev) => {
      const s = structuredClone(prev);
      fn(s);
      return s;
    });
  }, []);

  const actions = useMemo(() => {
    const a = {};

    // ---- Pages ----
    a.createPage = (parentId = null, title = "") => {
      const id = uid();
      mutate((s) => {
        s.pages[id] = {
          id,
          title,
          parentId,
          createdAt: Date.now(),
          blocks: [newBlock("paragraph")],
        };
      });
      return id;
    };

    a.renamePage = (id, title) =>
      mutate((s) => {
        if (s.pages[id]) s.pages[id].title = title;
      });

    a.setPageIcon = (id, icon) =>
      mutate((s) => {
        if (s.pages[id]) s.pages[id].icon = icon || null;
      });

    // Marges gauche/droite de la page (px). null = disposition par défaut (centrée).
    // pinWidths { blockId: px } fige la largeur des blocs colonnes racine au moment
    // du réglage : changer la marge n'agrandit ni ne rétrécit les colonnes, l'espace
    // gagné reste libre. Le retour au défaut (null) les rend à nouveau fluides.
    a.setPageMargins = (id, margins, pinWidths) =>
      mutate((s) => {
        const p = s.pages[id];
        if (!p) return;
        if (margins) {
          p.margins = margins;
          if (pinWidths) {
            for (const b of p.blocks) {
              if (b.type === "columns" && pinWidths[b.id] && !b.w) {
                b.w = Math.round(pinWidths[b.id]);
              }
            }
          }
        } else {
          delete p.margins;
          for (const b of p.blocks) {
            if (b.type === "columns") delete b.w;
          }
        }
      });

    a.deletePage = (id) => {
      const cur = stateRef.current;
      if (!cur?.pages[id]) return;
      // collecte de la page + tous ses descendants
      const doomed = new Set([id]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const p of Object.values(cur.pages)) {
          if (p.parentId && doomed.has(p.parentId) && !doomed.has(p.id)) {
            doomed.add(p.id);
            grew = true;
          }
        }
      }
      let fallback = cur.pages[id].parentId || null;
      if (!fallback) {
        const root = Object.values(cur.pages).find((p) => !p.parentId && !doomed.has(p.id));
        fallback = root ? root.id : null;
      }
      mutate((s) => {
        for (const d of doomed) delete s.pages[d];
        // retire les blocs "page" qui pointaient vers les pages supprimées
        const scrub = (list) => {
          for (let i = list.length - 1; i >= 0; i--) {
            const b = list[i];
            if (b.type === "page" && doomed.has(b.pageId)) {
              list.splice(i, 1);
            } else if (b.type === "toggle" && b.children) {
              scrub(b.children);
            } else if (b.type === "columns") {
              for (const col of b.columns) scrub(col.blocks);
            }
          }
        };
        for (const p of Object.values(s.pages)) {
          scrub(p.blocks);
          collapseColumns(p.blocks);
        }
      });
      setView((v) =>
        v.type === "page" && doomed.has(v.id)
          ? fallback
            ? { type: "page", id: fallback }
            : { type: "habits" }
          : v
      );
    };

    // ---- Blocs ----
    a.updateBlock = (pageId, parentBlockId, blockId, patch) =>
      mutate((s) => {
        const list = getList(s.pages[pageId], parentBlockId);
        const b = list?.find((x) => x.id === blockId);
        if (b) Object.assign(b, patch);
      });

    a.updateBlockWith = (pageId, parentBlockId, blockId, fn) =>
      mutate((s) => {
        const list = getList(s.pages[pageId], parentBlockId);
        const b = list?.find((x) => x.id === blockId);
        if (b) fn(b);
      });

    a.insertBlockAfter = (pageId, parentBlockId, afterId, block) => {
      mutate((s) => {
        const list = getList(s.pages[pageId], parentBlockId);
        if (!list) return;
        const idx = afterId ? list.findIndex((x) => x.id === afterId) : -1;
        list.splice(idx + 1 === 0 ? list.length : idx + 1, 0, block);
      });
      return block.id;
    };

    a.appendBlock = (pageId, block) =>
      mutate((s) => {
        s.pages[pageId]?.blocks.push(block);
      });

    a.removeBlock = (pageId, parentBlockId, blockId) =>
      mutate((s) => {
        const page = s.pages[pageId];
        const list = getList(page, parentBlockId);
        if (!list) return;
        const idx = list.findIndex((x) => x.id === blockId);
        if (idx >= 0) list.splice(idx, 1);
        collapseColumns(page.blocks);
        // une page ne reste jamais sans bloc
        if (page.blocks.length === 0) {
          page.blocks.push(newBlock("paragraph"));
        }
      });

    // type : paragraph | heading1-3 | toggle | toggle-h1/h2/h3
    a.transformBlock = (pageId, parentBlockId, blockId, type) =>
      mutate((s) => {
        const list = getList(s.pages[pageId], parentBlockId);
        if (!list) return;
        const idx = list.findIndex((x) => x.id === blockId);
        if (idx < 0) return;
        const old = list[idx];
        const toToggle = type === "toggle" || type.startsWith("toggle-h");
        const h = type.startsWith("toggle-h") ? Number(type.slice(-1)) : 0;
        if (toToggle) {
          if (old.type === "toggle") {
            old.h = h; // changement de niveau : enfants et état déplié conservés
            return;
          }
          const fresh = newBlock("toggle", { html: old.html || "", h });
          fresh.id = old.id;
          list[idx] = fresh;
          return;
        }
        if (old.type === "toggle" && old.children?.length) {
          // on remonte les enfants du toggle en frères
          list.splice(idx + 1, 0, ...old.children);
        }
        const fresh = newBlock(type, { html: old.html || "" });
        fresh.id = old.id;
        list[idx] = fresh;
      });

    a.replaceBlock = (pageId, parentBlockId, blockId, block) =>
      mutate((s) => {
        const list = getList(s.pages[pageId], parentBlockId);
        if (!list) return;
        const idx = list.findIndex((x) => x.id === blockId);
        if (idx >= 0) list[idx] = block;
      });

    // Duplique un bloc juste après lui (ids neufs ; un lien de page → vraie copie)
    a.duplicateBlock = (pageId, parentBlockId, blockId) =>
      mutate((s) => {
        const page = s.pages[pageId];
        if (!page) return;
        const src = findContaining(page.blocks, blockId);
        if (!src) return;
        const copy = cloneBlockDeep(src.list[src.idx], s, pageId);
        src.list.splice(src.idx + 1, 0, copy);
      });

    // Déplace un bloc (où qu'il soit dans la page source) vers la fin d'une autre page
    a.moveBlockToPage = (fromPageId, blockId, toPageId) =>
      mutate((s) => {
        const from = s.pages[fromPageId];
        const to = s.pages[toPageId];
        if (!from || !to || fromPageId === toPageId) return;
        const src = findContaining(from.blocks, blockId);
        if (!src) return;
        const [moved] = src.list.splice(src.idx, 1);
        to.blocks.push(moved);
        // un lien de sous-page suit son parent dans l'arborescence
        if (moved.type === "page" && s.pages[moved.pageId]) s.pages[moved.pageId].parentId = toPageId;
        collapseColumns(from.blocks);
        if (from.blocks.length === 0) from.blocks.push(newBlock("paragraph"));
      });

    // Déplace un bloc vers la liste `toParentId` (null = racine) à l'index donné
    a.moveBlock = (pageId, blockId, toParentId, toIndex) =>
      mutate((s) => {
        const page = s.pages[pageId];
        const src = findContaining(page.blocks, blockId);
        if (!src) return;
        const moved = src.list[src.idx];
        // pas de dépôt d'un bloc à l'intérieur de lui-même
        if (toParentId && innerIds(moved).has(toParentId)) return;
        const kind = listKind(page, toParentId);
        if (!kind) return;
        // un toggle accepte tout sauf des colonnes (comme Notion) ; idem colonnes
        if ((kind === "toggle" || kind === "column") && moved.type === "columns") return;
        src.list.splice(src.idx, 1);
        const list = getList(page, toParentId);
        if (!list) {
          src.list.splice(src.idx, 0, moved); // cible disparue : on remet en place
          return;
        }
        let i = Math.max(0, Math.min(toIndex, list.length));
        if (list === src.list && src.idx < toIndex) i -= 1;
        list.splice(i, 0, moved);
        collapseColumns(page.blocks);
        if (page.blocks.length === 0) page.blocks.push(newBlock("paragraph"));
      });

    // Déplace plusieurs blocs racine d'un coup (sélection multiple glissée) vers
    // la liste `toParentId` (null = racine) à l'index donné, en préservant leur
    // ordre. L'ancre (bloc qui doit suivre le groupe) est mémorisée AVANT le
    // retrait pour que l'index reste correct même lors d'un déplacement interne.
    a.moveBlocks = (pageId, ids, toParentId, toIndex) =>
      mutate((s) => {
        const page = s.pages[pageId];
        if (!page) return;
        const idSet = new Set(ids);
        // les blocs déplacés sont des blocs racine, dans l'ordre du document
        const moved = page.blocks.filter((b) => idSet.has(b.id));
        if (!moved.length) return;
        // pas de dépôt à l'intérieur d'un des blocs déplacés
        const innerAll = new Set();
        for (const b of moved) innerIds(b, innerAll);
        if (toParentId && innerAll.has(toParentId)) return;
        const kind = listKind(page, toParentId);
        if (!kind) return;
        // un toggle / une colonne refuse un bloc colonnes (comme Notion)
        if ((kind === "toggle" || kind === "column") && moved.some((b) => b.type === "columns"))
          return;
        const targetList = getList(page, toParentId);
        if (!targetList) return;
        // bloc qui suivra le groupe inséré (null = fin de liste)
        const anchorId = toIndex < targetList.length ? targetList[toIndex]?.id : null;
        page.blocks = page.blocks.filter((b) => !idSet.has(b.id));
        const list = getList(page, toParentId);
        if (!list) return;
        let at;
        if (anchorId && !idSet.has(anchorId)) {
          const ai = list.findIndex((b) => b.id === anchorId);
          at = ai < 0 ? list.length : ai;
        } else {
          at = list.length;
        }
        list.splice(at, 0, ...moved);
        collapseColumns(page.blocks);
        if (page.blocks.length === 0) page.blocks.push(newBlock("paragraph"));
      });

    // Dépôt sur le bord gauche/droit d'un bloc racine : crée un bloc 2 colonnes
    // avec la cible et le bloc déplacé côte à côte (comme Notion).
    a.wrapInColumns = (pageId, targetBlockId, draggedId, side) =>
      mutate((s) => {
        const page = s.pages[pageId];
        if (targetBlockId === draggedId) return;
        const target = page.blocks.find((b) => b.id === targetBlockId);
        if (!target || target.type === "columns") return;
        const src = findContaining(page.blocks, draggedId);
        if (!src) return;
        const dragged = src.list[src.idx];
        if (dragged.type === "columns") return;
        if (innerIds(dragged).has(targetBlockId)) return;
        src.list.splice(src.idx, 1);
        const i = page.blocks.findIndex((b) => b.id === targetBlockId);
        if (i < 0) return;
        const pair = side === "left" ? [dragged, target] : [target, dragged];
        page.blocks[i] = {
          id: uid(),
          type: "columns",
          columns: pair.map((b) => ({ id: uid(), blocks: [b] })),
        };
        collapseColumns(page.blocks);
        if (page.blocks.length === 0) page.blocks.push(newBlock("paragraph"));
      });

    // Dépôt dans l'interstice entre deux colonnes : insère une nouvelle colonne
    // à cet emplacement contenant le bloc déplacé.
    a.insertColumnWith = (pageId, parentBlockId, columnsId, index, draggedId) =>
      mutate((s) => {
        const page = s.pages[pageId];
        const src = findContaining(page.blocks, draggedId);
        if (!src) return;
        const dragged = src.list[src.idx];
        if (dragged.type === "columns") return;
        if (innerIds(dragged).has(columnsId)) return;
        const list = getList(page, parentBlockId);
        const cb = list?.find((b) => b.id === columnsId);
        if (!cb || cb.type !== "columns" || cb.columns.length >= MAX_COLUMNS) return;
        src.list.splice(src.idx, 1);
        const i = Math.max(0, Math.min(index, cb.columns.length));
        cb.columns.splice(i, 0, { id: uid(), blocks: [dragged] });
        collapseColumns(page.blocks);
        if (page.blocks.length === 0) page.blocks.push(newBlock("paragraph"));
      });

    // Suppression de plusieurs blocs racine (sélection multiple)
    a.removeBlocks = (pageId, ids) =>
      mutate((s) => {
        const page = s.pages[pageId];
        const set = new Set(ids);
        page.blocks = page.blocks.filter((b) => !set.has(b.id));
        collapseColumns(page.blocks);
        if (page.blocks.length === 0) page.blocks.push(newBlock("paragraph"));
      });

    // Ajoute une colonne vide à droite ; renvoie l'id du paragraphe créé (pour focus)
    a.addColumn = (pageId, parentBlockId, blockId) => {
      const nb = newBlock("paragraph");
      mutate((s) => {
        const list = getList(s.pages[pageId], parentBlockId);
        const b = list?.find((x) => x.id === blockId);
        if (b?.type === "columns" && b.columns.length < MAX_COLUMNS) {
          b.columns.push({ id: uid(), blocks: [nb] });
        }
      });
      return nb.id;
    };

    // Ajuste les proportions (flex-grow) de colonnes de mise en page après un
    // glissé du séparateur ; growById = { [columnId]: grow } (façon Notion).
    a.setColumnGrow = (pageId, parentBlockId, columnsId, growById) =>
      mutate((s) => {
        const list = getList(s.pages[pageId], parentBlockId);
        const cb = list?.find((b) => b.id === columnsId);
        if (!cb || cb.type !== "columns") return;
        for (const col of cb.columns) {
          if (growById[col.id] != null) col.grow = growById[col.id];
        }
      });

    // ---- Habitudes ----
    a.toggleHabitLog = (day, habitId) =>
      mutate((s) => {
        if (!s.habitLog[day]) s.habitLog[day] = {};
        s.habitLog[day][habitId] = !s.habitLog[day][habitId];
      });

    a.addHabit = (name) =>
      mutate((s) => {
        s.habits.push({
          id: uid(),
          name,
          color: HABIT_COLORS[s.habits.length % HABIT_COLORS.length],
          visible: true,
        });
      });

    a.removeHabit = (id) =>
      mutate((s) => {
        s.habits = s.habits.filter((x) => x.id !== id);
        for (const day of Object.keys(s.habitLog)) delete s.habitLog[day][id];
      });

    a.renameHabit = (id, name) =>
      mutate((s) => {
        const h = s.habits.find((x) => x.id === id);
        if (h) h.name = name;
      });

    // ---- Thème ----
    a.toggleTheme = () =>
      mutate((s) => {
        s.theme = s.theme === "dark" ? "light" : "dark";
      });

    // Déplace une page sous une autre (glissé sidebar « page sur page ») :
    // met à jour la hiérarchie ET matérialise la sous-page dans le contenu
    // de la cible (comme Notion). Cycles interdits.
    a.movePage = (pageId, newParentId) =>
      mutate((s) => {
        if (pageId === newParentId || !s.pages[pageId] || !s.pages[newParentId]) return;
        // la cible ne peut pas être la page elle-même ni un de ses descendants
        let n = newParentId;
        while (n) {
          if (n === pageId) return;
          n = s.pages[n]?.parentId || null;
        }
        // retire les blocs-liens existants pointant vers la page déplacée…
        const scrub = (list) => {
          for (let i = list.length - 1; i >= 0; i--) {
            const b = list[i];
            if (b.type === "page" && b.pageId === pageId) list.splice(i, 1);
            else if (b.type === "toggle" && b.children) scrub(b.children);
            else if (b.type === "columns") for (const col of b.columns) scrub(col.blocks);
          }
        };
        for (const p of Object.values(s.pages)) {
          scrub(p.blocks);
          collapseColumns(p.blocks);
          if (p.blocks.length === 0) p.blocks.push(newBlock("paragraph"));
        }
        // …et l'ajoute en fin de contenu de la cible
        s.pages[newParentId].blocks.push({ id: uid(), type: "page", pageId });
        s.pages[pageId].parentId = newParentId;
      });

    // ---- Interface (barre latérale, période des habitudes) ----
    a.setHabitPeriod = (p) =>
      mutate((s) => {
        s.ui = { ...(s.ui || {}), habitPeriod: p };
      });

    a.setSidebarWidth = (w) =>
      mutate((s) => {
        s.ui = { ...(s.ui || {}), sidebarWidth: w };
      });

    a.toggleSidebar = () =>
      mutate((s) => {
        s.ui = { ...(s.ui || {}), sidebarCollapsed: !s.ui?.sidebarCollapsed };
      });

    return a;
  }, [mutate]);

  const value = useMemo(
    () => ({ state, view, setView, focusId, setFocusId, ...actions }),
    [state, view, focusId, actions]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  return useContext(StoreContext);
}

// Enfants directs d'une page (null = racine), triés par date de création
export function childrenOf(pages, parentId) {
  return Object.values(pages)
    .filter((p) => (p.parentId || null) === (parentId || null))
    .sort((x, y) => x.createdAt - y.createdAt);
}
