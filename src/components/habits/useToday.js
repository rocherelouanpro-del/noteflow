import { useEffect, useState } from "react";
import { dateKey } from "../../utils";

// Renvoie la date du jour (clé YYYY-MM-DD) et se met à jour toute seule
// au passage de minuit : la nouvelle ligne du journal apparaît sans
// redémarrer l'application.
export function useToday() {
  const [today, setToday] = useState(dateKey());
  useEffect(() => {
    const check = () => {
      const k = dateKey();
      setToday((prev) => (prev === k ? prev : k));
    };
    const id = setInterval(check, 30_000);
    // couvre aussi le retour de veille du Mac (l'interval peut être gelé)
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, []);
  return today;
}
