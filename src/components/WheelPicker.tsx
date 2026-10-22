import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const ITEM = 46;
const TOP = 0;
/** Görgetési sebesség: sor / másodperc */
const MIN_SPEED = 3, MAX_SPEED = 10;
const LONG_PRESS = 450, TAP_SLOP = 8;

/** Ékezet-, kis/nagybetű-, szóköz- és kötőjel-független összehasonlítás */
export const norm = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[\s\-./·]+/g, "");

function score(item: string, q: string) {
  const n = norm(item);
  if (!q) return 1;
  if (n.startsWith(q)) return 4;
  if (n.includes(q)) return 3;
  const words = q.length ? item.toLowerCase().split(/\s+/) : [];
  if (words.some((w) => norm(w).startsWith(q))) return 2;
  let i = 0;
  for (const ch of n) if (ch === q[i]) i++;
  return i === q.length ? 1 : 0;
}

type Gesture = { y0: number; s0: number; tapPos: number; moved: boolean; timer?: ReturnType<typeof setTimeout> };

export function WheelPicker({
  items, value, onSelect, onClose, searchable = false, onReorder,
}: { items: string[]; value: number; onSelect: (i: number) => void; onClose: () => void; searchable?: boolean; onReorder?: ((from: number, to: number) => void) | undefined }) {
  const VIS = 5, PAD = 4;
  const canReorder = !!onReorder;
  const ref = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [scroll, setScroll] = useState(0);
  const [lens, setLens] = useState(0); // indikátor eltolása sorokban, -1..1
  const [scrubbing, setScrubbing] = useState(false);
  const [drag, setDrag] = useState<{ pos: number; y0: number; dy: number; s0: number } | null>(null);
  const pointerY = useRef(0);
  const gesture = useRef<Gesture | null>(null);
  const wheelTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const list = useMemo(() => {
    const q = norm(query);
    const all = items.map((label, idx) => ({ label, idx, s: score(label, q) })).filter((x) => x.s > 0);
    return q ? all.sort((a, b) => b.s - a.s) : all;
  }, [items, query]);

  const clampPos = (p: number) => Math.max(0, Math.min(list.length - 1, p));
  const focus = clampPos(Math.round((scroll + lens * ITEM) / ITEM));
  const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const centerOn = (pos: number) => {
    ref.current?.scrollTo({ top: clampPos(pos) * ITEM, behavior: reduced() ? "instant" : "smooth" });
    setLens(0);
  };

  useEffect(() => {
    const pos = query ? 0 : Math.max(0, list.findIndex((x) => x.idx === value));
    ref.current?.scrollTo({ top: pos * ITEM });
    setScroll(pos * ITEM);
    setLens(0);
  }, [query, value, list]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("keydown", key); clearTimeout(wheelTimer.current); if (gesture.current?.timer) clearTimeout(gesture.current.timer); };
  }, [onClose]);

  // Böngésző saját görgetésének tiltása érintésnél (mi vezéreljük a listát)
  useEffect(() => {
    const el = ref.current;
    const block = (e: TouchEvent) => e.preventDefault();
    el?.addEventListener("touchmove", block, { passive: false });
    return () => el?.removeEventListener("touchmove", block);
  }, []);

  // Pörgetés: az indikátor max. 1 sort mozdul, azon túl a lista pörög alatta
  useEffect(() => {
    if (!scrubbing) return;
    let raf = 0, last = performance.now();
    const tick = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000); last = t;
      const el = ref.current, g = gesture.current;
      if (el && g) {
        const dy = pointerY.current - g.y0;
        const over = Math.abs(dy) - ITEM;
        if (over > 0) {
          const speed = Math.min(MAX_SPEED, MIN_SPEED + (over / ITEM) * 3);
          el.scrollTop += Math.sign(dy) * speed * ITEM * dt;
          setScroll(el.scrollTop);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [scrubbing]);

  // Áthelyezés közbeni automatikus görgetés a lista szélein
  useEffect(() => {
    if (!drag) return;
    let raf = 0;
    const tick = () => {
      const el = ref.current;
      if (el) {
        const r = el.getBoundingClientRect(), zone = r.height * 0.12, y = pointerY.current;
        const depth = y < r.top + zone ? -(r.top + zone - y) / zone : y > r.bottom - zone ? (y - (r.bottom - zone)) / zone : 0;
        if (depth) { el.scrollTop += Math.sign(depth) * Math.min(1, Math.abs(depth)) * 3; setScroll(el.scrollTop); }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [!!drag]);

  const rel = drag ? drag.dy + scroll - drag.s0 : 0;
  const target = drag ? clampPos(drag.pos + Math.round(rel / ITEM)) : -1;

  const posAt = (clientY: number) => {
    const el = ref.current!;
    const y = clientY - el.getBoundingClientRect().top + el.scrollTop - TOP * ITEM;
    return Math.floor(y / ITEM);
  };

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointerY.current = e.clientY;
    const tapPos = posAt(e.clientY);
    const g: Gesture = { y0: e.clientY, s0: ref.current?.scrollTop ?? 0, tapPos, moved: false };
    if (canReorder && !query && tapPos >= 0 && tapPos < list.length) {
      g.timer = setTimeout(() => {
        if (gesture.current === g && !g.moved) { setDrag({ pos: tapPos, y0: g.y0, dy: 0, s0: ref.current?.scrollTop ?? 0 }); navigator.vibrate?.(15); }
      }, LONG_PRESS);
    }
    gesture.current = g;
  };

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    pointerY.current = e.clientY;
    if (drag) { setDrag({ ...drag, dy: e.clientY - drag.y0 }); return; }
    const g = gesture.current;
    if (!g) return;
    const dy = e.clientY - g.y0;
    if (!g.moved && Math.abs(dy) > TAP_SLOP) { g.moved = true; clearTimeout(g.timer); setScrubbing(true); }
    if (g.moved) setLens(Math.max(-1, Math.min(1, dy / ITEM)));
  };

  const onUp = () => {
    const g = gesture.current;
    gesture.current = null;
    if (g?.timer) clearTimeout(g.timer);
    if (drag) {
      const from = list[drag.pos]?.idx, to = list[target]?.idx;
      setDrag(null);
      if (from !== undefined && to !== undefined && from !== to) onReorder?.(from, to);
      return;
    }
    if (!g) return;
    if (g.moved) { setScrubbing(false); centerOn(focus); return; }
    // Koppintás: a középen lévő elemet választja ki, másikat középre hozza
    const center = clampPos(Math.round(scroll / ITEM));
    if (g.tapPos < 0 || g.tapPos >= list.length) return;
    if (g.tapPos === center) { const it = list[center]; if (it) onSelect(it.idx); }
    else centerOn(g.tapPos);
  };

  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = ref.current; if (!el) return;
    el.scrollTop += e.deltaY; setScroll(el.scrollTop);
    clearTimeout(wheelTimer.current);
    wheelTimer.current = setTimeout(() => centerOn(Math.round(el.scrollTop / ITEM)), 140);
  };

  const onKey = (e: React.KeyboardEvent) => {
    const center = clampPos(Math.round(scroll / ITEM));
    if (e.key === "ArrowDown") { e.preventDefault(); centerOn(center + 1); }
    if (e.key === "ArrowUp") { e.preventDefault(); centerOn(center - 1); }
    if (e.key === "Enter") { const it = list[center]; if (it) onSelect(it.idx); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-background/40 pt-10 animate-in fade-in" onClick={onClose}>
      <div role="dialog" aria-label={searchable ? "Technikai eszköz kiválasztása" : "Hónap kiválasztása"} aria-modal="true" className="relative w-[min(92vw,26rem)] rounded-xl border bg-popover p-2 shadow-2xl animate-in zoom-in-95 slide-in-from-top-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between px-2"><span className="font-display text-sm font-semibold">{searchable ? "Technikai eszköz" : "Hónap"}</span><Button variant="ghost" size="icon" className="size-7" aria-label="Választó bezárása" onClick={onClose}><X /></Button></div>
        {searchable && (
          <label className="mb-2 flex items-center gap-2 rounded-md bg-secondary px-2 py-1.5">
            <Search className="size-4 text-muted-foreground" />
            <input
              aria-label="Eszköz keresése" autoFocus value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && list[0]) onSelect(list[0].idx); }}
              placeholder="Keresés: rendszám, típus…"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {query && <span className="text-[10px] text-muted-foreground">{list.length} db</span>}
          </label>
        )}
        <div className="mb-1 text-center text-[10px] text-muted-foreground">
          Húzd az ujjad a pörgetéshez, koppints a kiemelt sorra{canReorder && !query ? " · hosszan nyomva áthelyezhető" : ""}
        </div>
        <div className="relative">
          <div
            aria-hidden
            style={{ top: TOP * ITEM, height: ITEM, transform: `translateY(${drag ? 0 : lens * ITEM}px)`, opacity: drag ? 0 : 1 }}
            className={`wheel-lens pointer-events-none absolute inset-x-2 ${scrubbing ? "is-moving" : ""}`}
          />
          <div
            ref={ref}
            role="listbox"
            tabIndex={0}
            aria-activedescendant={list[focus] ? `wheel-opt-${focus}` : undefined}
            onScroll={() => setScroll(ref.current?.scrollTop ?? 0)}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onWheel={onWheel}
            onKeyDown={onKey}
            onContextMenu={(e) => e.preventDefault()}
            className="no-scrollbar wheel-mask relative touch-none overflow-hidden outline-none"
            style={{ height: `min(${ITEM * VIS}px, calc(100dvh - 9rem))`, overscrollBehavior: "contain" }}
          >
            <div style={{ height: ITEM * TOP }} />
            {list.length === 0 && <div className="py-2 text-center text-sm text-muted-foreground">Nincs találat</div>}
            {list.map((it, i) => {
              const isDrag = drag?.pos === i;
              const isFocus = !drag && i === focus;
              const dist = Math.abs(i * ITEM - scroll - lens * ITEM) / ITEM;
              const shift = drag && !isDrag ? (i > drag.pos && i <= target ? -ITEM : i < drag.pos && i >= target ? ITEM : 0) : 0;
              return (
                <div
                  key={it.label}
                  id={`wheel-opt-${i}`}
                  role="option"
                  aria-selected={isFocus}
                  className={`wheel-item flex w-full select-none items-center justify-center px-3 font-display text-lg font-semibold ${isFocus ? "is-focus text-accent" : "text-foreground"} ${isDrag ? "relative z-10 rounded-md bg-primary text-primary-foreground shadow-xl ring-2 ring-accent" : ""}`}
                  style={{
                    height: ITEM,
                    transform: isDrag ? `translateY(${rel}px) scale(1.04)` : `translateY(${shift}px) scale(${isFocus ? 1.16 : 1})`,
                    opacity: drag ? 1 : Math.max(0.3, 1 - dist * 0.16),
                    WebkitTouchCallout: "none",
                  }}
                >
                  <span className="block min-w-0 max-w-[90%] truncate">{it.label}</span>
                </div>
              );
            })}
            <div style={{ height: ITEM * PAD }} />
          </div>
        </div>
      </div>
    </div>
  );
}
