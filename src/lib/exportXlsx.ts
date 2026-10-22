import * as XLSX from "xlsx";
import { MONTHS, cumulative, type Device } from "@/lib/fleet";

/** Az aktuális év összes adatának letöltése Excel fájlba */
export function exportWorkbook(devices: Device[], year: number) {
  const wb = XLSX.utils.book_new();
  const rows: (string | number)[][] = [["Rendszám / azonosító", "Típus", "Egység", "Hónap", "Bizonylat", "Óraállás", "Megtett", "Súlyozott", "Üzemanyag (l)", "Eltérés (l)"]];
  for (const d of devices)
    for (let m = 0; m < 12; m++)
      for (const r of d.months[m] ?? []) rows.push([d.plate, d.type, d.unit, MONTHS[m] ?? "", r.docNo, r.odometer, r.km, r.weightedKm, r.fuel, r.diff]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Havi adatok");

  const sum: (string | number)[][] = [["Rendszám / azonosító", "Típus", "Egység", "Nyitó állás", "Okmányok"]];
  for (const d of devices) sum.push([d.plate, d.type, d.unit, d.startOdometer, d.docs.map((x) => [x.name, x.number, x.expiry].filter(Boolean).join(" ")).join("; ")]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sum), "Eszközök");

  void cumulative;
  XLSX.writeFile(wb, `Technikai_eszkozok_${year}.xlsx`);
}
