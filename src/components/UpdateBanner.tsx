import { useEffect, useRef, useState } from "react";

const KEY = "apk-build-info";
const LOOK_EVERY = 10 * 60 * 1000;

type Info = { v: string; repo: string };
type Native = { currentBuild: () => number; repo: () => string; download: (url: string) => void };
type UpdateState = "PROGRESS" | "PERMISSION" | "INSTALLING" | "ERROR";
type Update = { build: number | null; name: string; apkUrl: string };
type Release = { tag_name?: string; name?: string; html_url?: string; assets?: { name: string; browser_download_url: string }[] };

/** Compares dated versions like 2026.11.09.0751 */
export function isNewer(remote: string, local: string) {
  const a = remote.replace(/^v/, "").split(".").map(Number);
  const b = local.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d) return d > 0;
  }
  return false;
}

/** A build szám (Android versionCode) a release címkéjében vagy nevében: „…build29012345” */
export function buildFromRelease(tag: string, name = ""): number | null {
  const m = /build(\d+)/i.exec(tag) ?? /build(\d+)/i.exec(name);
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** Natív frissítés: csak a telepítettnél nagyobb build számú release, .apk melléklettel */
export function pickUpdate(rel: Release, currentBuild: number): Update | null {
  const build = buildFromRelease(rel.tag_name ?? "", rel.name ?? "");
  const apk = (rel.assets ?? []).find((a) => a.name.toLowerCase().endsWith(".apk"));
  if (build == null || !apk || build <= currentBuild) return null;
  return { build, name: rel.name ?? rel.tag_name ?? "", apkUrl: apk.browser_download_url };
}

/** Csak a saját repó release-fájljai, https-en (a natív oldal is ezt ellenőrzi) */
export function isTrustedUpdateUrl(url: string | null | undefined, repo: string) {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.host === "github.com" && u.pathname.startsWith(`/${repo}/releases/download/`);
  } catch {
    return false;
  }
}

export function describeUpdateEvent(state: UpdateState, percent: number, message: string) {
  switch (state) {
    case "PROGRESS": return `Letöltés… ${percent}%`;
    case "PERMISSION": return "Engedélyezd a telepítést ennél az appnál, majd lépj vissza.";
    case "INSTALLING": return "Letöltve. Hagyd jóvá a telepítést.";
    default: return "A frissítés nem sikerült" + (message ? `: ${message}` : ".");
  }
}

const native = () => (window as unknown as { AndroidUpdater?: Native }).AndroidUpdater;

export function UpdateBanner() {
  const [latest, setLatest] = useState<{ version: string; url: string; native: boolean } | null>(null);
  const [status, setStatus] = useState("");
  const lastLook = useRef(0);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const built = (window as unknown as { __APK__?: Info }).__APK__;
    const bridge = native();
    const v = built?.v ?? q.get("apk");
    const repo = bridge?.repo() || (built?.repo ?? q.get("repo"));
    if (v && repo) localStorage.setItem(KEY, JSON.stringify({ v, repo }));
    let info: Info | null = null;
    try {
      info = JSON.parse(localStorage.getItem(KEY) || "null");
    } catch {}

    const look = () => {
      if (!info || !navigator.onLine) return;
      const now = Date.now();
      if (now - lastLook.current < LOOK_EVERY) return;
      lastLook.current = now;
      fetch(`https://api.github.com/repos/${info.repo}/releases/latest`)
        .then((r) => (r.ok ? r.json() : null))
        .then((rel: Release | null) => {
          if (!rel?.tag_name) return;
          if (bridge) {
            const up = pickUpdate(rel, bridge.currentBuild());
            if (up && isTrustedUpdateUrl(up.apkUrl, info!.repo)) setLatest({ version: (rel.tag_name ?? "").replace(/^v/, ""), url: up.apkUrl, native: true });
            return;
          }
          if (!isNewer(rel.tag_name, info!.v)) return;
          const apk = (rel.assets ?? []).find((a) => a.name.endsWith(".apk"));
          setLatest({ version: rel.tag_name.replace(/^v/, ""), url: apk?.browser_download_url ?? rel.html_url ?? "", native: false });
        })
        .catch(() => {});
    };

    (window as unknown as { __onUpdateEvent?: (s: UpdateState, p: number, m: string) => void }).__onUpdateEvent = (s, p, m) => setStatus(describeUpdateEvent(s, p, m));
    look();
    // Induláskor és az előtérbe visszatéréskor, legfeljebb tízpercenként
    const onVisible = () => { if (document.visibilityState === "visible") look(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  if (!latest) return null;
  const busy = status.startsWith("Letöltés");
  return (
    <div className="fixed inset-x-3 top-[calc(0.75rem+var(--safe-top))] z-50 flex items-center gap-3 rounded-2xl border border-border bg-card p-3 text-sm text-card-foreground shadow-lg">
      <span className="flex-1">{status || `Újabb változat érhető el (${latest.version}).`}</span>
      {latest.native ? (
        <button
          disabled={busy}
          onClick={() => { setStatus("Letöltés… 0%"); native()?.download(latest.url); }}
          className="rounded-xl bg-primary px-3 py-1.5 font-medium text-primary-foreground disabled:opacity-60"
        >
          Frissítés
        </button>
      ) : (
        <a href={latest.url} className="rounded-xl bg-primary px-3 py-1.5 font-medium text-primary-foreground">
          Frissítés
        </a>
      )}
      <button onClick={() => { setLatest(null); setStatus(""); }} aria-label="Bezárás" className="px-1 text-muted-foreground">
        ✕
      </button>
    </div>
  );
}
