import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Plus, Trash2, AlertTriangle, X, Lock, CalendarPlus, Upload, Download, FileSpreadsheet } from "lucide-react";
import { WheelPicker } from "@/components/WheelPicker";
import { Button } from "@/components/ui/button";
import { ServicePanel } from "@/components/ServicePanel";
import { compareDeadlines } from "@/lib/maintenance";
import {
  MONTHS, useFleet, actions, newDevice, latestUpTo, monthStats, cumulative, daysLeft, expiryState, uid, lastOdometer, openYear, closeYear,
  type Device, type Row,
} from "@/lib/fleet";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Technikaieszköz_nyilvántartás" },
      { name: "description", content: "Technikai eszközök havi göngyölített km/üzemóra, üzemanyag és okmány-lejárat nyilvántartása." },
      { property: "og:title", content: "Technikaieszköz_nyilvántartás" },
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

function CountUp({ value }: { value: string }) {
  const target = Number(value.replace(/[\s\u00a0]/g, "").replace(",", "."));
  const [shown, setShown] = useState(value);
  const prev = useRef(0);
  useEffect(() => {
    if (!isFinite(target) || value.trim() === "") { setShown(value); return; }
    const from = prev.current, t0 = performance.now(), dec = value.includes(",") ? 1 : 0;
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / 400), e = 1 - Math.pow(1 - p, 3);
      setShown((from + (target - from) * e).toLocaleString("hu-HU", { minimumFractionDigits: dec, maximumFractionDigits: dec }));
      if (p < 1) raf = requestAnimationFrame(step); else { setShown(value); prev.current = target; }
    };
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); prev.current = target; };
  }, [value]);
  return <>{shown}</>;
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" | "warn" | undefined }) {
  return (
    <div className={`rounded-md border bg-card px-2 py-1 ${tone === "bad" ? "neon-pulse-bad" : ""}`}>
      <div className="truncate text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-mono text-sm font-semibold ${tone === "good" ? "text-success" : tone === "bad" ? "text-destructive" : tone === "warn" ? "text-warning" : ""}`}><CountUp value={value} /></div>
    </div>
  );
}

function Index() {
  const { devices, years, year, closed, status } = useFleet();
  const [devId, setDevId] = useState<string | null>(null);
  const [month, setMonth] = useState(0);
  const [picker, setPicker] = useState<"dev" | "month" | null>(null);
  const [adding, setAdding] = useState(false);
  const [xlsOpen, setXlsOpen] = useState(false);

  useEffect(() => { setMonth(new Date().getMonth()); }, []);
  useEffect(() => {
    if (devices.length && !devices.find((d) => d.id === devId)) {
      setDevId(devices[0]!.id);
      const lm = latestUpTo(devices[0]!, 11);
      if (lm != null) setMonth(lm);
    }
  }, [devices, devId]);

  const dev = devices.find((d) => d.id === devId);
  const devIndex = Math.max(0, devices.findIndex((d) => d.id === devId));

  const alerts = devices.flatMap((d) =>
    d.docs.map((doc) => ({ d, doc, days: daysLeft(doc.expiry) })).filter((x) => x.days != null && x.days <= 30),
  ).sort((a, b) => compareDeadlines(a.days ?? 0, b.days ?? 0));

  return (
    <main className={`mx-auto flex h-[100svh] max-w-xl flex-col gap-2 overflow-hidden p-2 ${alerts.length ? "pb-11" : ""}`}>
      <div className="flex items-center gap-1.5 text-xs">
        <div className="no-scrollbar flex gap-1 overflow-x-auto">
          {years.map((y) => (
            <button key={y.year} onClick={() => openYear(y.year)} className={`flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono ${y.year === year ? "border-primary bg-primary/15 text-primary" : "text-muted-foreground"}`}>
              {y.closed && <Lock className="size-3" />}{y.year}
            </button>
          ))}
        </div>
        <span className={`ml-auto text-[10px] ${status === "error" ? "text-destructive" : "text-muted-foreground"}`}>
          {status === "loading" ? "betöltés…" : status === "saving" ? "mentés…" : status === "error" ? "hiba – nincs mentve" : closed ? "lezárt év – csak olvasható" : "mentve"}
        </span>
        {year != null && (
          <div className="relative">
            <button aria-expanded={xlsOpen} onClick={() => setXlsOpen((o) => !o)} className="flex items-center gap-1 rounded-md border px-2 py-0.5 text-muted-foreground">
              <FileSpreadsheet className="size-3" />Excel<ChevronDown className={`size-3 transition-transform ${xlsOpen ? "rotate-180" : ""}`} />
            </button>
            {xlsOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setXlsOpen(false)} />
                <div role="menu" className="absolute right-0 top-full z-50 mt-1 w-44 overflow-hidden rounded-lg border bg-popover p-1 shadow-2xl animate-in fade-in zoom-in-95">
                  {!closed && (
                    <label role="menuitem" className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-foreground hover:bg-secondary">
                      <Upload className="size-4" />Feltöltés Excelből
                      <input type="file" accept=".xlsx,.xls,.xlsm" className="hidden" onChange={async (e) => {
                        const f = e.target.files?.[0]; e.target.value = ""; setXlsOpen(false);
                        if (!f) return;
                        try {
                          const { parseWorkbook, mergeImport } = await import("@/lib/importXlsx");
                          const parsed = await parseWorkbook(f);
                          if (!parsed.length) { alert("A fájlban nem találtam eszközt (Forgalmi rendszám blokkokat)."); return; }
                          if (!confirm(`${parsed.length} eszközt találtam. A havi adatok frissülnek a fájlból a ${year}. évben (okmányok, beállítások, sorrend megmaradnak). Folytatod?`)) return;
                          const keepNames = confirm("Nevek: az appban lévő azonosítók és típusok maradjanak?\n\nOK = app nevei maradnak (ajánlott)\nMégse = Excel nevei");
                          const r = mergeImport(devices, parsed, keepNames, (p, d) => confirm(`Excel: „${p.plate} · ${p.type}”\nEz azonos ezzel: „${d.plate} · ${d.type}”?\n\nOK = igen, frissítse\nMégse = új eszközként vegye fel`));
                          actions.replaceAll(r.devices);
                          alert(`Kész: ${r.updated} eszköz frissítve, ${r.added} új eszköz hozzáadva.`);
                        } catch { alert("A fájl beolvasása nem sikerült."); }
                      }} />
                    </label>
                  )}
                  <button role="menuitem" onClick={async () => { setXlsOpen(false); const { exportWorkbook } = await import("@/lib/exportXlsx"); exportWorkbook(devices, year); }}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-foreground hover:bg-secondary">
                    <Download className="size-4" />Letöltés Excelbe
                  </button>
                </div>
              </>
            )}
          </div>
        )}
        {!closed && year != null && (
          <button onClick={() => { if (confirm(`${year} lezárása: az összes eszköz teljes éve elmentésre és zárolásra kerül (később visszanézhető), majd független ${year + 1}. év indul üres hónapokkal. Az eszközök, okmányok és a nyitó állás átkerülnek. Folytatod?`)) void closeYear(); }}
            className="flex items-center gap-1 rounded-md bg-primary px-2 py-0.5 font-semibold text-primary-foreground"><CalendarPlus className="size-3" />Új év</button>
        )}
      </div>
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
          <button aria-label="Új eszköz" disabled={closed} onClick={() => setAdding(true)} className="flex flex-1 items-center justify-center rounded-md bg-primary px-2 text-primary-foreground"><Plus className="size-4" /></button>
          <button aria-label="Eszköz törlése" disabled={!dev || closed} onClick={() => dev && confirm(`Törlöd: ${dev.plate}?`) && actions.remove(dev.id)} className="flex flex-1 items-center justify-center rounded-md border px-2 text-destructive"><Trash2 className="size-4" /></button>
        </div>
      </div>

      {dev ? <div className="flex min-h-0 flex-1 flex-col"><Sheet key={dev.id} dev={dev} month={month} closed={closed} /></div> : <p className="p-6 text-center text-muted-foreground">{status === "loading" ? "Betöltés…" : "Nincs eszköz."}</p>}
      <ExpiryBar alerts={alerts} onPick={(id) => setDevId(id)} />

      {picker === "dev" && devices.length > 0 && (
        <WheelPicker searchable items={devices.map((d) => `${d.plate} · ${d.type}`)} value={devIndex}
          onSelect={(i) => { const d = devices[i]!; setDevId(d.id); const lm = latestUpTo(d, 11); if (lm != null) setMonth(lm); setPicker(null); }} onReorder={closed ? undefined : (a, b) => actions.move(a, b)} onClose={() => setPicker(null)} />
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
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-background/40 pt-24 backdrop-blur-[2px] animate-in fade-in" onClick={onClose}>
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

function Sheet({ dev, month, closed }: { dev: Device; month: number; closed: boolean }) {
  const [documentOpen, setDocumentOpen] = useState(false);
  const [detailTab, setDetailTab] = useState<"docs" | "service">("docs");
  const up = (p: Partial<Device>) => actions.update(dev.id, p);
  const latest = latestUpTo(dev, month);
  const inherited = latest != null && latest !== month;
  const rows = latest != null ? (dev.months[latest] ?? []) : [];
  const own = dev.months[month] ?? [];
  const s = monthStats(dev, latest ?? month);
  const c = cumulative(dev, month);
  const u = dev.unit;
  const dd = u === "km" ? 0 : 1;
  const left = dev.yearlyAllowed - c.km;
  const capTone = !dev.yearlyAllowed ? undefined : left < 0 ? "bad" as const : left <= (u === "km" ? 1000 : 100) ? "warn" as const : undefined;

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
  const tone = (v: number) => (v > 0 ? "good" : v < 0 ? "bad" : undefined);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5">
      <fieldset disabled={closed} className="grid grid-cols-9 gap-1 rounded-lg border bg-card p-1.5">
        <Field className="col-span-3" label="Azonosító" type="text" value={dev.plate} onChange={(v) => up({ plate: v })} />
        <Field className="col-span-4" label="Típus" type="text" value={dev.type} onChange={(v) => up({ type: v })} />
        <Field className="col-span-2" label="Bes." type="text" value={dev.category} onChange={(v) => up({ category: v })} />
        <label className="col-span-2 flex min-w-0 flex-col rounded-md bg-secondary px-1.5 py-1">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Egys.</span>
          <select value={u} onChange={(e) => up({ unit: e.target.value as Device["unit"] })} className="w-full min-w-0 bg-transparent font-mono text-sm outline-none">
            <option value="km">km</option><option value="üó">üó</option>
          </select>
        </label>
        <Field className="col-span-2" label={u === "km" ? "l/100" : "l/üó"} value={dev.norm || ""} onChange={(v) => up({ norm: num(v) ?? 0 })} />
        <Field className="col-span-3" label={`Évi keret ${u}`} value={dev.yearlyAllowed || ""} onChange={(v) => up({ yearlyAllowed: num(v) ?? 0 })} />
        <Field className="col-span-2" label={`Nyitó ${u}`} value={dev.startOdometer || ""} onChange={(v) => up({ startOdometer: num(v) ?? 0 })} />
      </fieldset>

      <fieldset disabled={closed} className="flex min-h-0 flex-[1.4] flex-col rounded-lg border bg-card p-1.5">
        <div className="mb-1 flex items-center gap-2">
          <h2 className="font-display text-sm font-bold uppercase tracking-wider">{MONTHS[month]}</h2>
          {inherited && <span className="rounded bg-accent px-1.5 text-[10px] text-muted-foreground">göngyölítve: {MONTHS[latest]}</span>}
          {latest == null && <span className="text-[10px] text-muted-foreground">nincs bejegyzés</span>}
          <button onClick={addRow} className="ml-auto flex items-center gap-1 text-xs text-primary"><Plus className="size-3" />Sor</button>
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
                  <span className={cell}>{fmt(r.odometer, dd)}</span><span className={cell}>{fmt(r.km, dd)}</span><span className={cell}>{fmt(r.weightedKm, dd)}</span>
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
          <Stat label={`Havi ${u}`} value={fmt(s.km, dd)} />
          <Stat label="Havi üa. l" value={fmt(s.fuel, 1)} />
          <Stat label={s.diff >= 0 ? "Megtak." : "Túlfogy."} value={fmt(Math.abs(s.diff), 1)} tone={tone(s.diff)} />
          <Stat label={`Állás`} value={fmt(lastOdometer(dev, month), dd)} />
        </div>
      </fieldset>

      <section className="rounded-lg border bg-card p-1.5">
        <h2 className="mb-1 font-display text-xs font-bold uppercase tracking-wider">Göngyölítve jan.–{MONTHS[month]!.slice(0, 3).toLowerCase()}.</h2>
        <div className="grid grid-cols-4 gap-1">
          <Stat label={`Telj. ${u}`} value={fmt(c.km, dd)} tone={capTone} />
          <Stat label={`Hátra ${u}`} value={dev.yearlyAllowed ? fmt(left, dd) : "—"} tone={capTone} />
          <Stat label="ÜA. l" value={fmt(c.fuel, 1)} />
          <Stat label={c.diff >= 0 ? "Megtak." : "Túlfogy."} value={fmt(Math.abs(c.diff), 1)} tone={tone(c.diff)} />
        </div>
      </section>

      <section className={`flex flex-1 flex-col rounded-lg border bg-card p-1.5 ${detailTab === "service" ? "min-h-[178px]" : "min-h-0"}`}>
        <div className="mb-1 flex items-center justify-between">
          <div role="tablist" aria-label="Eszköz részletei" className="flex min-w-0 gap-1">
            <Button role="tab" aria-selected={detailTab === "docs"} variant="ghost" size="sm" className={`h-6 px-1 font-display text-xs ${detailTab === "docs" ? "text-accent" : "text-muted-foreground"}`} onClick={() => setDetailTab("docs")}>Okmányok, vizsgák</Button>
            <Button role="tab" aria-selected={detailTab === "service"} variant="ghost" size="sm" className={`h-6 px-1 font-display text-xs ${detailTab === "service" ? "text-accent" : "text-muted-foreground"}`} onClick={() => setDetailTab("service")}>Szerviz</Button>
          </div>
          {detailTab === "docs" && <Button disabled={closed} variant="ghost" size="sm" className="h-6 px-1 text-primary" onClick={() => setDocumentOpen(true)}><Plus />Okmány</Button>}
        </div>
        {detailTab === "docs" && <fieldset disabled={closed}><StatusRow dev={dev} /></fieldset>}
        <div className="no-scrollbar flex min-h-0 flex-col gap-1 overflow-y-auto">
          {detailTab === "docs" && dev.docs.map((doc) => {
            const days = daysLeft(doc.expiry);
            const st = expiryState(days);
            const setDoc = (p: Partial<typeof doc>) => up({ docs: dev.docs.map((x) => (x.id === doc.id ? { ...x, ...p } : x)) });
            return (
              <fieldset disabled={closed} key={doc.id} className={`grid grid-cols-[1fr_1fr_auto] items-center gap-1 rounded-md border-l-4 bg-secondary px-1.5 py-0.5 ${st === "expired" ? "border-l-destructive" : st === "soon" ? "border-l-warning" : st === "ok" ? "border-l-success" : "border-l-border"}`}>
                <input aria-label="Okmány neve" value={doc.name} onChange={(e) => setDoc({ name: e.target.value })} className="col-span-2 min-w-0 bg-transparent text-xs font-semibold outline-none" />
                <Button variant="ghost" size="icon" className="size-6 row-span-2 text-muted-foreground" aria-label="Okmány törlése" onClick={() => { if (confirm(`Törlöd az okmányt: ${doc.name}?`)) up({ docs: dev.docs.filter((x) => x.id !== doc.id) }); }}><X /></Button>
                <input aria-label="Okmány száma" value={doc.number} placeholder="szám (nem kötelező)" onChange={(e) => setDoc({ number: e.target.value })} className="min-w-0 bg-transparent font-mono text-xs outline-none placeholder:text-muted-foreground" />
                <div className="min-w-0">
                  <input aria-label="Okmány lejárata" type="date" value={doc.expiry} onChange={(e) => setDoc({ expiry: e.target.value })} className="w-full min-w-0 bg-transparent font-mono text-[11px] outline-none" />
                  {days != null && <div className={`text-[10px] ${st === "expired" ? "text-destructive" : st === "soon" ? "text-warning" : "text-muted-foreground"}`}>{days < 0 ? `lejárt ${-days} napja` : `${days} nap van hátra`}</div>}
                </div>
              </fieldset>
            );
          })}
          {detailTab === "service" && <ServicePanel dev={dev} closed={closed} />}
        </div>
      </section>
      {documentOpen && <DocumentDialog onClose={() => setDocumentOpen(false)} onAdd={(doc) => { up({ docs: [...dev.docs, doc] }); setDocumentOpen(false); }} />}
    </div>
  );
}

function DocumentDialog({ onClose, onAdd }: { onClose: () => void; onAdd: (doc: Device["docs"][number]) => void }) {
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  return <div className="fixed inset-0 z-50 flex items-start justify-center bg-background/40 px-3 pt-16 backdrop-blur-sm" onClick={onClose}>
    <form role="dialog" aria-modal="true" aria-label="Új okmány" className="flex w-full max-w-sm flex-col gap-2 rounded-lg border bg-popover p-3" onClick={e => e.stopPropagation()} onSubmit={e => { e.preventDefault(); if (name.trim()) onAdd({ id: uid(), name: name.trim(), number: number.trim(), expiry }); }}>
      <div className="flex items-center justify-between"><h2 className="font-display text-lg font-bold">Új okmány, vizsga</h2><Button type="button" variant="ghost" size="icon" aria-label="Okmányablak bezárása" onClick={onClose}><X /></Button></div>
      <Field label="Megnevezés" type="text" value={name} onChange={setName} />
      <Field label="Szám (nem kötelező)" type="text" value={number} onChange={setNumber} />
      <Field label="Lejárat (nem kötelező)" type="date" value={expiry} onChange={setExpiry} />
      <Button type="submit" disabled={!name.trim()}><Plus />Hozzáadás</Button>
    </form>
  </div>;
}

const STATUS = [
  { k: "H", label: "Hadrafogható", cls: "bg-success text-primary-foreground" },
  { k: "NH", label: "Nem hadrafogható", cls: "bg-warning text-primary-foreground" },
  { k: "S", label: "Selejt", cls: "bg-destructive text-destructive-foreground" },
] as const;

function StatusRow({ dev }: { dev: Device }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const note = dev.note ?? "";
  return (
    <div className="mb-1 flex items-center gap-1">
      <div className="flex shrink-0 overflow-hidden rounded-md border">
        {STATUS.map((s) => (
          <button key={s.k} title={s.label} onClick={() => actions.update(dev.id, { status: s.k })}
            className={`px-2 py-1 font-mono text-xs font-bold ${dev.status === s.k ? s.cls : "text-muted-foreground"}`}>{s.k}</button>
        ))}
      </div>
      {editing ? (
        <input autoFocus value={note} onBlur={() => setEditing(false)} onChange={(e) => actions.update(dev.id, { note: e.target.value })}
          placeholder="Megjegyzés (állapot, hely…)" className="min-w-0 flex-1 rounded-md bg-secondary px-2 py-1 text-xs outline-none" />
      ) : (
        <button onClick={() => (note.length > 30 ? setOpen(true) : setEditing(true))}
          className={`min-w-0 flex-1 truncate rounded-md bg-secondary px-2 py-1 text-left text-xs ${note ? "" : "text-muted-foreground"}`}>
          {note || "Megjegyzés (állapot, hely…)"}
        </button>
      )}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/40 p-4 backdrop-blur-[2px] animate-in fade-in" onClick={() => setOpen(false)}>
          <div className="flex max-h-[70dvh] w-full max-w-sm flex-col gap-2 rounded-xl border bg-popover p-3 animate-in zoom-in-95" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <span className="font-display text-sm font-bold uppercase tracking-wider">{dev.plate} – megjegyzés</span>
              <button aria-label="Bezárás" onClick={() => setOpen(false)}><X className="size-4" /></button>
            </div>
            <textarea value={note} onChange={(e) => actions.update(dev.id, { note: e.target.value })}
              className="min-h-40 flex-1 resize-none rounded-md bg-secondary p-2 text-sm outline-none" />
          </div>
        </div>
      )}
    </div>
  );
}

type Alert = { d: Device; doc: { id: string; name: string; expiry: string }; days: number | null };
function ExpiryBar({ alerts, onPick }: { alerts: Alert[]; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  if (!alerts.length) return null;
    const line = (a: Alert) => (
    <>
      <span className="font-mono font-bold">{a.d.plate}</span> · {a.doc.name} ·{" "}
      <span className="font-mono">{a.doc.expiry.replaceAll("-", ".")}.</span>{" "}
      ({(a.days ?? 0) < 0 ? `lejárt ${-(a.days ?? 0)} napja` : a.days === 0 ? "ma jár le" : `${a.days} nap`})
    </>
  );
  return (
    <div className="fixed bottom-[max(0.5rem,env(safe-area-inset-bottom))] left-1/2 z-30 -translate-x-1/2">
      <Button variant="ghost" aria-expanded={open} onClick={() => setOpen(true)} className="glass-capsule flex h-7 items-center gap-1.5 rounded-full border border-destructive/60 px-4 py-1 text-xs font-semibold text-destructive">
        <AlertTriangle className="size-3.5" />Lejáró vizsgák
        <span className="rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground">{alerts.length}</span>
      </Button>
      {open && createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div role="dialog" aria-modal="true" aria-label="Lejáró vizsgák" className="glass-bubble fixed bottom-[max(0.5rem,env(safe-area-inset-bottom))] left-1/2 z-50 w-[min(92vw,30rem)] origin-bottom overflow-hidden rounded-2xl border border-destructive/50 text-xs text-destructive">
            <div className="flex items-center gap-1.5 border-b border-destructive/30 px-3 py-1.5 font-semibold">
              <AlertTriangle className="size-3.5" />Lejáró vizsgák ({alerts.length})
              <Button variant="ghost" size="icon" aria-label="Bezárás" onClick={() => setOpen(false)} className="ml-auto size-6"><X /></Button>
            </div>
            <div className="no-scrollbar max-h-[45dvh] overflow-y-auto overscroll-contain">
              {alerts.map((a) => (
                <Button variant="ghost" key={`${a.d.id}-${a.doc.id}`} onClick={() => { onPick(a.d.id); setOpen(false); }} className={`block h-auto w-full whitespace-normal break-words px-3 py-2 text-left text-xs odd:bg-destructive/10 ${(a.days ?? 0) >= 0 ? "text-warning" : "text-destructive"}`}>{line(a)}</Button>
              ))}
            </div>
          </div>
        </>, document.body
      )}
    </div>
  );
}
