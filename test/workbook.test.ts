import { describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
vi.mock("@/lib/fleet", () => ({
  MONTHS: ["Január", "Február", "Március", "Április", "Május", "Június", "Július", "Augusztus", "Szeptember", "Október", "November", "December"],
  uid: () => "id", newDevice: (plate: string, type: string) => ({ id: plate, plate, type, category: "", unit: "km", norm: 0, yearlyAllowed: 0, startOdometer: 0, docs: [], months: {} }),
}));
vi.mock("@/lib/workbookStorage", () => ({ loadWorkbookTemplate: vi.fn() }));
import { buildWorkbook } from "@/lib/exportXlsx";
import { mergeImport, parseWorkbook, reconcileRefresh, threeWay } from "@/lib/importXlsx";
import type { Device, Row } from "@/lib/fleet";

const row = { id: "r", docNo: "26", odometer: 56193, km: 3976, weightedKm: 0, fuel: 250, diff: 0, worksheetRow: 30 };
const device: Device = { id: "d", plate: "HA 00-157", type: "Suzuki", category: "", unit: "km", norm: 7, yearlyAllowed: 10000, startOdometer: 52217, docs: [{ id: "doc", name: "Műszaki vizsga", number: "", expiry: "2027-01-01", hasNumber: false, hasDate: true }], services: [{ id: "oil", name: "Olajcsere", interval: 10000, lastReading: 50000 }], months: { 0: [row] } };
function template(extraRow = 0) {
  const wb = XLSX.utils.book_new(), sheet = XLSX.utils.aoa_to_sheet([]);
  for (const [addr, value] of Object.entries({ B1: "Forgalmi rendszám:", E1: device.plate, B10: "Sorszám", C13: 52217, B44: 26, C44: 56193, F44: 250, A46: "Átvitel:" })) sheet[addr] = { t: typeof value === "number" ? "n" : "s", v: value };
  sheet['D44'] = { t: "n", f: "C44-C13", v: 3976 }; sheet['D45'] = { t: "n", f: "SUM(D14:D44)", v: 3976 };
  if (extraRow) sheet[`A${extraRow}`] = { t: "s", v: "Új eszköz vége" };
  sheet["!ref"] = `A1:H${Math.max(46, extraRow)}`;
  sheet["!merges"] = [{ s: { r: 0, c: 4 }, e: { r: 0, c: 6 } }];
  XLSX.utils.book_append_sheet(wb, sheet, "Január");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}
const asFile = (data: ArrayBuffer) => ({ arrayBuffer: async () => data }) as File;
describe("Original workbook", () => {
  it("keeps formulas, merged cells and daily position and appends after the dynamically extended range", async () => {
    const blob = await buildWorkbook([device], 2026, template(92));
    const buffer = await new Promise<ArrayBuffer>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result as ArrayBuffer); reader.onerror = reject; reader.readAsArrayBuffer(blob); });
    const wb = XLSX.read(buffer, { type: "array", sheetStubs: true });
    expect(wb.SheetNames).toEqual(["Január"]);
    expect(wb.Sheets['Január']?.['D44']?.f).toBe("C44-C13");
    expect(wb.Sheets['Január']?.['D45']?.f).toBe("SUM(D14:D44)");
    expect(wb.Sheets['Január']?.['C44']?.v).toBe(56193);
    expect(wb.Sheets['Január']?.['C14']?.v).toBeUndefined();
    expect(wb.Sheets['Január']?.['A94']?.v).toBe("APP-ADATOK");
    expect(wb.Sheets['Január']?.["!merges"]).toEqual([{ s: { r: 0, c: 4 }, e: { r: 0, c: 6 } }]);
    const parsed = await parseWorkbook(asFile(buffer));
    expect(parsed[0]?.months[0]?.[0]).toMatchObject({ docNo: "26", worksheetRow: 30 });
    expect(parsed[0]?.months[0]?.[0]?.km).toBe(3976);
    const restored = mergeImport([], parsed).devices[0];
    expect(restored?.docs[0]).toMatchObject({ expiry: "2027-01-01", hasNumber: false, hasDate: true });
    expect(restored?.services?.[0]?.interval).toBe(10000);
  });
  it("pótolja a hátralévő km képleteit a régi sablonban, és a meglévőket nem bántja", async () => {
    const readBack = async (data: ArrayBuffer) => {
      const blob = await buildWorkbook([device], 2026, data);
      const buffer = await new Promise<ArrayBuffer>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result as ArrayBuffer); reader.onerror = reject; reader.readAsArrayBuffer(blob); });
      return XLSX.read(buffer, { type: "array", sheetStubs: true }).Sheets["Január"];
    };
    const old = XLSX.read(template(), { type: "array", cellFormula: true });
    const sheet = old.Sheets["Január"]!;
    sheet["AR14"] = { t: "n", f: "IF(ISBLANK(B14),+(AR13),C14)", v: 0 };
    sheet["E9"] = { t: "e", f: "#REF!", v: 23 };
    sheet["!ref"] = "A1:AR46";
    const patched = XLSX.write(old, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const out = await readBack(patched);
    expect(out?.["F4"]?.f).toBe('IF(E4>0,E4-D46,"")');
    expect(out?.["E8"]?.f).toBe('IF(E9>0,E9-AR44,"")');
    expect(out?.["H4"]?.v).toBe("hátra");
    expect(out?.["F8"]?.v).toBe("km hátra");
    expect(out?.["E9"]?.v).toBe(60000);
    expect(out?.["E9"]?.f).toBeUndefined();
    expect(out?.["E4"]?.v).toBe(10000);
    // az első fájl nélküli (AR14 nélküli) sablonban nem jön létre képlet
    expect((await readBack(template()))?.["F4"]?.f).toBeUndefined();
  });
  it("preserves manual order and existing extras when the monthly upload lacks them", async () => {
    const parsed = await parseWorkbook(asFile(template()));
    const second = { ...device, id: "b", plate: "OTHER" };
    const result = mergeImport([second, device], parsed);
    expect(result.devices.map((d) => d.id)).toEqual(["b", "d"]);
    expect(result.devices[1]?.docs).toEqual(device.docs);
    expect(result.devices[1]?.services).toEqual(device.services);
  });
  it("matches normalized plates rather than position", async () => {
    const parsed = await parseWorkbook(asFile(template()));
    parsed[0] = { ...parsed[0], plate: "ha00157" } as (typeof parsed)[number];
    expect(mergeImport([device], parsed)).toMatchObject({ updated: 1, added: 0 });
  });
});
describe("háttérben betöltött adat beillesztése", () => {
  it("a közben szerkesztett rész megmarad, a többi frissül, az új eszköz bekerül", () => {
    const edited: Device = { ...device, months: { 0: [row], 1: [{ ...row, id: "u", docNo: "27" }] } }; // közben felvett februári sor
    const file: Device = { ...device, yearlyAllowed: 12000, months: { 0: [{ ...row, km: 4000 }], 1: [{ ...row, id: "f", docNo: "99" }] } };
    const added: Device = { ...device, id: "n", plate: "ÚJ" };
    const out = reconcileRefresh([device], [edited], [file, added]);
    expect(out[0]?.months[0]?.[0]?.km).toBe(4000);
    expect(out[0]?.months[1]?.[0]?.docNo).toBe("27");
    expect(out[0]?.yearlyAllowed).toBe(12000);
    expect(out.map((d) => d.id)).toEqual(["d", "n"]);
  });
});

describe("a táblázat az irányadó (háromutas összefésülés)", () => {
  const rowOf = (km: number, id: string): Row => ({ ...row, id, odometer: km, km });
  const withMonths = (months: Device["months"], extra: Partial<Device> = {}): Device => ({ ...device, months, ...extra });
  it("a táblázatban közben pótolt adatot az app üres értéke nem írja felül", () => {
    const base = [withMonths({})];
    const app = [withMonths({})];                              // az appban nincs adat
    const table = [withMonths({ 0: [rowOf(52300, "t1")] })];   // a táblázatba januárt pótoltad
    const out = threeWay(base, app, table);
    expect(out[0]?.months[0]?.[0]?.odometer).toBe(52300);
  });
  it("az app saját módosítása a táblázatba kerül, ha a táblázat nem változott", () => {
    const base = [withMonths({ 0: [rowOf(52300, "b1")] })];
    const app = [withMonths({ 0: [rowOf(52300, "b1")], 1: [rowOf(52800, "a1")] })];  // február csak az appban van
    const table = [withMonths({ 0: [rowOf(52300, "t1")] })];
    const out = threeWay(base, app, table);
    expect(out[0]?.months[1]?.[0]?.odometer).toBe(52800);
    expect(out[0]?.months[0]?.[0]?.odometer).toBe(52300);
  });
  it("ütközésnél a táblázat marad, és a törlés az appból átmegy", () => {
    const base = [withMonths({ 0: [rowOf(100, "b1")] })];
    expect(threeWay(base, [withMonths({ 0: [rowOf(111, "a1")] })], [withMonths({ 0: [rowOf(122, "t1")] })])[0]?.months[0]?.[0]?.odometer).toBe(122);
    expect(threeWay(base, [withMonths({})], [withMonths({ 0: [rowOf(100, "t1")] })])[0]?.months[0]).toBeUndefined();
  });
});

import { buildNextYearWorkbook } from "@/lib/xlsxNextYear";
describe("új évi táblázat", () => {
  /** Két hónap, egy blokk: január (fix nyitó állás) és február (az átvitel egy fix értékkel megszakítva) */
  const monthSheet = (feb: boolean) => {
    const ws: XLSX.WorkSheet = {};
    const put = (a: string, v: unknown, f?: string) => { ws[a] = typeof v === "number" ? { t: "n", v, ...(f ? { f } : {}) } : { t: "s", v: String(v) }; };
    put("B1", "Forgalmi rendszám:"); put("E1", "HA 00-157"); put("B10", "Sorszám");
    put("C13", feb ? 99999 : 52217); // februárban fix érték áll a függvény helyén
    for (const [a, f] of [["AR13", "C13"], ["AR14", "IF(ISBLANK(B14),+(AR13),C14)"], ["AR44", "IF(ISBLANK(B44),+(AR43),C44)"]] as const) ws[a] = { t: "n", v: 0, f };
    put("B14", "5"); put("C14", 56000); put("E9", 60000);
    ws["!ref"] = "A1:AR46";
    return ws;
  };
  it("a január a decemberi zárással indul, a februári átvitel újra függvény, az adatok törlődnek", async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, monthSheet(false), "Január");
    XLSX.utils.book_append_sheet(wb, monthSheet(true), "Február");
    const data = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const blob = await buildNextYearWorkbook(data, [{ plate: "HA 00-157", odometer: 74394, yearlyAllowed: 10000, oilDue: 80000 }]);
    const buffer = await new Promise<ArrayBuffer>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result as ArrayBuffer); r.onerror = reject; r.readAsArrayBuffer(blob); });
    const out = XLSX.read(buffer, { type: "array", cellFormula: true });
    const jan = out.Sheets["Január"]!, feb = out.Sheets["Február"]!;
    expect(jan["C13"]?.v).toBe(74394);          // decemberi záró óraállás
    expect(jan["E4"]?.v).toBe(10000);
    expect(jan["E9"]?.v).toBe(80000);
    expect(jan["C14"]?.v).toBeUndefined();       // az előző év adata törölve
    expect(jan["B14"]?.v).toBeUndefined();
    expect(feb["C13"]?.f).toBe("Január!AR44");   // a fix érték helyett újra függvény
    expect(feb["C14"]?.v).toBeUndefined();
  });
});
