#!/usr/bin/env bash
# Compilation Android de Noteflow.
#
# Regroupe les variables d'environnement qu'attend Tauri (JDK, SDK, NDK) pour
# ne pas avoir à les retaper. Chacune peut être surchargée depuis le shell si
# l'installation se trouve ailleurs (utile en intégration continue).
#
# Usage :
#   npm run android:apk    -> APK de test, signé, installable sur le téléphone
#   npm run android:dev    -> lance l'app sur un appareil branché (rechargement à chaud)
#   bash scripts/android.sh <commande tauri android>
set -euo pipefail

export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@21}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"

# NDK : on prend la version installée la plus récente si NDK_HOME n'est pas fixé
if [ -z "${NDK_HOME:-}" ]; then
  NDK_HOME="$(find "$ANDROID_HOME/ndk" -maxdepth 1 -mindepth 1 -type d 2>/dev/null | sort -V | tail -1)"
  export NDK_HOME
fi

export PATH="$HOME/.cargo/bin:$JAVA_HOME/bin:$PATH"

# Diagnostic clair plutôt qu'une erreur Gradle incompréhensible
for v in JAVA_HOME ANDROID_HOME NDK_HOME; do
  if [ -z "${!v:-}" ] || [ ! -d "${!v}" ]; then
    echo "Erreur : $v introuvable (${!v:-non défini})." >&2
    echo "Installer le JDK 21 (brew install openjdk@21) et le SDK Android," >&2
    echo "ou définir $v à la main avant de relancer." >&2
    exit 1
  fi
done

exec npx tauri android "$@"
