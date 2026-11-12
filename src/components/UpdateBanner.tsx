import { useEffect, useState } from "react";

const KEY = "apk-build-info";

type Info = { v: string; repo: string };
type Latest = { version: string; url: string };

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

export function UpdateBanner() {
  const [latest, setLatest] = useState<Latest | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const built = (window as unknown as { __APK__?: Info }).__APK__;
    const v = built?.v ?? q.get("apk");
    const repo = built?.repo ?? q.get("repo");
    if (v && repo) localStorage.setItem(KEY, JSON.stringify({ v, repo }));
    let info: Info | null = null;
    try {
      info = JSON.parse(localStorage.getItem(KEY) || "null");
    } catch {}
    if (!info || !navigator.onLine) return;
    fetch(`https://api.github.com/repos/${info.repo}/releases/latest`)
      .then((r) => (r.ok ? r.json() : null))
      .then((rel) => {
        if (!rel?.tag_name || !isNewer(rel.tag_name, info!.v)) return;
        const apk = (rel.assets ?? []).find((a: { name: string }) => a.name.endsWith(".apk"));
        setLatest({
          version: rel.tag_name.replace(/^v/, ""),
          url: apk?.browser_download_url ?? rel.html_url,
        });
      })
      .catch(() => {});
  }, []);

  if (!latest) return null;
  return (
    <div className="fixed inset-x-3 top-[calc(0.75rem+var(--safe-top))] z-50 flex items-center gap-3 rounded-2xl border border-border bg-card p-3 text-sm text-card-foreground shadow-lg">
      <span className="flex-1">Újabb változat érhető el ({latest.version}).</span>
      <a
        href={latest.url}
        className="rounded-xl bg-primary px-3 py-1.5 font-medium text-primary-foreground"
      >
        Frissítés
      </a>
      <button onClick={() => setLatest(null)} aria-label="Bezárás" className="px-1 text-muted-foreground">
        ✕
      </button>
    </div>
  );
}
