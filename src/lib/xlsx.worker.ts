/// Háttérszál: a nagy Excel-fájlok beolvasása és kiírása itt fut, hogy a felület közben ne akadjon meg.
import { parseBuffer } from "./xlsxParse";

type Msg = { id: number; kind: "parse"; buffer: ArrayBuffer } | { id: number; kind: "build"; devices: import("./fleet").Device[]; year: number; buffer: ArrayBuffer };
const ctx = self as unknown as { onmessage: ((e: MessageEvent<Msg>) => void) | null; postMessage: (m: unknown) => void; window?: unknown };
ctx.window = self; // az xlsx-populate böngészős csomagja a window nevet keresheti

ctx.onmessage = async (e) => {
  const msg = e.data;
  try {
    if (msg.kind === "parse") ctx.postMessage({ id: msg.id, ok: true, result: parseBuffer(msg.buffer) });
    else {
      const { buildWorkbook } = await import("./xlsxBuild");
      ctx.postMessage({ id: msg.id, ok: true, result: await buildWorkbook(msg.devices, msg.year, msg.buffer) });
    }
  } catch (error) {
    ctx.postMessage({ id: msg.id, ok: false, error: error instanceof Error ? error.message : "A feldolgozás nem sikerült." });
  }
};
