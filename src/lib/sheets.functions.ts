import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GATEWAY = "https://connector-gateway.lovable.dev/google_sheets/v4/spreadsheets/1QnJ_WdDHREUE-yNeecTToN_ik3n0yDXKijeKKhE7G1g";
const cell = z.union([z.string(), z.number()]);
const grid = z.array(z.array(cell)).max(20000);

async function call(path: string, init?: RequestInit) {
  const lk = process.env["LOVABLE_API_KEY"], ck = process.env["GOOGLE_SHEETS_API_KEY"];
  if (!lk || !ck) throw new Error("Google Táblázat nincs összekötve");
  const res = await fetch(`${GATEWAY}${path}`, { ...init, headers: { Authorization: `Bearer ${lk}`, "X-Connection-Api-Key": ck, "Content-Type": "application/json" } });
  if (!res.ok) { const t = await res.text(); console.error(`Sheets [${res.status}]: ${t}`); throw new Error(`Google Táblázat hiba (${res.status})`); }
  return res.json();
}

/** Az aktuális év adatainak kiírása (a többi év sorai megmaradnak) */
export const pushSheet = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ year: z.number().int(), monthly: grid, devs: grid }).parse(d))
  .handler(async ({ data }) => {
    const cur = await call("/values:batchGet?ranges=Havi adatok!A:K&ranges=Eszközök!A:F");
    const [m, e] = (cur.valueRanges ?? []).map((v: { values?: unknown[][] }) => v.values ?? []);
    const keep = (rows: unknown[][]) => rows.slice(1).filter((r) => Number(r[0]) !== data.year) as (string | number)[][];
    const monthly = [data.monthly[0]!, ...keep(m ?? []), ...data.monthly.slice(1)];
    const devs = [data.devs[0]!, ...keep(e ?? []), ...data.devs.slice(1)];
    await call("/values:batchClear", { method: "POST", body: JSON.stringify({ ranges: ["Havi adatok!A:K", "Eszközök!A:F"] }) });
    await call("/values:batchUpdate", { method: "POST", body: JSON.stringify({ valueInputOption: "RAW", data: [{ range: "Havi adatok!A1", values: monthly }, { range: "Eszközök!A1", values: devs }] }) });
    return { ok: true };
  });

export const pullSheet = createServerFn({ method: "GET" }).handler(async () => {
  const r = await call("/values/Havi adatok!A:K?valueRenderOption=UNFORMATTED_VALUE");
  return { values: (r.values ?? []) as (string | number)[][] };
});
