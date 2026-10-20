import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ANTENNA_BY_ID, ANTENNAS, CATEGORIES } from "../lib/antennas";
import type { AntennaDef } from "../lib/types";
import { set, useStore } from "../store";
import { useT } from "../i18n";
import { AntennaIcon } from "./AntennaIcon";

/** Compact antenna-type dropdown: the current type with its icon, a filterable listbox grouped by category. */
export function AntennaSelect({ onPick }: { onPick?: () => void }) {
  const t = useT();
  const type = useStore((s) => s.type);
  const cur = ANTENNA_BY_ID[type];
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(type);
  const root = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();

  /** Groups after the filter (name, summary or category, in the UI language or English). */
  const groups = useMemo(() => {
    const s = q.trim().toLowerCase();
    const hit = (a: AntennaDef) => !s || [a.name, a.summary, a.category].some((x) => x.toLowerCase().includes(s) || t(x).toLowerCase().includes(s));
    return CATEGORIES.map((c) => [c, ANTENNAS.filter((a) => a.category === c && hit(a))] as const).filter(([, l]) => l.length);
  }, [q, t]);
  const flat = useMemo(() => groups.flatMap(([, l]) => l), [groups]);
  /** The highlighted option, or the first match once the filter hides it. */
  const act = flat.some((a) => a.id === active) ? active : flat[0]?.id;

  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", down);
    return () => document.removeEventListener("pointerdown", down);
  }, [open]);
  // Keep the active option in view while moving with the keys (and the current one on open).
  useEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(act ?? "")}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, act]);

  const show = () => { setQ(""); setActive(type); setOpen(true); };
  const close = (focus = true) => { setOpen(false); if (focus) btn.current?.focus(); };
  const pick = (a: AntennaDef) => { set({ type: a.id }); close(); onPick?.(); };
  const move = (d: number) => {
    if (!flat.length) return;
    const i = flat.findIndex((a) => a.id === act);
    setActive(flat[i < 0 ? 0 : (i + d + flat.length) % flat.length].id);
  };
  const keys = (e: KeyboardEvent) => {
    const k = e.key;
    if (k === "ArrowDown") move(1);
    else if (k === "ArrowUp") move(-1);
    else if (k === "Home" && !q) { if (flat.length) setActive(flat[0].id); }
    else if (k === "End" && !q) { if (flat.length) setActive(flat[flat.length - 1].id); }
    else if (k === "Enter") { const a = flat.find((x) => x.id === act); if (a) pick(a); }
    else if (k === "Escape") { e.stopPropagation(); close(); }   // don't also close the mobile drawer
    else if (k === "Tab") { setOpen(false); return; }
    else return;
    e.preventDefault();
  };

  return (
    <div className="asel" ref={root}>
      <button ref={btn} type="button" className={"asel-btn" + (open ? " open" : "")} aria-haspopup="listbox" aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined} aria-label={`${t("Antenna type")}: ${t(cur.name)}`}
        onClick={() => (open ? close() : show())}
        onKeyDown={(e) => { if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); show(); } }}>
        <AntennaIcon def={cur} />
        <span className="asel-text">
          <span className="asel-cat">{t(cur.category)}</span>
          <span className="asel-name">{t(cur.name)}</span>
        </span>
        <svg className="asel-chev" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && (
        <div className="asel-pop">
          <input className="asel-q" type="text" autoFocus value={q} placeholder={t("Search antennas")} aria-label={t("Search antennas")}
            role="combobox" aria-expanded="true" aria-controls={`${id}-list`} aria-autocomplete="list"
            aria-activedescendant={act ? `${id}-${act}` : undefined}
            onChange={(e) => setQ(e.target.value)} onKeyDown={keys} />
          <ul className="asel-list" id={`${id}-list`} role="listbox" ref={list} aria-label={t("Antenna type")}>
            {groups.map(([c, l]) => (
              <li key={c} role="presentation">
                <div className="asel-group" role="presentation">{t(c)}</div>
                <ul role="group" aria-label={t(c)}>
                  {l.map((a) => (
                    <li key={a.id} id={`${id}-${a.id}`} data-id={a.id} role="option" aria-selected={a.id === type}
                      className={"asel-opt" + (a.id === act ? " active" : "") + (a.id === type ? " on" : "")}
                      onPointerMove={() => setActive(a.id)} onClick={() => pick(a)}>
                      <AntennaIcon def={a} />
                      <span className="asel-text">
                        <span className="asel-name">{t(a.name)}</span>
                        <span className="asel-sum">{t(a.summary)}</span>
                      </span>
                      {a.id === type && <svg className="asel-check" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 7.5 6 10.5 11 4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
            {!flat.length && <li className="asel-none" role="presentation">{t("No matches")}</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
