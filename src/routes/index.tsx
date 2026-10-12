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

const cell = "w-full min-w-0 bg-transparent px-0.5 font-mono text-[11px] outline-none text-right";

function Sheet({ dev, month }: { dev: Device; month: number }) {
  const up = (p: Partial<Device>) => actions.update(dev.id, p);
  const latest = latestUpTo(dev, month);
  const inherited = latest != null && latest !== month;
  const rows = latest != null ? (dev.months[latest] ?? []) : [];
  const own = dev.months[month] ?? [];
  const s = monthStats(dev, latest ?? month);
  const c = cumulative(dev, month);
  const allowedToDate = (dev.yearlyAllowed / 12) * (month + 1);
  const u = dev.unit;

  const autoDiff = (r: Row) => (dev.norm > 0 ? Math.round(((u === "km" ? ((r.weightedKm || r.km) * dev.norm) / 100 : r.km * dev.norm) - r.fuel) * 10) / 10 : r.diff);
  const setRow = (id: string, p: Partial<Row>) => {
    const list = own.map((r, i) => {
      if (r.id !== id) return r;
      const n = { ...r, ...p };
      if (p.odometer !== undefined) {
        const prev = i > 0 ? own[i - 1]!.odometer : lastOdometer(dev, month - 1);
        n.km = Math.max(0, n.odometer - prev);
      }
      if (p.diff === undefined) n.diff = autoDiff(n);
      return n;
    });
    actions.setRows(dev.id, month, list);
  };
  const addRow = () => {
    const odo = own.length ? own[own.length - 1]!.odometer : lastOdometer(dev, month - 1);
    const lastNo = Number(own.at(-1)?.docNo ?? rows.at(-1)?.docNo);
    actions.setRows(dev.id, month, [...own, { id: uid(), docNo: Number.isFinite(lastNo) ? String(lastNo + 1) : "", odometer: odo, km: 0, weightedKm: 0, fuel: 0, diff: 0 }]);
  };
  const resetYear = () => {
    if (confirm("Új év indítása: MINDEN eszköz havi bejegyzései törlődnek. A nyitó állás az utolsó ismert állás lesz, az eszközök és okmányok megmaradnak. Folytatod?")) actions.resetYear();
  };
  const tone = (v: number) => (v > 0 ? "good" : v < 0 ? "bad" : undefined);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5">
      <section className="grid grid-cols-6 gap-1 rounded-lg border bg-card p-1.5">
        <Field className="col-span-2" label="Azonosító" type="text" value={dev.plate} onChange={(v) => up({ plate: v })} />
        <Field className="col-span-3" label="Típus" type="text" value={dev.type} onChange={(v) => up({ type: v })} />
        <Field className="col-span-1" label="Bes." type="text" value={dev.category} onChange={(v) => up({ category: v })} />
        <label className="col-span-1 flex min-w-0 flex-col rounded-md bg-secondary px-1.5 py-1">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Egys.</span>
          <select value={u} onChange={(e) => up({ unit: e.target.value as Device["unit"] })} className="bg-transparent font-mono text-sm outline-none">
            <option value="km">km</option><option value="üó">üó</option>
          </select>
        </label>
        <Field className="col-span-1" label={u === "km" ? "l/100" : "l/üó"} value={dev.norm || ""} onChange={(v) => up({ norm: num(v) ?? 0 })} />
        <Field className="col-span-2" label={`Évi keret ${u}`} value={dev.yearlyAllowed || ""} onChange={(v) => up({ yearlyAllowed: num(v) ?? 0 })} />
        <Field className="col-span-2" label={`Nyitó ${u}`} value={dev.startOdometer || ""} onChange={(v) => up({ startOdometer: num(v) ?? 0 })} />
      </section>

      <section className="flex min-h-0 flex-[1.4] flex-col rounded-lg border bg-card p-1.5">
        <div className="mb-1 flex items-center gap-2">
          <h2 className="font-display text-sm font-bold uppercase tracking-wider">{MONTHS[month]}</h2>
          {inherited && <span className="rounded bg-accent px-1.5 text-[10px] text-muted-foreground">göngyölítve: {MONTHS[latest]}</span>}
          {latest == null && <span className="text-[10px] text-muted-foreground">nincs bejegyzés</span>}
          <button onClick={addRow} className="ml-auto flex items-center gap-1 text-xs text-primary"><Plus className="size-3" />Sor</button>
          <button onClick={resetYear} aria-label="Új év (reset)" className="flex items-center gap-1 rounded border px-1.5 text-[10px] text-muted-foreground"><RotateCcw className="size-3" />Új év</button>
        </div>
        <div className="grid grid-cols-[1fr_1.5fr_1fr_1fr_1fr_1fr_14px] gap-x-1 border-b pb-0.5 text-right text-[9px] uppercase text-muted-foreground">
          <span className="text-left">Okm.sz.</span><span>{u} állás</span><span>Telj.</span><span>Súly.</span><span>Üa. l</span><span>M/T</span><span />
        </div>
        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
          {rows.map((r) => (
            <div key={r.id} className={`grid grid-cols-[1fr_1.5fr_1fr_1fr_1fr_1fr_14px] items-center gap-x-1 border-b border-border/50 py-0.5 ${inherited ? "opacity-60" : ""}`}>
              {inherited ? (
                <>
                  <span className="truncate font-mono text-[11px]">{r.docNo}</span>
                  <span className={cell}>{fmt(r.odometer, 1)}</span><span className={cell}>{fmt(r.km, 1)}</span><span className={cell}>{fmt(r.weightedKm)}</span>
                  <span className={cell}>{fmt(r.fuel, 1)}</span><span className={cell}>{fmt(r.diff, 1)}</span><span />
                </>
              ) : (
                <>
                  <input value={r.docNo} onChange={(e) => setRow(r.id, { docNo: e.target.value })} className={`${cell} text-left`} />
                  <input inputMode="decimal" value={r.odometer} onChange={(e) => setRow(r.id, { odometer: num(e.target.value) ?? 0 })} className={cell} />
                  <input inputMode="decimal" value={r.km} onChange={(e) => setRow(r.id, { km: num(e.target.value) ?? 0 })} className={cell} />
                  <input inputMode="decimal" value={r.weightedKm} onChange={(e) => setRow(r.id, { weightedKm: num(e.target.value) ?? 0 })} className={cell} />
                  <input inputMode="decimal" value={r.fuel} onChange={(e) => setRow(r.id, { fuel: num(e.target.value) ?? 0 })} className={cell} />
                  <input inputMode="decimal" value={r.diff} onChange={(e) => setRow(r.id, { diff: num(e.target.value) ?? 0 })} className={`${cell} ${r.diff > 0 ? "text-success" : r.diff < 0 ? "text-destructive" : ""}`} />
                  <button aria-label="Sor törlése" onClick={() => actions.setRows(dev.id, month, own.filter((x) => x.id !== r.id))} className="text-muted-foreground"><X className="size-3" /></button>
                </>
              )}
            </div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-4 gap-1">
          <Stat label={`Havi ${u}`} value={fmt(s.km, 1)} />
          <Stat label="Havi üa. l" value={fmt(s.fuel, 1)} />
          <Stat label={s.diff >= 0 ? "Megtak." : "Túlfogy."} value={fmt(Math.abs(s.diff), 1)} tone={tone(s.diff)} />
          <Stat label={`Állás`} value={fmt(lastOdometer(dev, month), 1)} />
        </div>
      </section>

      <section className="rounded-lg border bg-card p-1.5">
        <h2 className="mb-1 font-display text-xs font-bold uppercase tracking-wider">Göngyölítve jan.–{MONTHS[month]!.slice(0, 3).toLowerCase()}.</h2>
        <div className="grid grid-cols-4 gap-1">
          <Stat label={`Telj. ${u}`} value={fmt(c.km, 1)} tone={dev.yearlyAllowed && c.km > allowedToDate ? "bad" : undefined} />
          <Stat label={`Keret ${u}`} value={dev.yearlyAllowed ? fmt(allowedToDate) : "—"} />
          <Stat label="Üzemanyag l" value={fmt(c.fuel, 1)} />
          <Stat label={c.diff >= 0 ? "Megtak." : "Túlfogy."} value={fmt(Math.abs(c.diff), 1)} tone={tone(c.diff)} />
        </div>
      </section>

      <section className="flex min-h-0 flex-1 flex-col rounded-lg border bg-card p-1.5">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="font-display text-xs font-bold uppercase tracking-wider">Okmányok, vizsgák</h2>
          <button onClick={() => up({ docs: [...dev.docs, { id: uid(), name: "Új okmány", number: "", expiry: "" }] })} className="flex items-center gap-1 text-xs text-primary"><Plus className="size-3" />Okmány</button>
        </div>
        <div className="no-scrollbar flex min-h-0 flex-col gap-1 overflow-y-auto">
          {dev.docs.map((doc) => {
            const days = daysLeft(doc.expiry);
            const st = expiryState(days);
            const setDoc = (p: Partial<typeof doc>) => up({ docs: dev.docs.map((x) => (x.id === doc.id ? { ...x, ...p } : x)) });
            return (
              <div key={doc.id} className={`grid grid-cols-[1.3fr_1fr_1.25fr_auto] items-center gap-1 rounded-md border-l-4 bg-secondary px-1.5 py-0.5 ${st === "expired" ? "border-l-destructive" : st === "soon" ? "border-l-warning" : st === "ok" ? "border-l-success" : "border-l-border"}`}>
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
