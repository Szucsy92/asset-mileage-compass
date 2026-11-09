import * as XLSX from "xlsx";
import { MONTHS, type Device } from "@/lib/fleet";
import { EXTRAS_MARKER, findBlocks, normalizePlate, sheetGrid, type WorkbookRef } from "./workbookLayout";
import { loadWorkbookTemplate } from "./workbookStorage";

export { EXTRAS_MARKER } from "./workbookLayout";

export async function buildWorkbook(devices: Device[], year: number, source: ArrayBuffer): Promise<Blob> {
  const { default: Populate } = await import("xlsx-populate/browser/xlsx-populate-no-encryption.min.js");
  const sourceBook = XLSX.read(source, { type: "array", cellFormula: true });
  const wb = await Populate.fromDataAsync(source);
  for (let m = 0; m < MONTHS.length; m++) {
    const name = sourceBook.SheetNames.find((n) => normalizePlate(n) === normalizePlate(MONTHS[m] ?? ""));
    if (!name) continue;
    const sourceSheet = sourceBook.Sheets[name], sheet = wb.sheet(name);
    if (!sourceSheet || !sheet) continue;
    const grid = sheetGrid(sourceSheet);
    for (const [address] of Object.entries(sourceSheet)) {
      if (address.startsWith("!")) continue;
      const pos = XLSX.utils.decode_cell(address), cell = sheet.cell(pos.r + 1, pos.c + 1);
      const value = cell.value();
      if (typeof value === "number" && !Number.isFinite(value) && !cell.formula()) cell.value(undefined);
    }
    const blocks = findBlocks(grid);
    const matched = new Set<string>();
    for (const block of blocks) {
      const d = devices.find((item) => normalizePlate(item.plate) === normalizePlate(block.plate));
      if (!d) continue;
      matched.add(d.id);
      // Formula cells remain formulas, including the monthly carry-forward totals.
      const write = (r: number, c: number, value: unknown) => {
        const address = XLSX.utils.encode_cell({ r: r - 1, c: c - 1 });
        const cell = sheet.cell(r, c);
        if (!sourceSheet[address]?.f && !cell.formula()) cell.value(value);
      };
      write(block.row + 1, block.col + 3, d.type);
      write(block.row + 2, block.col + 3, d.category);
      write(block.row + 3, block.col + 3, d.yearlyAllowed || undefined);
      if (m === 0) write(block.row + 12, block.col + 1, d.startOdometer);
      const rows = d.months[m] ?? [];
      if (rows.length > 31) throw new Error(`${d.plate}: a havi 31 sor nem elég. A letöltés nem ír felül összesítőket.`);
      const assigned = new Map<number, (typeof rows)[number]>();
      for (const row of rows) {
        let offset = row.worksheetRow;
        if (offset == null || offset < 0 || offset > 30 || assigned.has(offset)) {
          offset = Array.from({ length: 31 }, (_, i) => i).find((i) => !assigned.has(i) && !rows.some((x) => x.worksheetRow === i));
        }
        if (offset != null) assigned.set(offset, row);
      }
      for (let offset = 0; offset < 31; offset++) {
        const row = assigned.get(offset);
        const values = row ? [row.docNo, row.odometer, row.km, row.weightedKm, row.fuel, row.diff] : Array(6).fill(undefined);
        values.forEach((value, c) => write(block.row + 13 + offset, block.col + c, value));
      }
    }
    const marker = grid.findIndex((row) => row?.[0] === EXTRAS_MARKER);
    let last = 0;
    const stop = marker >= 0 ? marker : grid.length;
    for (let r = 0; r < stop; r++) if (grid[r]?.some((v) => v != null && v !== "")) last = r + 1;
    // Keep even empty, formatted reserve blocks and all original formula rows above the extras.
    if (marker < 0 && sourceSheet["!ref"]) last = Math.max(last, XLSX.utils.decode_range(sourceSheet["!ref"]).e.r + 1);
    if (marker >= 0) for (let r = marker; r < grid.length; r++) for (let c = 0; c < (grid[r]?.length ?? 0); c++) sheet.cell(r + 1, c + 1).value(undefined);
    const extras: unknown[][] = [[EXTRAS_MARKER, year], ["Rendszám", "Mező", "Érték 1", "Érték 2", "Érték 3", "Érték 4", "Érték 5", "Érték 6", "Érték 7", "Érték 8"]];
    for (const d of devices) {
      extras.push([d.plate, "eszköz", d.type, d.category, d.startOdometer]);
      extras.push([d.plate, "beállítás", d.unit, d.norm, d.yearlyAllowed, d.status ?? ""]);
      if (d.note) extras.push([d.plate, "megjegyzés", d.note]);
      if (d.muted) extras.push([d.plate, "némítva", "igen"]);
      // This boundary preserves intentionally empty document/service lists on reimport.
      extras.push([d.plate, "okmányok és szervizek", "teljes"]);
      for (const doc of d.docs) extras.push([d.plate, "okmány", doc.name, doc.number, doc.expiry, `${doc.hasNumber === false ? 0 : 1}${doc.hasDate === false ? 0 : 1}`]);
      for (const service of d.services ?? []) extras.push([d.plate, "szerviz", service.name, service.interval, service.lastReading]);
      extras.push([d.plate, "havi adatok", m]);
      for (const row of d.months[m] ?? []) extras.push([d.plate, "havi adat", m, row.docNo, row.odometer, row.km, row.weightedKm, row.fuel, row.diff, row.worksheetRow ?? ""]);
    }
    extras.forEach((row, r) => row.forEach((value, c) => sheet.cell(last + 2 + r, c + 1).value(value)));
  }
  return wb.outputAsync("blob");
}

export async function exportWorkbook(devices: Device[], year: number, ref?: WorkbookRef) {
  const blob = await buildWorkbook(devices, year, await loadWorkbookTemplate(ref));
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = ref?.name ?? `Technikai_eszkozok_${year}.xlsx`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
