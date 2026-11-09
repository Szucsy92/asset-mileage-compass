import { describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
vi.mock("@/lib/fleet", () => ({
  MONTHS: ["Január", "Február", "Március", "Április", "Május", "Június", "Július", "Augusztus", "Szeptember", "Október", "November", "December"],
  uid: () => "id", newDevice: (plate: string, type: string) => ({ id: plate, plate, type, category: "", unit: "km", norm: 0, yearlyAllowed: 0, startOdometer: 0, docs: [], months: {} }),
}));
vi.mock("@/lib/workbookStorage", () => ({ loadWorkbookTemplate: vi.fn() }));
import { buildWorkbook } from "@/lib/exportXlsx";
import { mergeImport, parseWorkbook } from "@/lib/importXlsx";
import type { Device } from "@/lib/fleet";

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
    const restored = mergeImport([], parsed).devices[0];
    expect(restored?.docs[0]).toMatchObject({ expiry: "2027-01-01", hasNumber: false, hasDate: true });
    expect(restored?.services?.[0]?.interval).toBe(10000);
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