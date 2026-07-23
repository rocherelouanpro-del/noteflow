// Contexte UI de la page : sélection multiple de blocs racine.
// Fourni par PageView, consommé par les enveloppes de blocs (surbrillance).
import { createContext, useContext } from "react";

export const PageUiContext = createContext({ selectedIds: new Set() });

export function usePageUi() {
  return useContext(PageUiContext);
}
