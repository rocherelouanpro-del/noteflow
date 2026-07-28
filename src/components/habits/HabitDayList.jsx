import React, { useEffect, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useStore } from "../../store";
import { addDays, formatDateFr, pctColor, pctBgColor } from "../../utils";
import { dayPct } from "./stats";
import { useToday } from "./useToday";

// Équivalent tactile de HabitTable : une carte par jour au lieu d'une ligne de
// tableau. Les cases du tableau font 18 px — increvables à la souris, hors de
// portée au doigt (44 pt recommandés). Ici chaque habitude devient une ligne
// pleine largeur : c'est la ligne entière qui coche.
//
// Un seul jour est déplié à la fois, aujourd'hui par défaut. Les autres restent
// en résumé (pastilles + pourcentage) et se déplient d'un appui, avec la même
// vue que le jour courant — on corrige donc un oubli de la veille sans quitter
// la page.

// Au-delà, on pagine : en période « Tout » l'historique peut faire des
// centaines de jours, et une carte coûte bien plus cher qu'un <tr>.
const PAGE = 60;
// Pastilles affichées dans le résumé avant de basculer en « +N »
const MAX_DOTS = 10;

export default function HabitDayList({ habits, days }) {
  const today = useToday();
  const [openDay, setOpenDay] = useState(today);
  const [limit, setLimit] = useState(PAGE);

  // Passage de minuit : sans ça la carte dépliée resterait celle de la veille.
  useEffect(() => setOpenDay(today), [today]);

  // La période choisie en haut de page peut raccourcir la liste : on repart
  // d'une pagination neuve, et si le jour déplié vient d'en sortir on revient
  // sur aujourd'hui — sinon plus aucune carte ne serait ouverte.
  useEffect(() => {
    setLimit(PAGE);
    setOpenDay((cur) => (cur && !days.includes(cur) ? today : cur));
  }, [days.length]);

  const shown = days.slice(0, limit);
  const rest = days.length - shown.length;

  return (
    <div className="flex flex-col gap-2">
      {shown.map((day) => (
        <DayCard
          key={day}
          day={day}
          habits={habits}
          today={today}
          open={day === openDay}
          onToggle={() => setOpenDay((cur) => (cur === day ? null : day))}
        />
      ))}
      {rest > 0 && (
        <button
          onClick={() => setLimit((n) => n + PAGE)}
          className="mt-1 w-full py-2.5 rounded-xl border border-line text-[13px] font-medium text-ink-light active:bg-hover"
        >
          Voir plus ({rest} jour{rest > 1 ? "s" : ""})
        </button>
      )}
    </div>
  );
}

function dayLabel(day, today) {
  if (day === today) return "Aujourd'hui";
  if (day === addDays(today, -1)) return "Hier";
  return formatDateFr(day);
}

function DayCard({ day, habits, today, open, onToggle }) {
  const { state, toggleHabitLog } = useStore();
  const log = state.habitLog[day];
  const pct = dayPct(state, day);
  const isToday = day === today;

  return (
    <div
      className={`rounded-2xl border bg-card overflow-hidden transition-colors ${
        open ? "border-accent/40 shadow-sm" : "border-line"
      }`}
    >
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 min-h-[52px] text-left"
      >
        <ChevronDown
          size={16}
          className={`shrink-0 text-ink-faint transition-transform ${open ? "" : "-rotate-90"}`}
        />
        <span
          className={`shrink-0 text-[14px] ${isToday ? "font-semibold" : "text-ink-light"}`}
        >
          {dayLabel(day, today)}
        </span>

        {/* Résumé : redondant quand la carte est dépliée, on le retire alors. */}
        {!open && (
          <span className="flex min-w-0 items-center gap-1 overflow-hidden">
            {habits.slice(0, MAX_DOTS).map((h) => (
              <span
                key={h.id}
                className="w-2.5 h-2.5 shrink-0 rounded-full border"
                style={
                  log?.[h.id]
                    ? { backgroundColor: h.color, borderColor: h.color }
                    : { borderColor: "var(--line-strong)" }
                }
              />
            ))}
            {habits.length > MAX_DOTS && (
              <span className="text-[11px] text-ink-faint">
                +{habits.length - MAX_DOTS}
              </span>
            )}
          </span>
        )}

        <span
          className="ml-auto shrink-0 min-w-[52px] px-2 py-0.5 rounded-full text-center text-xs font-semibold tabular-nums"
          style={{ backgroundColor: pctBgColor(pct), color: pctColor(pct) }}
        >
          {Math.round(pct)}%
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-1 px-2 pb-2">
          {habits.length === 0 ? (
            <p className="px-2 py-3 text-[13px] text-ink-faint">
              Aucune habitude à cocher pour l'instant.
            </p>
          ) : (
            habits.map((h) => {
              const checked = !!log?.[h.id];
              return (
                <button
                  key={h.id}
                  onClick={() => toggleHabitLog(day, h.id)}
                  aria-pressed={checked}
                  className="flex w-full min-h-[46px] items-center gap-3 rounded-xl px-3 text-left transition-colors"
                  // Les couleurs d'habitude sont des hex 6 chiffres : le suffixe
                  // alpha donne un fond teinté sans calcul.
                  style={{ backgroundColor: checked ? `${h.color}1a` : "transparent" }}
                >
                  <span
                    className="w-2.5 h-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: h.color }}
                  />
                  <span
                    className={`min-w-0 flex-1 text-[15px] leading-tight ${
                      checked ? "font-medium" : "text-ink-light"
                    }`}
                  >
                    {h.name}
                  </span>
                  <span
                    className="flex w-[26px] h-[26px] shrink-0 items-center justify-center rounded-[8px] border-2"
                    style={
                      checked
                        ? { backgroundColor: h.color, borderColor: h.color }
                        : { borderColor: "var(--line-strong)" }
                    }
                  >
                    {checked && <Check size={16} strokeWidth={3.5} className="text-white" />}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
