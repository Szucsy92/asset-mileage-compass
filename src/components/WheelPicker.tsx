import { useEffect, useRef, useState } from "react";

const ITEM = 40;

export function WheelPicker({
  items, value, onSelect, onClose,
}: { items: string[]; value: number; onSelect: (i: number) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState(value * ITEM);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    ref.current?.scrollTo({ top: value * ITEM });
  }, [value]);

  const onScroll = () => {
    const top = ref.current!.scrollTop;
    setScroll(top);
    window.clearTimeout(timer.current);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-background/70 pt-24 backdrop-blur-sm animate-in fade-in" onClick={onClose}>
      <div className="relative w-72 rounded-xl border bg-popover p-2 shadow-2xl animate-in zoom-in-95 slide-in-from-top-4" onClick={(e) => e.stopPropagation()}>
        <div className="pointer-events-none absolute inset-x-2 top-1/2 h-10 -translate-y-1/2 rounded-md border border-primary/60 bg-primary/10" />
        <div
          ref={ref}
          onScroll={onScroll}
          className="no-scrollbar wheel-mask relative snap-y snap-mandatory overflow-y-scroll"
          style={{ height: ITEM * 5, perspective: 600 }}
        >
          <div style={{ height: ITEM * 2 }} />
          {items.map((it, i) => {
            const offset = (i * ITEM - scroll) / ITEM;
            const angle = Math.max(-80, Math.min(80, offset * 22));
            return (
              <button
                key={i}
                onClick={() => onSelect(i)}
                className="flex w-full snap-center items-center justify-center truncate px-3 font-display text-lg font-semibold tracking-wide transition-colors"
                style={{
                  height: ITEM,
                  transform: `rotateX(${-angle}deg)`,
                  opacity: Math.max(0.25, 1 - Math.abs(offset) * 0.3),
                  color: Math.abs(offset) < 0.5 ? "var(--primary)" : undefined,
                }}
              >
                {it}
              </button>
            );
          })}
          <div style={{ height: ITEM * 2 }} />
        </div>
      </div>
    </div>
  );
}
