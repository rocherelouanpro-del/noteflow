import { useEffect, useState } from "react";

// Écran étroit (téléphone, ou fenêtre réduite sur ordinateur). Certaines vues
// changent complètement de forme en dessous de ce seuil : la barre latérale
// passe en panneau superposé, le tableau de suivi devient une liste de cartes.
const QUERY = "(max-width: 767px)";

export function useNarrow() {
  const [narrow, setNarrow] = useState(
    () => typeof window !== "undefined" && window.matchMedia(QUERY).matches
  );

  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const sync = () => setNarrow(mq.matches);
    sync(); // rattrape une rotation survenue avant l'abonnement
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return narrow;
}
