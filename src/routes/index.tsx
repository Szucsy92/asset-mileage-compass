import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronDown, Plus, Trash2, AlertTriangle, X, RotateCcw } from "lucide-react";
import { WheelPicker } from "@/components/WheelPicker";
import {
  MONTHS, useFleet, actions, newDevice, latestUpTo, monthStats, cumulative, daysLeft, expiryState, uid, lastOdometer,
  type Device, type Row,
} from "@/lib/fleet";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Eszköznyilvántartás – km, üzemanyag, okmányok" },
      { name: "description", content: "Technikai eszközök havi göngyölített km/üzemóra, üzemanyag és okmány-lejárat nyilvántartása." },
      { property: "og:title", content: "Eszköznyilvántartás" },
      { property: "og:description", content: "Havi km, üzemanyag, túlfogyasztás és okmány-lejárat figyelés." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

const fmt = (n: number, d = 0) => n.toLocaleString("hu-HU", { maximumFractionDigits: d, minimumFractionDigits: d });
const num = (v: string) => (v === "" ? null : Number(v.replace(",", ".")));

function Field({ label, value, onChange, type = "number", className = "" }: {
  label: string; value: string | number | null | undefined; onChange: (v: string) => void; type?: string; className?: string;
}) {
  return (
    <label className={`flex min-w-0 flex-col rounded-md bg-secondary px-2 py-1 ${className}`}>
      <span className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <input
        type={type}
        inputMode={type === "number" ? "decimal" : undefined}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-w-0 bg-transparent font-mono text-sm outline-none"
      />
    </label>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" | undefined }) {
  return (
    <div className="rounded-md border bg-card px-2 py-1">
      <div className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-mono text-sm font-semibold ${tone === "good" ? "text-success" : tone === "bad" ? "text-destructive" : ""}`}>{value}</div>
    </div>
  );
}

function Index() {
  const { devices } = useFleet();
  const [devId, setDevId] = useState<string | null>(null);
  const [month, setMonth] = useState(0);
  const [picker, setPicker] = useState<"dev" | "month" | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => { setMonth(new Date().getMonth()); }, []);
  useEffect(() => {
    if (devices.length && !devices.find((d) => d.id === devId)) setDevId(devices[0]!.id);
  }, [devices, devId]);

  const dev = devices.find((d) => d.id === devId);
  const devIndex = Math.max(0, devices.findIndex((d) => d.id === devId));

  const alerts = devices.flatMap((d) =>
    d.docs.map((doc) => ({ d, doc, days: daysLeft(doc.expiry) })).filter((x) => x.days != null && x.days <= 30),
  );

  return (
    <main className="mx-auto flex h-dvh max-w-xl flex-col gap-2 overflow-hidden p-2">
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setPicker("dev")} className="flex min-w-0 items-center justify-between gap-1 rounded-lg border bg-card px-3 py-2 text-left">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Technikai eszköz</div>
              <div className="truncate font-display text-lg font-bold leading-tight text-primary">{dev?.plate ?? "—"}</div>
            </div>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          </button>
          <button onClick={() => setPicker("month")} className="flex items-center justify-between rounded-lg border bg-card px-3 py-2 text-left">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Hónap</div>
              <div className="font-display text-lg font-bold leading-tight text-primary">{MONTHS[month]}</div>
            </div>
            <ChevronDown className="size-4 text-muted-foreground" />
          </button>
        </div>
        <div className="flex flex-col gap-1">
          <button aria-label="Új eszköz" onClick={() => setAdding(true)} className="flex flex-1 items-center justify-center rounded-md bg-primary px-2 text-primary-foreground"><Plus className="size-4" /></button>
          <button aria-label="Eszköz törlése" disabled={!dev} onClick={() => dev && confirm(`Törlöd: ${dev.plate}?`) && actions.remove(dev.id)} className="flex flex-1 items-center justify-center rounded-md border px-2 text-destructive"><Trash2 className="size-4" /></button>
        </div>
      </div>

      {alerts.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar rounded-md border border-warning/50 bg-warning/10 px-2 py-1 text-xs">
          <AlertTriangle className="size-4 shrink-0 text-warning" />
          {alerts.map(({ d, doc, days }) => (
            <button key={doc.id} onClick={() => setDevId(d.id)} className={`whitespace-nowrap ${days! < 0 ? "text-destructive" : "text-warning"}`}>
              {d.plate}: {doc.name} {days! < 0 ? `lejárt (${-days!} n.)` : `${days} nap`}
            </button>
          ))}
        </div>
      )}

      {dev ? <Sheet dev={dev} month={month} /> : <p className="p-6 text-center text-muted-foreground">Nincs eszköz. Adj hozzá egyet a + gombbal.</p>}

      {picker === "dev" && devices.length > 0 && (
        <WheelPicker items={devices.map((d) => `${d.plate} · ${d.type}`)} value={devIndex}
          onSelect={(i) => { setDevId(devices[i]!.id); setPicker(null); }} onClose={() => setPicker(null)} />
      )}
      {picker === "month" && (
        <WheelPicker items={MONTHS} value={month} onSelect={(i) => { setMonth(i); setPicker(null); }} onClose={() => setPicker(null)} />
      )}
      {adding && <AddDialog onClose={() => setAdding(false)} onAdd={(d) => { actions.add(d); setDevId(d.id); setAdding(false); }} />}
    </main>
  );
}

function AddDialog({ onClose, onAdd }: { onClose: () => void; onAdd: (d: Device) => void }) {
  const [plate, setPlate] = useState("");
  const [type, setType] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-background/70 pt-24 backdrop-blur-sm animate-in fade-in" onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); if (plate.trim()) onAdd(newDevice(plate.trim(), type.trim())); }}
        className="flex w-80 flex-col gap-2 rounded-xl border bg-popover p-3 animate-in zoom-in-95">
        <div className="font-display text-lg font-bold">Új technikai eszköz</div>
        <Field label="Azonosító / rendszám" type="text" value={plate} onChange={setPlate} />
        <Field label="Típus" type="text" value={type} onChange={setType} />
        <button className="rounded-md bg-primary py-2 font-semibold text-primary-foreground">Hozzáadás</button>
      </form>
    </div>
  );
}

