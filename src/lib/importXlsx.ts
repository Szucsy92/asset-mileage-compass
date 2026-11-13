import { newDevice, uid, type Device, type Row } from "@/lib/fleet";
import { isOilService, oilDue, serviceDue, type Service } from "@/lib/maintenance";
import { norm } from "@/lib/text";
import { parseBuffer, type Extras, type Parsed } from "@/lib/xlsxParse";

export type { Extras, Parsed };

/** Az eredeti nyilvántartó táblázat beolvasása fájlból (tesztekhez és tartalékként; az app háttérszálon olvas) */
export async function parseWorkbook(file: File): Promise<Parsed[]> {
  return parseBuffer(await file.arrayBuffer());
}

/** Összefésülés: a fájlban szereplő eszközök minden hónapja frissül, okmányok/beállítások megmaradnak */
const similar = (a: string, b: string) => { const x = norm(a), y = norm(b); return x.length >= 4 && y.length >= 4 && (x.includes(y) || y.includes(x)); };
/** Az olajcsere esedékes állása a táblázatból (E9): a meglévő olajcsere-ciklust felülírja, ha nincs, létrehozza */
function withOilDue(d: Device, due?: number): Partial<Pick<Device, "services">> {
  if (!due) return {};
  const list = [...(d.services ?? [])];
  const i = list.findIndex((s) => isOilService(s.name));
  const cur = list[i];
  if (cur) { if (serviceDue(cur) === due) return {}; list[i] = { ...cur, dueAt: due }; }
  else list.push({ id: uid(), name: "Olajcsere", interval: 0, lastReading: 0, dueAt: due });
  return { services: list };
}

export function mergeImport(current: Device[], parsed: Parsed[], keepNames = true, ask: (p: Parsed, d: Device) => boolean = () => false, applyTable = true) {
  let updated = 0, added = 0;
  const devices = [...current];
  for (const p of parsed) {
    let i = devices.findIndex((d) => norm(d.plate) === norm(p.plate));
    if (i < 0) {
      const taken = new Set(parsed.map((x) => norm(x.plate)));
      const j = devices.findIndex((d) => !taken.has(norm(d.plate)) && similar(d.plate, p.plate));
      const candidate = devices[j];
      if (candidate && ask(p, candidate)) i = j;
    }
    if (i >= 0) {
      const d = devices[i];
      if (!d) continue;
      // Törölt eszköznél a törlés hónapjától kezdve a fájl adatai nem számítanak; a másik felhasználó törlése átvételre kerül
      const gone = d.removedFrom ?? p.extras?.removedFrom;
      const months = Object.fromEntries(Object.entries(p.months).filter(([m, r]) => r.length && (gone == null || Number(m) < gone)));
      devices[i] = { ...d, ...(d.removedFrom == null && gone != null ? { removedFrom: gone } : {}), ...(keepNames ? {} : { plate: p.plate, type: p.type || d.type, category: p.category || d.category }), startOdometer: p.start ?? d.startOdometer, months, ...(applyTable ? { ...(p.allowed ? { yearlyAllowed: p.allowed } : {}), ...withOilDue(d, p.oilDue) } : {}) };
      updated++;
    } else {
      const ex = p.extras;
      const months = Object.fromEntries(Object.entries(p.months).filter(([m, r]) => r.length && (ex?.removedFrom == null || Number(m) < ex.removedFrom)));
      const created: Device = { ...newDevice(p.plate, p.type), category: p.category, startOdometer: p.start ?? 0, months, ...(ex ? { unit: ex.unit ?? "km", norm: ex.norm ?? 0, yearlyAllowed: ex.yearlyAllowed ?? 0, ...(ex.status ? { status: ex.status } : {}), ...(ex.note != null ? { note: ex.note } : {}), ...(ex.muted != null ? { muted: ex.muted } : {}), ...(ex.removedFrom != null ? { removedFrom: ex.removedFrom } : {}), ...(ex.complete || ex.docs.length ? { docs: ex.docs } : {}), services: ex.services } : {}) };
      devices.push({ ...created, ...(p.allowed ? { yearlyAllowed: p.allowed } : {}), ...withOilDue(created, p.oilDue) });
      added++;
    }
  }
  return { devices, updated, added };
}

/**
 * Fájl beolvasása az app mellé, felülírás nélkül: új eszközök teljes szerkezettel kerülnek be,
 * a meglévőknél a hónapok sorai, az okmányok, szervizek és a még üres beállítások fésülődnek bele.
 * Az eszközök sorrendje és a meglévő nevek/értékek érintetlenek maradnak.
 */
export function mergeFile(current: Device[], parsed: Parsed[], ask: (p: Parsed, d: Device) => boolean = () => false) {
  const r = mergeImport(current, parsed, true, ask, false);
  const same = (a: Row, b: Row) => a.docNo === b.docNo && a.odometer === b.odometer && a.km === b.km && a.fuel === b.fuel;
  const devices = r.devices.map((d) => {
    const old = current.find((c) => c.id === d.id);
    if (!old) return d;
    const p = parsed.find((x) => norm(x.plate) === norm(old.plate)) ?? parsed.find((x) => similar(old.plate, x.plate));
    const months: Record<number, Row[]> = {};
    for (let m = 0; m < 12; m++) {
      const fileRows = d.months[m] ?? [], appRows = old.months[m] ?? [];
      const used = new Set(fileRows.map((x) => x.worksheetRow).filter((x): x is number => x != null));
      const extra = appRows.filter((a) => !(a.worksheetRow != null && used.has(a.worksheetRow)) && !fileRows.some((f) => same(a, f)));
      const rows = [...fileRows, ...extra].sort((a, b) => (a.worksheetRow ?? 99) - (b.worksheetRow ?? 99));
      if (rows.length) months[m] = rows;
    }
    let out: Device = { ...d, months, type: old.type || p?.type || "", category: old.category || p?.category || "" };
    const ex = p?.extras;
    if (ex) {
      const docs = [...old.docs];
      for (const x of ex.docs) {
        const i = docs.findIndex((y) => norm(y.name) === norm(x.name));
        const cur = docs[i];
        if (!cur) docs.push(x); else docs[i] = { ...cur, number: cur.number || x.number, expiry: cur.expiry || x.expiry };
      }
      const services = [...(old.services ?? [])];
      for (const x of ex.services) if (!services.some((y) => norm(y.name) === norm(x.name))) services.push(x);
      out = {
        ...out, docs, services,
        ...(!old.note && ex.note ? { note: ex.note } : {}),
        ...(!old.muted && ex.muted ? { muted: true } : {}),
        ...(!old.norm && ex.norm ? { norm: ex.norm } : {}),
        ...(!old.yearlyAllowed && ex.yearlyAllowed ? { yearlyAllowed: ex.yearlyAllowed } : {}),
        ...(!old.status && ex.status ? { status: ex.status } : {}),
      };
    }
    // A táblázat E4/E9 értékei: csak a még üres mezőket töltik ki
    if (p) {
      if (!out.yearlyAllowed && p.allowed) out = { ...out, yearlyAllowed: p.allowed };
      if (oilDue(out) == null && p.oilDue) out = { ...out, ...withOilDue(out, p.oilDue) };
    }
    return out;
  });
  return { devices, updated: r.updated, added: r.added };
}

/**
 * Háttérben betöltött Drive-adat beillesztése az időközben szerkesztett app-állapotba.
 * base: az állapot a betöltés indulásakor; current: a mostani; merged: a base + a fájl összefésülve.
 * Ami a betöltés alatt nem változott az appban, az a fájl szerinti értéket kapja; amit időközben szerkesztettél, az megmarad.
 */
export function reconcileRefresh(base: Device[], current: Device[], merged: Device[]): Device[] {
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const strip = (d: Device) => { const { months: _m, ...rest } = d; return rest; };
  const out = current.map((cur) => {
    const old = base.find((b) => b.id === cur.id);
    const next = merged.find((m) => m.id === cur.id);
    if (!old || !next) return cur;
    const fields = same(strip(old), strip(cur)) ? strip(next) : strip(cur);
    const months: Record<number, Row[]> = {};
    for (let m = 0; m < 12; m++) {
      const rows = same(old.months[m] ?? [], cur.months[m] ?? []) ? next.months[m] : cur.months[m];
      if (rows?.length) months[m] = rows;
    }
    return { ...fields, months } as Device;
  });
  // A fájlból újonnan érkezett eszközök (még nincsenek az appban)
  for (const m of merged) if (!current.some((c) => c.id === m.id) && !base.some((b) => b.id === m.id)) out.push(m);
  return out;
}
