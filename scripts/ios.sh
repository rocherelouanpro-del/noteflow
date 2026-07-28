#!/usr/bin/env bash
# Compilation iOS de Noteflow.
#
# Usage :
#   npm run ios:dev    -> lance l'app dans le simulateur, rechargement à chaud
#   npm run ios:sim    -> compile une app pour le simulateur
#   npm run ios:xcode  -> ouvre le projet dans Xcode
set -euo pipefail

export PATH="$HOME/.cargo/bin:/opt/homebrew/bin:$PATH"
# CocoaPods refuse de tourner sans encodage UTF-8
export LANG="${LANG:-en_US.UTF-8}"

if ! command -v cargo >/dev/null; then
  echo "Erreur : cargo introuvable. Installer Rust (https://rustup.rs) puis relancer." >&2
  exit 1
fi

# Tauri déplace l'app compilée en fin de build et échoue si la précédente est
# encore là (« failed to rename app … Directory not empty »). On nettoie donc
# la sortie avant chaque compilation — elle est de toute façon regénérée.
rm -rf src-tauri/gen/apple/build

exec npx tauri ios "$@"
