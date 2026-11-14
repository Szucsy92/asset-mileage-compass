import { useState, type ReactNode } from "react";
import { Button } from "./ui/button";
import { BACKGROUNDS, GLOWS, LIQUIDS, MOODS, applyMood, type Settings, type Swatch } from "@/lib/water/settings";
import type { Kind } from "@/lib/water/objects";
import { WaterLightControls } from "./WaterLightControls";
import poolImage from "@/assets/pool-floor.jpg";
import seaImage from "@/assets/sea-floor.jpg";
import lakeImage from "@/assets/lake-floor.jpg";

const MOOD_IMAGES = { pool: poolImage, sea: seaImage, lake: lakeImage };

const THINGS: { kind: Kind; label: string; icon: string }[] = [
  { kind: "duck", label: "Kacsa", icon: "🦆" },
  { kind: "boat", label: "Hajó", icon: "⛵" },
  { kind: "ball", label: "Labda", icon: "🏐" },
  { kind: "ring", label: "Úszógumi", icon: "🛟" },
  { kind: "koi", label: "Bohóchal", icon: "🐠" },
  { kind: "tang", label: "Kék hal", icon: "🐟" },
  { kind: "perch", label: "Zöld hal", icon: "🐡" },
  { kind: "shark", label: "Cápa", icon: "🦈" },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="font-display text-sm tracking-wide text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  );
}

function Swatches({ list, value, onPick }: { list: Swatch[]; value: number; onPick: (i: number) => void }) {
  return (
    <div className="flex gap-3">
      {list.map((s, i) => (
        <Button variant="ghost"
          key={s.name}
          onClick={() => onPick(i)}
          className="swatch"
          data-active={value === i}
          data-clear={s.hex === "transparent"}
          style={s.hex === "transparent" ? undefined : { background: s.hex }}
          aria-label={s.name}
          title={s.name}
        />
      ))}
    </div>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <Button variant="ghost" className="toggle-row" onClick={() => onChange(!on)} role="switch" aria-checked={on}>
      <span>{label}</span>
      <span className="toggle" data-on={on}>
        <span />
      </span>
    </Button>
  );
}

function Slider({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm">{label}</span>
      <input type="range" className="neon-range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

export function SettingsPanel(props: {
  settings: Settings;
  onChange: (p: Partial<Settings>) => void;
  onAdd: (k: Kind) => void;
  onClear: () => void;
  onLevel: () => void;
  onClose: () => void;
}) {
  const { settings: s, onChange } = props;
  const [preview, setPreview] = useState<"light" | "depth" | null>(null);
  return (
    <div className="sheet-veil" data-preview={preview ?? undefined} onPointerDown={(e) => !preview && e.target === e.currentTarget && props.onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Beállítások">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl text-primary text-glow">Beállítások</h2>
          <Button variant="ghost" onClick={props.onClose} className="btn-ghost">Kész</Button>
        </div>

        <Section title="Világ">
          <div className="mood-grid">
            {MOODS.map((m) => (
              <Button key={m.id} variant="ghost" className="mood-card" aria-pressed={s.mood === m.id}
                onClick={() => onChange(applyMood(s, m.id))}>
                <img src={MOOD_IMAGES[m.id]} alt="" width={768} height={512} loading="lazy" />
                <span>{m.label}</span>
              </Button>
            ))}
          </div>
        </Section>

        <WaterLightControls settings={s} onChange={onChange} onPreview={setPreview} />

        <Section title="Tegyél valamit a vízbe">
          <div className="grid grid-cols-4 gap-2">
            {THINGS.map((t) => (
              <Button variant="ghost" key={t.kind} className="thing-btn" onClick={() => props.onAdd(t.kind)}>
                <span className="text-2xl">{t.icon}</span>
                <span className="text-xs">{t.label}</span>
              </Button>
            ))}
          </div>
          <Button variant="ghost" className="btn-ghost w-full" onClick={props.onClear}>Mindent kiveszek</Button>
        </Section>

        <Section title="Háttér">
          <Swatches list={BACKGROUNDS} value={s.bg} onPick={(i) => onChange({ bg: i })} />
        </Section>

        <Section title="Folyadék">
          <Swatches list={LIQUIDS} value={s.liquid} onPick={(i) => onChange({ liquid: i })} />
        </Section>

        <Section title="Ragyogás">
          <Toggle label="Ragyogó hullámok" on={s.glowOn} onChange={(v) => onChange({ glowOn: v })} />
          {s.glowOn && (
            <>
              <Slider label="Erősség" value={s.glowAmount} min={0.05} max={1} step={0.05} onChange={(v) => onChange({ glowAmount: v })} />
              <Swatches list={GLOWS} value={s.glowColor} onPick={(i) => onChange({ glowColor: i })} />
            </>
          )}
        </Section>

        <Section title="Hullámok">
          <Slider label="Sebesség" value={s.waveSpeed} min={1} max={3} step={0.25} onChange={(v) => onChange({ waveSpeed: v })} />
          <Slider label="Meddig hullámzik" value={s.waveLife} min={0} max={1} step={0.05} onChange={(v) => onChange({ waveLife: v })} />
        </Section>

        <Section title="Döntés">
          <Toggle label="A telefon döntése mozgatja a vizet" on={s.tiltOn} onChange={(v) => onChange({ tiltOn: v })} />
          <Button variant="ghost" className="btn-ghost w-full" onClick={props.onLevel}>A mostani helyzet legyen a vízszintes</Button>
        </Section>

        <Section title="Gyerekzár">
          <Button variant="ghost" className="btn-neon w-full" onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}>
            Teljes képernyő
          </Button>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p><b className="text-foreground">iPhone:</b> Beállítások → Kisegítő lehetőségek → Irányított hozzáférés bekapcsolása. Az appban nyomd meg háromszor az oldalsó gombot.</p>
            <p><b className="text-foreground">Android:</b> Beállítások → Biztonság → Alkalmazás rögzítése. Majd az alkalmazásváltóban rögzítsd ezt az appot.</p>
            <p>Tipp: a böngésző Megosztás menüjében a „Hozzáadás a kezdőképernyőhöz” után saját ikonról indul.</p>
          </div>
        </Section>
      </div>
    </div>
  );
}
