import { daysSince } from "../../utils";

// Fenêtre de jours sélectionnée (Semaine / Mois / Année / Tout / Personnalisée),
// bornée à l'historique réellement suivi. Clés du plus récent au plus ancien.
export function periodDays(state) {
  const all = daysSince(state.habitStart);
  const p = state.ui?.habitPeriod || { kind: "all" };
  const UNIT_DAYS = { jour: 1, semaine: 7, mois: 30 };
  let n = null;
  if (p.kind === "week") n = 7;
  else if (p.kind === "month") n = 30;
  else if (p.kind === "year") n = 365;
  else if (p.kind === "custom")
    n = Math.max(1, Math.round(p.n || 7) * (UNIT_DAYS[p.unit] || 1));
  return n ? all.slice(0, n) : all;
}

// Statistiques d'une habitude : taux de complétion sur la fenêtre `days`
// (historique complet par défaut) + série en cours (toujours sur tout).
export function habitStats(state, habitId, days = null) {
  const all = daysSince(state.habitStart);
  const win = days || all;
  const done = win.filter((d) => state.habitLog[d]?.[habitId]).length;
  const rate = win.length ? (done / win.length) * 100 : 0;

  // Série en cours : on remonte depuis aujourd'hui ;
  // aujourd'hui pas encore coché ne casse pas la série.
  let streak = 0;
  let i = 0;
  if (all.length && !state.habitLog[all[0]]?.[habitId]) i = 1;
  for (; i < all.length; i++) {
    if (state.habitLog[all[i]]?.[habitId]) streak++;
    else break;
  }
  return { totalDays: win.length, done, rate, streak };
}

// % d'habitudes complétées un jour donné (sur toutes les habitudes)
export function dayPct(state, day) {
  const total = state.habits.length;
  if (!total) return 0;
  const done = state.habits.filter((h) => state.habitLog[day]?.[h.id]).length;
  return (done / total) * 100;
}
