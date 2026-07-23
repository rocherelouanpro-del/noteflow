# Noteflow

Un éditeur de notes de bureau **par blocs, façon Notion**, avec un **suivi d'habitudes** intégré. Application locale et privée : vos notes ne quittent jamais votre machine.

Construit avec [Tauri 2](https://tauri.app/) (Rust) + [React 19](https://react.dev/) + [Vite](https://vite.dev/) + [Tailwind CSS](https://tailwindcss.com/).

## Fonctionnalités

- **Édition par blocs** — paragraphes, titres, listes à puces / numérotées, citations, code, tableaux…
- **Menu slash** — tapez `/` pour insérer n'importe quel type de bloc.
- **Barre d'outils flottante** — mise en forme (gras, italique, code, liens) sur la sélection.
- **Glisser-déposer** — réorganisez les blocs à la souris, avec leur contenu imbriqué.
- **Navigation clavier** — déplacement fluide entre les blocs aux flèches, façon Notion.
- **Collage Markdown** — le Markdown collé (titres, listes, citations, gras/italique, code, liens, tableaux) est converti en blocs. Le HTML est systématiquement échappé et les URL non sûres filtrées.
- **Pages & barre latérale** — organisez vos pages, avec icônes emoji personnalisables.
- **Suivi d'habitudes** — une page dédiée au suivi de vos habitudes, avec une vue globale.
- **Blocs fichier** — ouvrez un fichier ou un dossier local avec l'application par défaut.
- **Persistance locale robuste** — écriture atomique (fichier temporaire puis `rename`) pour ne jamais corrompre vos notes.

## Stack technique

| Couche | Technologies |
| --- | --- |
| Interface | React 19, Vite 7, Tailwind CSS 3, [lucide-react](https://lucide.dev/) (icônes), [Inter](https://rsms.me/inter/) |
| Bureau | Tauri 2 (Rust), plugins `dialog` et `opener` |
| Données | Fichier JSON local en écriture atomique (mode desktop) · `localStorage` (mode navigateur, dev) |

## Prérequis

- [Node.js](https://nodejs.org/) (18+)
- [Rust](https://www.rust-lang.org/tools/install) (via `rustup`)
- Les [dépendances système Tauri](https://tauri.app/start/prerequisites/) pour votre OS

## Développement

```bash
# Installer les dépendances
npm install

# Lancer l'app de bureau en mode dev (recharge à chaud)
npm run tauri dev

# Ou uniquement l'interface web dans le navigateur (http://localhost:1420)
npm run dev
```

## Build

```bash
# Génère l'exécutable et les installeurs (.app / .dmg sur macOS)
npm run tauri build
```

Les artefacts sont produits dans `src-tauri/target/release/bundle/`.

## Structure du projet

```
noteflow/
├── src/                  # Interface React
│   ├── components/       # Blocs, menus, barre latérale, page d'habitudes…
│   ├── store.jsx         # État global et actions
│   ├── storage.js        # Persistance (Rust en desktop, localStorage en dev)
│   ├── markdown.js       # Import / collage Markdown → blocs
│   ├── dnd.js            # Glisser-déposer de blocs (événements souris)
│   ├── keynav.js         # Navigation clavier entre blocs
│   └── utils.js          # Utilitaires (dates, blocs, focus…)
└── src-tauri/            # Backend Rust (Tauri)
    ├── src/lib.rs        # Commandes : load_data, save_data, open_path
    └── tauri.conf.json   # Configuration de l'application
```

## Où sont stockées mes données ?

En mode bureau, vos notes sont enregistrées dans un unique fichier `noteflow.json`, dans le dossier de données de l'application (sur macOS : `~/Library/Application Support/com.elou.noteflow/`).

---

Développé par [Elouan Rocher](https://github.com/rocherelouanpro-del).
