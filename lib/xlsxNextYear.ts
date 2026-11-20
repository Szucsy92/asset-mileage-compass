import * as XLSX from "xlsx";
import { MONTHS } from "@/lib/months";
import { EXTRAS_MARKER, normalizePlate, sheetGrid } from "@/lib/workbookLayout";

/** Egy eszköz decemberi záró állapota, amellyel az új év januárja indul */
export type NextYearDevice = { plate: string; odometer: number; yearlyAllowed?: number; oilDue?: number };
const HELP = /^IF\(ISBLANK\(([A-Z]+)\d+\),\+\(([A-Z]+)\d+\),([A-Z]+)\d+\)/;

/**
 * Az új év táblázata az előző évi táblázatból: ugyanazok az eszközök (és csak azok), minden adat törölve,
 * a január a decemberi záró állással indul, és a hónapok közti göngyölítés minden blokkban függvény (az évközben
 * beírt fix értékek helyett). Tiszta függvény: háttérszálban is fut.
 */
export async function buildNextYearWorkbook(source: ArrayBuffer, keep: NextYearDevice[]): Promise<Blob> {
  const { default: Populate } = await import("xlsx-populate/browser/xlsx-populate-no-encryption.min.js");
  const sourceBook = XLSX.read(source, { type: "array", cellFormula: true });
  const wb = await Populate.fromDataAsync(source);
  const names = MONTHS.map((month) => sourceBook.SheetNames.find((n) => normalizePlate(n) === normalizePlate(month)));

  // A blokkok helye minden lapon ugyanaz; a rendszám bármelyik hónap lapjáról jöhet (a legkésőbbi elsőbbségével)
  type Pos = { row: number; col: number; plate: string };
  const positions = new Map<string, Pos>();
  for (let m = MONTHS.length - 1; m >= 0; m--) {
    const sheet = names[m] ? sourceBook.Sheets[names[m]!] : undefined;
    if (!sheet) continue;
    const grid = sheetGrid(sheet);
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < (grid[r]?.length ?? 0); c++) {
        const label = grid[r]?.[c];
        if (typeof label !== "string" || !label.toLowerCase().includes("rendszám") || String(grid[r + 9]?.[c] ?? "").trim() !== "Sorszám") continue;
        const key = `${r + 1}:${c + 1}`, plate = String(grid[r]?.[c + 3] ?? "").trim();
        const known = positions.get(key);
        if (!known) positions.set(key, { row: r + 1, col: c + 1, plate });
        else if (!known.plate && plate) known.plate = plate;
      }
    }
  }

  names.forEach((name, m) => {
    const sourceSheet = name ? sourceBook.Sheets[name] : undefined;
    const sheet = name ? wb.sheet(name) : undefined;
    if (!name || !sourceSheet || !sheet) return;
    const grid = sheetGrid(sourceSheet);
    const prev = m > 0 ? names[m - 1] : undefined;
    for (const pos of positions.values()) {
      const L = (k: number) => XLSX.utils.encode_col(pos.col - 1 + k);
      // Az előző hónapról átvitelt végző oszlop (óraállás-segédoszlop): a tükörmásolatban és a nem blokk helyeken nincs
      let helper: string | null = null;
      for (let k = 8; k < 60 && !helper; k++) {
        const f = sourceSheet[XLSX.utils.encode_cell({ r: pos.row + 12, c: pos.col - 1 + k })]?.f;
        const hit = typeof f === "string" ? HELP.exec(f) : null;
        if (hit && hit[1] === L(0) && hit[3] === L(1)) helper = hit[2] ?? null;
      }
      if (!helper) continue;
      const info = pos.plate ? keep.find((k) => normalizePlate(k.plate) === normalizePlate(pos.plate)) : undefined;
      const input = (r: number, c: number, value: unknown) => { const cell = sheet.cell(r, c); if (!cell.formula()) cell.value(value); };

      // Napi sorok bemenetei (a függvények maradnak)
      for (let off = 0; off < 31; off++) for (let c = 0; c <= 6; c++) input(pos.row + 13 + off, pos.col + c, undefined);
      // Nem megtartott eszköz: a blokk fejléce is üres lesz
      if (!info) for (const r of [0, 1, 2, 3, 6, 8]) input(pos.row + r, pos.col + 3, undefined);

      if (m === 0) {
        // Január: a decemberi zárás a nyitó állás, az évi összesítők nulláról indulnak
        sheet.cell(pos.row + 12, pos.col + 1).value(info ? info.odometer : undefined);
        for (let k = 2; k <= 6; k++) sheet.cell(pos.row + 12, pos.col + k).value(0);
        if (info?.yearlyAllowed) input(pos.row + 3, pos.col + 3, info.yearlyAllowed);
        if (info?.oilDue) input(pos.row + 8, pos.col + 3, info.oilDue);
      } else if (prev) {
        // Február–december: az átvitel az előző hónap függvénye (a mid-year beírt fix értékek helyett is)
        sheet.cell(pos.row + 12, pos.col + 1).formula(`${prev}!${helper}${pos.row + 43}`);
        for (let k = 2; k <= 6; k++) sheet.cell(pos.row + 12, pos.col + k).formula(`${prev}!${L(k)}${pos.row + 45}`);
        // Az évi keret és az olajcsere esedékes állása is továbbvivődik
        sheet.cell(pos.row + 3, pos.col + 3).formula(`${prev}!${L(3)}${pos.row + 3}`);
        sheet.cell(pos.row + 8, pos.col + 3).formula(`${prev}!${L(3)}${pos.row + 8}`);
      }
    }
    // Az előző év app-adatai (extra terület) törlődnek; az új évhez az app a következő mentésnél írja újra
    const marker = grid.findIndex((row) => row?.[0] === EXTRAS_MARKER);
    if (marker >= 0) for (let r = marker; r < grid.length; r++) for (let c = 0; c < (grid[r]?.length ?? 0); c++) sheet.cell(r + 1, c + 1).value(undefined);
  });
  return wb.outputAsync("blob");
}
