import * as XLSX from "xlsx";
import { MONTHS, type Device } from "@/lib/fleet";

/** Az app extra adatainak (okmányok, szervizek, beállítások) jelölője a táblázat alján */
export const EXTRAS_MARKER = "APP-ADATOK";

/**
 * Az aktuális év összes adatának letöltése Excel fájlba.
 * Az eredeti felépítés (havi adatok + eszközlista) érintetlen marad,
 * az app-ban rögzített plusz adatok az "Eszközök" lap UTOLSÓ SORA UTÁN
 * kezdődnek — nincs fix pozíció, így új eszköz hozzáadásakor sem csúszik szét.
 */
export function exportWorkbook(devices: Device[], year: number) {
  const wb = XLSX.utils.book_new();
  const rows: (string | number)[][] = [["Rendszám / azonosító", "Típus", "Egység", "Hónap", "Bizonylat", "Óraállás", "Megtett", "Súlyozott", "Üzemanyag (l)", "Eltérés (l)"]];
  for (const d of devices)
    for (let m = 0; m < 12; m++)
      for (const r of d.months[m] ?? []) rows.push([d.plate, d.type, d.unit, MONTHS[m] ?? "", r.docNo, r.odometer, r.km, r.weightedKm, r.fuel, r.diff]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Havi adatok");

  // Eredeti eszközlista — változatlan szerkezet
  const sum: (string | number)[][] = [["Rendszám / azonosító", "Típus", "Egység", "Nyitó állás", "Okmányok"]];
  for (const d of devices) sum.push([d.plate, d.type, d.unit, d.startOdometer, d.docs.map((x) => [x.name, x.number, x.expiry].filter(Boolean).join(" ")).join("; ")]);

  // App-extra blokk: dinamikusan az utolsó eszközsor után kezdődik
  sum.push([]);
  sum.push([EXTRAS_MARKER]);
  sum.push(["Rendszám", "Mező", "Érték 1", "Érték 2", "Érték 3", "Érték 4"]);
  for (const d of devices) {
    sum.push([d.plate, "beállítás", d.unit, String(d.norm), String(d.yearlyAllowed), d.status ?? ""]);
    if (d.note) sum.push([d.plate, "megjegyzés", d.note]);
    if (d.muted) sum.push([d.plate, "némítva", "igen"]);
    for (const doc of d.docs)
      sum.push([d.plate, "okmány", doc.name, doc.number, doc.expiry, `${doc.hasNumber === false ? 0 : 1}${doc.hasDate === false ? 0 : 1}`]);
    for (const s of d.services ?? [])
      sum.push([d.plate, "szerviz", s.name, String(s.interval), String(s.lastReading)]);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sum), "Eszközök");

  XLSX.writeFile(wb, `Technikai_eszkozok_${year}.xlsx`);
}
