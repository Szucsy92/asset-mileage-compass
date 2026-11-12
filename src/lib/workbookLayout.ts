import * as XLSX from "xlsx";

export const EXTRAS_MARKER = "APP-ADATOK";
export const normalizePlate = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
export type WorkbookRef = { path: string; name: string; driveId?: string; driveModified?: string };
export type DeviceBlock = { plate: string; row: number; col: number };

export function findBlocks(grid: unknown[][]): DeviceBlock[] {
  const blocks: DeviceBlock[] = [];
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < (grid[r]?.length ?? 0); c++) {
      const label = grid[r]?.[c];
      if (typeof label !== "string" || !label.toLowerCase().includes("rendszám")) continue;
      const plate = String(grid[r]?.[c + 3] ?? "").trim();
      if (plate && String(grid[r + 9]?.[c] ?? "").trim() === "Sorszám") blocks.push({ plate, row: r + 1, col: c + 1 });
    }
  }
  return blocks;
}

export function sheetGrid(sheet: XLSX.WorkSheet) {
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });
}