import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const ITEM = 46;
const TOP = 2;

/** Ékezet-, kis/nagybetű-, szóköz- és kötőjel-független összehasonlítás */
export const norm = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[\s\-./·]+/g, "");

function score(item: string, q: string) {
  const n = norm(item);
  if (!q) return 1;
  if (n.startsWith(q)) return 4;
  if (n.includes(q)) return 3;
  // szavankénti egyezés (pl. "man 26" -> MAN 26480)
  const words = q.length ? item.toLowerCase().split(/\s+/) : [];
  if (words.some((w) => norm(w).startsWith(q))) return 2;
  // betűsorrend (pl. "ha157" -> HA 00-157)
  let i = 0;
  for (const ch of n) if (ch === q[i]) i++;
  return i === q.length ? 1 : 0;
}

export function WheelPicker({
  items, value, onSelect, onClose, searchable = false, onReorder,
}: { items: string[]; value: number; onSelect: (i: number) => void; onClose: () => void; searchable?: boolean; onReorder?: ((from: number, to: number) => void) | undefined }) {
  const [drag, setDrag] = useState<{ pos: number; y0: number; dy: number; s0: number } | null>(null);
  const pointerY = useRef(0);
  const VIS = 9, PAD = 6;
  const press = useRef<{ t: ReturnType<typeof setTimeout>; y: number } | null>(null);
  const justDragged = useRef(false);
  const canReorder = !!onReorder;
  const ref = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [scroll, setScroll] = useState(0);
  const [lensY, setLensY] = useState<number | null>(null);
  const snapTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const activePointer = useRef(false);

  const snap = () => {
    const el = ref.current;
    if (!el || activePointer.current || justDragged.current) return;
    const pos = Math.max(0, Math.min(list.length - 1, Math.round(el.scrollTop / ITEM)));
    el.scrollTo({ top: pos * ITEM, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  };

  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("keydown", key); clearTimeout(snapTimer.current); if (press.current) clearTimeout(press.current.t); };
  }, [onClose]);

  const list = useMemo(() => {
    const q = norm(query);
    const all = items.map((label, idx) => ({ label, idx, s: score(label, q) })).filter((x) => x.s > 0);
    return q ? all.sort((a, b) => b.s - a.s) : all;
  }, [items, query]);

  useEffect(() => {
    const pos = query ? 0 : Math.max(0, list.findIndex((x) => x.idx === value));
    ref.current?.scrollTo({ top: pos * ITEM });
    setScroll(pos * ITEM);
  }, [query, value, list]);

  useEffect(() => {
    if (!drag) return;
    const el = ref.current;
    const block = (e: TouchEvent) => e.preventDefault();
    el?.addEventListener("touchmove", block, { passive: false });
    return () => el?.removeEventListener("touchmove", block);
  }, [!!drag]);

  useEffect(() => {
    if (!drag) return;
    let raf = 0, t0 = performance.now();
    const tick = (t: number) => {
      const el = ref.current;
      if (el) {
        const r = el.getBoundingClientRect(), zone = r.height * 0.12, y = pointerY.current;
        const depth = y < r.top + zone ? -(r.top + zone - y) / zone : y > r.bottom - zone ? (y - (r.bottom - zone)) / zone : 0;
        if (depth) {
          const accel = Math.min(2, 1 + (t - t0) / 3000);
          el.scrollTop += Math.sign(depth) * Math.min(1, Math.abs(depth)) * 1.6 * accel;
          setScroll(el.scrollTop);
        } else t0 = t;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [!!drag]);

  const rel = drag ? drag.dy + scroll - drag.s0 : 0;
  const target = drag ? Math.max(0, Math.min(list.length - 1, drag.pos + Math.round(rel / ITEM))) : -1;
  const startPress = (pos: number, y: number) => {
    if (!canReorder || query) return;
    press.current = { y, t: setTimeout(() => { setDrag({ pos, y0: y, dy: 0, s0: ref.current?.scrollTop ?? 0 }); }, 450) };
  };
  const movePress = (y: number) => {
    pointerY.current = y;
    if (drag) { setDrag({ ...drag, dy: y - drag.y0 }); return; }
    if (press.current && Math.abs(y - press.current.y) > 8) { clearTimeout(press.current.t); press.current = null; }
  };
  const endPress = () => {
    if (press.current) { clearTimeout(press.current.t); press.current = null; }
    if (drag) {
      justDragged.current = true;
      const from = list[drag.pos]?.idx, to = list[target]?.idx;
      if (from !== undefined && to !== undefined && from !== to) onReorder?.(from, to);
      setDrag(null);
    }
    activePointer.current = false;
    setLensY(null);
    clearTimeout(snapTimer.current);
    snapTimer.current = setTimeout(snap, 160);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-background/40 pt-10 backdrop-blur-[2px] animate-in fade-in" onClick={onClose}>
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
        {canReorder && !query && <div className="mb-1 text-center text-[10px] text-muted-foreground">Hosszan nyomva húzással áthelyezhető</div>}
        <div className="relative">
          <div style={{ top: (lensY ?? TOP * ITEM + ITEM / 2) - ITEM / 2, height: ITEM }} className="wheel-lens pointer-events-none absolute inset-x-3" />
          <div
            ref={ref}
            onScroll={() => { setScroll(ref.current?.scrollTop ?? 0); clearTimeout(snapTimer.current); snapTimer.current = setTimeout(snap, 160); }}
            onPointerDown={(e) => { activePointer.current = true; pointerY.current = e.clientY; setLensY(e.clientY - e.currentTarget.getBoundingClientRect().top); justDragged.current = false; }}
            onPointerMove={(e) => { movePress(e.clientY); if (activePointer.current) setLensY(Math.max(ITEM / 2, Math.min(e.currentTarget.clientHeight - ITEM / 2, e.clientY - e.currentTarget.getBoundingClientRect().top))); }}
            onPointerUp={endPress}
            onPointerCancel={endPress}
            className={`no-scrollbar wheel-mask relative ${drag ? "overflow-hidden touch-none" : "overflow-y-scroll"}`}
            style={{ height: `min(${ITEM * VIS}px, calc(100dvh - 9rem))`, WebkitOverflowScrolling: "touch", overscrollBehavior: "contain" }}
          >
            <div style={{ height: ITEM * TOP }} />
            {list.length === 0 && <div className="py-2 text-center text-sm text-muted-foreground">Nincs találat</div>}
            {list.map((it, i) => {
              const offset = (i * ITEM + TOP * ITEM + ITEM / 2 - scroll - (lensY ?? TOP * ITEM + ITEM / 2)) / ITEM;
              const focus = Math.max(0, 1 - Math.abs(offset) / 2.5);
              const isDrag = drag?.pos === i;
              const shift = drag && !isDrag ? (i > drag.pos && i <= target ? -ITEM : i < drag.pos && i >= target ? ITEM : 0) : 0;
              return (
                <Button variant="ghost"
                  key={it.label}
                  onPointerDown={(e) => { startPress(i, e.clientY); if (canReorder && !query) e.currentTarget.setPointerCapture(e.pointerId); }}
                  onContextMenu={(e) => canReorder && e.preventDefault()}
                  onClick={() => { if (justDragged.current) { justDragged.current = false; return; } onSelect(it.idx); }}
                  className={`wheel-item flex w-full shrink-0 select-none items-center justify-center rounded-none px-3 font-display text-lg font-semibold ${Math.abs(offset) < 0.55 ? "text-accent" : "text-foreground"} ${isDrag ? "relative z-10 rounded-md bg-primary text-primary-foreground shadow-xl ring-2 ring-accent" : ""}`}
                  style={{
                    height: ITEM,
                    transform: isDrag ? `translateY(${rel}px) scale(1.04)` : `translateY(${shift}px) scale(${1 + focus * 0.13})`,
                    opacity: drag ? 1 : Math.max(0.3, 1 - Math.abs(offset) * 0.15),
                    WebkitTouchCallout: "none",
                  }}
                >
                  <span className="block min-w-0 max-w-[90%] truncate">{it.label}</span>
                </Button>
              );
            })}
            <div style={{ height: ITEM * PAD }} />
          </div>
        </div>
      </div>
    </div>
  );
}
