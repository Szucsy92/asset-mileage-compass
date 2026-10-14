import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";

const ITEM = 40;

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
  const [drag, setDrag] = useState<{ pos: number; y0: number; dy: number } | null>(null);
  const press = useRef<{ t: ReturnType<typeof setTimeout>; y: number } | null>(null);
  const justDragged = useRef(false);
  const canReorder = !!onReorder;
  const ref = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [scroll, setScroll] = useState(0);

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

  const target = drag ? Math.max(0, Math.min(list.length - 1, drag.pos + Math.round(drag.dy / ITEM))) : -1;
  const startPress = (pos: number, y: number) => {
    if (!canReorder || query) return;
    press.current = { y, t: setTimeout(() => { setDrag({ pos, y0: y, dy: 0 }); navigator.vibrate?.(30); }, 450) };
  };
  const movePress = (y: number) => {
    if (drag) { setDrag({ ...drag, dy: y - drag.y0 }); return; }
    if (press.current && Math.abs(y - press.current.y) > 8) { clearTimeout(press.current.t); press.current = null; }
  };
  const endPress = () => {
    if (press.current) { clearTimeout(press.current.t); press.current = null; }
    if (drag) {
      justDragged.current = true;
      const from = list[drag.pos]!.idx, to = list[target]!.idx;
      if (from !== to) onReorder!(from, to);
      setDrag(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-background/70 pt-20 backdrop-blur-sm animate-in fade-in" onClick={onClose}>
      <div className="relative w-80 rounded-xl border bg-popover p-2 shadow-2xl animate-in zoom-in-95 slide-in-from-top-4" onClick={(e) => e.stopPropagation()}>
        {searchable && (
          <label className="mb-2 flex items-center gap-2 rounded-md bg-secondary px-2 py-1.5">
            <Search className="size-4 text-muted-foreground" />
            <input
              autoFocus
              value={query}
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
          <div className="pointer-events-none absolute inset-x-0 top-1/2 h-10 -translate-y-1/2 rounded-md border border-primary/60 bg-primary/10" />
          <div
            ref={ref}
            onScroll={() => setScroll(ref.current!.scrollTop)}
            onPointerMove={(e) => movePress(e.clientY)}
            onPointerUp={endPress}
            onPointerCancel={endPress}
            className={`no-scrollbar wheel-mask relative snap-y snap-mandatory ${drag ? "overflow-hidden touch-none" : "overflow-y-scroll"}`}
            style={{ height: ITEM * 5, perspective: 600 }}
          >
            <div style={{ height: ITEM * 2 }} />
            {list.length === 0 && <div className="py-2 text-center text-sm text-muted-foreground">Nincs találat</div>}
            {list.map((it, i) => {
              const offset = (i * ITEM - scroll) / ITEM;
              const angle = drag ? 0 : Math.max(-80, Math.min(80, offset * 22));
              const isDrag = drag?.pos === i;
              const shift = drag && !isDrag ? (i > drag.pos && i <= target ? -ITEM : i < drag.pos && i >= target ? ITEM : 0) : 0;
              return (
                <button
                  key={it.idx}
                  onPointerDown={(e) => startPress(i, e.clientY)}
                  onContextMenu={(e) => canReorder && e.preventDefault()}
                  onClick={() => { if (justDragged.current) { justDragged.current = false; return; } onSelect(it.idx); }}
                  className={`flex w-full snap-center select-none items-center justify-center truncate px-3 font-display text-lg font-semibold tracking-wide ${isDrag ? "relative z-10 rounded-md bg-primary text-primary-foreground shadow-xl" : "transition-transform"}`}
                  style={{
                    height: ITEM,
                    transform: isDrag ? `translateY(${drag!.dy}px) scale(1.05)` : `translateY(${shift}px) rotateX(${-angle}deg)`,
                    opacity: drag ? 1 : Math.max(0.25, 1 - Math.abs(offset) * 0.3),
                    color: isDrag ? undefined : !drag && Math.abs(offset) < 0.5 ? "var(--primary)" : undefined,
                    WebkitTouchCallout: "none",
                  }}
                >
                  {it.label}
                </button>
              );
            })}
            <div style={{ height: ITEM * 2 }} />
          </div>
        </div>
      </div>
    </div>
  );
}
