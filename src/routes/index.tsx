import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronDown, Plus, Trash2, AlertTriangle, X } from "lucide-react";
import { WheelPicker } from "@/components/WheelPicker";
import {
  MONTHS, useFleet, actions, newDevice, latestUpTo, monthStats, cumulative, daysLeft, expiryState, uid,
  type Device, type MonthEntry,
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

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
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
    if (devices.length && !devices.find((d) => d.id === devId)) setDevId(devices[0].id);
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
          onSelect={(i) => { setDevId(devices[i].id); setPicker(null); }} onClose={() => setPicker(null)} />
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

function Sheet({ dev, month }: { dev: Device; month: number }) {
  const up = (p: Partial<Device>) => actions.update(dev.id, p);
  const latest = latestUpTo(dev, month);
  const inherited = latest && latest.month !== month;
  const entry: MonthEntry = latest?.entry ?? { odometer: null, fuelIn: null, fuelUsed: null, note: "" };
  const setEntry = (p: Partial<MonthEntry>) => {
    const base = inherited ? { ...entry, fuelIn: null, fuelUsed: null } : entry;
    actions.setMonth(dev.id, month, { ...base, ...p });
  };
  const s = monthStats(dev, month);
  const c = cumulative(dev, month);
  const allowedToDate = (dev.yearlyAllowed / 12) * (month + 1);
  const u = dev.unit;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <section className="grid grid-cols-6 gap-1.5 rounded-lg border bg-card p-2">
        <Field className="col-span-3" label="Azonosító" type="text" value={dev.plate} onChange={(v) => up({ plate: v })} />
        <Field className="col-span-3" label="Típus" type="text" value={dev.type} onChange={(v) => up({ type: v })} />
        <Field className="col-span-2" label="Besorolás" type="text" value={dev.category} onChange={(v) => up({ category: v })} />
        <label className="col-span-2 flex flex-col rounded-md bg-secondary px-2 py-1">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Mértékegység</span>
          <select value={u} onChange={(e) => up({ unit: e.target.value as Device["unit"] })} className="bg-transparent font-mono text-sm outline-none">
            <option value="km">km</option><option value="üó">üzemóra</option>
          </select>
        </label>
        <Field className="col-span-2" label={u === "km" ? "Norma l/100km" : "Norma l/üó"} value={dev.norm || ""} onChange={(v) => up({ norm: num(v) ?? 0 })} />
        <Field className="col-span-3" label={`Évi engedélyezett ${u}`} value={dev.yearlyAllowed || ""} onChange={(v) => up({ yearlyAllowed: num(v) ?? 0 })} />
        <Field className="col-span-3" label={`Nyitó ${u} állás (jan. 1.)`} value={dev.startOdometer || ""} onChange={(v) => up({ startOdometer: num(v) ?? 0 })} />
      </section>

      <section className="rounded-lg border bg-card p-2">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="font-display text-sm font-bold uppercase tracking-wider">{MONTHS[month]} – havi adatok</h2>
          {inherited && <span className="rounded bg-accent px-1.5 text-[10px] text-muted-foreground">göngyölítve: {MONTHS[latest!.month]}</span>}
          {!latest && <span className="text-[10px] text-muted-foreground">nincs bejegyzés</span>}
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <Field label={`${u} állás hó végén`} value={entry.odometer} onChange={(v) => setEntry({ odometer: num(v) })} />
          <Field label="Tankolt (l)" value={inherited ? "" : entry.fuelIn} onChange={(v) => setEntry({ fuelIn: num(v) })} />
          <Field label="Tény. fogy. (l)" value={inherited ? "" : entry.fuelUsed} onChange={(v) => setEntry({ fuelUsed: num(v) })} />
        </div>
        <div className="mt-1.5 grid grid-cols-4 gap-1.5">
          <Stat label={`Telj. ${u}`} value={fmt(s.used)} />
          <Stat label="Norma (l)" value={fmt(s.normFuel, 1)} />
          <Stat label="Tényl. (l)" value={fmt(s.actual, 1)} />
          <Stat label={s.diff >= 0 ? "Megtakarítás" : "Túlfogyasztás"} value={fmt(Math.abs(s.diff), 1)} tone={s.diff > 0 ? "good" : s.diff < 0 ? "bad" : undefined} />
        </div>
      </section>

      <section className="rounded-lg border bg-card p-2">
        <h2 className="mb-1 font-display text-sm font-bold uppercase tracking-wider">Göngyölítve jan.–{MONTHS[month].slice(0, 3).toLowerCase()}.</h2>
        <div className="grid grid-cols-4 gap-1.5">
          <Stat label={`Telj. ${u}`} value={fmt(c.used)} tone={dev.yearlyAllowed && c.used > allowedToDate ? "bad" : undefined} />
          <Stat label={`Kereten (${u})`} value={dev.yearlyAllowed ? fmt(allowedToDate) : "—"} />
          <Stat label="Tankolt (l)" value={fmt(c.fuelIn, 1)} />
          <Stat label={c.diff >= 0 ? "Megtakarítás" : "Túlfogyasztás"} value={fmt(Math.abs(c.diff), 1)} tone={c.diff > 0 ? "good" : c.diff < 0 ? "bad" : undefined} />
        </div>
        {dev.yearlyAllowed > 0 && (
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary">
            <div className={`h-full ${c.used > allowedToDate ? "bg-destructive" : "bg-primary"}`} style={{ width: `${Math.min(100, (c.used / dev.yearlyAllowed) * 100)}%` }} />
          </div>
        )}
      </section>

      <section className="flex min-h-0 flex-1 flex-col rounded-lg border bg-card p-2">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="font-display text-sm font-bold uppercase tracking-wider">Okmányok, vizsgák</h2>
          <button onClick={() => up({ docs: [...dev.docs, { id: uid(), name: "Új okmány", number: "", expiry: "" }] })} className="flex items-center gap-1 text-xs text-primary"><Plus className="size-3" />Okmány</button>
        </div>
        <div className="no-scrollbar flex min-h-0 flex-col gap-1 overflow-y-auto">
          {dev.docs.map((doc) => {
            const days = daysLeft(doc.expiry);
            const st = expiryState(days);
            const setDoc = (p: Partial<typeof doc>) => up({ docs: dev.docs.map((x) => (x.id === doc.id ? { ...x, ...p } : x)) });
            return (
              <div key={doc.id} className={`grid grid-cols-[1.3fr_1fr_1.25fr_auto] items-center gap-1 rounded-md border-l-4 bg-secondary px-1.5 py-1 ${st === "expired" ? "border-l-destructive" : st === "soon" ? "border-l-warning" : st === "ok" ? "border-l-success" : "border-l-border"}`}>
                <input value={doc.name} onChange={(e) => setDoc({ name: e.target.value })} className="min-w-0 bg-transparent text-xs font-semibold outline-none" />
                <input value={doc.number} placeholder="szám" onChange={(e) => setDoc({ number: e.target.value })} className="min-w-0 bg-transparent font-mono text-xs outline-none placeholder:text-muted-foreground" />
                <div className="min-w-0">
                  <input type="date" value={doc.expiry} onChange={(e) => setDoc({ expiry: e.target.value })} className="w-full min-w-0 bg-transparent font-mono text-[11px] outline-none" />
                  {days != null && <div className={`text-[10px] ${st === "expired" ? "text-destructive" : st === "soon" ? "text-warning" : "text-muted-foreground"}`}>{days < 0 ? `lejárt ${-days} napja` : `${days} nap van hátra`}</div>}
                </div>
                <button aria-label="Okmány törlése" onClick={() => up({ docs: dev.docs.filter((x) => x.id !== doc.id) })} className="text-muted-foreground"><X className="size-3.5" /></button>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
