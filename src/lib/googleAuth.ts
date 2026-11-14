/**
 * Google-bejelentkezés a Drive eléréséhez.
 *  - APK (Capacitor): rendszerböngészős OAuth (PKCE) + egyedi sémájú visszatérés, az Android OAuth-klienssel.
 *  - Böngésző: Google Identity Services (csak ha van VITE_GOOGLE_WEB_CLIENT_ID).
 * A tokenek csak ezen a telefonon (localStorage) vannak, a közös adatbázisba nem kerülnek.
 */
// A Client ID nyilvános azonosító (nem titok), ezért be van égetve; a build-változó felülírhatja.
const DEFAULT_CLIENT_ID = "576612590188-0hg1avgh1htuhsrmkj1vv6d1mq8u2sk8.apps.googleusercontent.com";
const CLIENT_ID = (import.meta.env["VITE_GOOGLE_CLIENT_ID"] as string | undefined) || DEFAULT_CLIENT_ID;
// Webes kliens (nyilvános azonosító, nem titok; a "client secret"-et soha nem használjuk). A build-változó felülírhatja.
const DEFAULT_WEB_CLIENT_ID = "576612590188-h0qt8ghahm95mbld4jtk1kf3kun0c9mp.apps.googleusercontent.com";
const WEB_CLIENT_ID = (import.meta.env["VITE_GOOGLE_WEB_CLIENT_ID"] as string | undefined) || DEFAULT_WEB_CLIENT_ID;
const SCOPE = "https://www.googleapis.com/auth/drive openid email";
const SCHEME = "hu.technikaieszkoz.nyilvantartas";
const REDIRECT = `${SCHEME}:/oauth2redirect`;
const STORE = "gdrive-auth-v1";

type Tokens = { access: string; expires: number; refresh?: string; email?: string };
type Listener = { remove: () => void | Promise<void> };
type CapPlugins = {
  Browser?: { open: (o: { url: string }) => Promise<void>; close?: () => Promise<void> };
  App?: { addListener: (e: "appUrlOpen", cb: (ev: { url: string }) => void) => Promise<Listener> | Listener };
};
type CapWindow = { Capacitor?: { isNativePlatform?: () => boolean; Plugins?: CapPlugins } };

const cap = () => (window as unknown as CapWindow).Capacitor;
const isNative = () => !!cap()?.isNativePlatform?.();

export const driveConfigured = () => (isNative() ? !!CLIENT_ID : !!WEB_CLIENT_ID);
export const driveSetupMessage = () =>
  isNative()
    ? "A Google-bejelentkezés nincs beállítva az APK-ban (hiányzik a GOOGLE_CLIENT_ID)."
    : "A Google-bejelentkezés böngészőben nincs beállítva (hiányzik a webes Client ID).";

function read(): Tokens | null { try { const r = localStorage.getItem(STORE); return r ? (JSON.parse(r) as Tokens) : null; } catch { return null; } }
function write(t: Tokens | null) { try { if (t) localStorage.setItem(STORE, JSON.stringify(t)); else localStorage.removeItem(STORE); } catch { /* tele a tár */ } }

export const signedInEmail = () => read()?.email ?? null;
export const isSignedIn = () => !!read();
export function signOut() {
  const t = read();
  // Belső bejelentkezésnél a Google tárolt tokenjét is töröljük, hogy a következő belépés újra fiókot kérjen
  try { if (t?.access) nativeGoogle()?.signOut?.(t.access); } catch { /* nem kritikus */ }
  write(null);
}
/** Lejárt/érvénytelen hozzáférési token eldobása (a frissítő token megmarad) */
export function dropAccessToken() { const t = read(); if (t) write({ ...t, expires: 0 }); }

const b64url = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = ""; bytes.forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const randomString = (n: number) => b64url(crypto.getRandomValues(new Uint8Array(n))).slice(0, n);
const emailFromIdToken = (idToken?: string) => {
  try { const p = JSON.parse(atob((idToken ?? "").split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/"))) as { email?: string }; return p.email; } catch { return undefined; }
};

type TokenResponse = { access_token?: string; expires_in?: number; refresh_token?: string; id_token?: string; error?: string; error_description?: string };
async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  return (await res.json()) as TokenResponse;
}

type NativeGoogle = { authorize: (interactive: boolean, account: string) => void; signOut?: (token: string) => void };
const nativeGoogle = () => (window as unknown as { GoogleAuth?: NativeGoogle }).GoogleAuth;

/** Belső bejelentkezés (a Google Play-szolgáltatások ablaka az app fölött, böngésző nélkül). Hibakódok: CANCELED, UI_REQUIRED, egyéb. */
function nativeAuthorize(interactive: boolean, account = ""): Promise<Tokens> {
  const bridge = nativeGoogle();
  if (!bridge) return Promise.reject(new Error("NO_BRIDGE"));
  const w = window as unknown as { __onGoogleAuth?: ((ok: boolean, access: string, email: string, err: string) => void) | undefined };
  return new Promise<Tokens>((resolve, reject) => {
    const timer = setTimeout(() => { w.__onGoogleAuth = undefined; reject(new Error("TIMEOUT")); }, 120_000);
    w.__onGoogleAuth = (ok, access, email, err) => {
      clearTimeout(timer); w.__onGoogleAuth = undefined;
      if (ok && access) resolve({ access, expires: Date.now() + 55 * 60_000, ...(email ? { email } : {}) });
      else reject(new Error(err || "ERROR"));
    };
    bridge.authorize(interactive, account);
  });
}

async function nativeSignIn(): Promise<Tokens> {
  if (nativeGoogle()) {
    try { return await nativeAuthorize(true); } catch (e) {
      // Bezárt vagy elbukott belső ablak: nem hagyjuk zsákutcában, felkínáljuk a böngészős bejelentkezést
      if (e instanceof Error && e.message === "CANCELED" && !confirm("A belső bejelentkezés megszakadt. Megpróbáljam böngészős ablakban?")) throw new Error("A bejelentkezést megszakítottad.");
      // Egyéb hiba (pl. nincs Play-szolgáltatás): tartalékként a böngészős bejelentkezés
    }
  }
  const plugins = cap()?.Plugins;
  const Browser = plugins?.Browser, App = plugins?.App;
  if (!Browser || !App) throw new Error("A bejelentkezéshez szükséges natív bővítmény hiányzik az APK-ból. Készíts új APK-t.");
  const verifier = randomString(64), state = randomString(16);
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  const url = "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({
    client_id: CLIENT_ID, redirect_uri: REDIRECT, response_type: "code", scope: SCOPE, state,
    code_challenge: challenge, code_challenge_method: "S256", access_type: "offline", prompt: "consent",
  }).toString();

  const code = await new Promise<string>((resolve, reject) => {
    let handle: Listener | undefined;
    const done = () => { clearTimeout(timer); void handle?.remove(); void Browser.close?.().catch(() => undefined); };
    const timer = setTimeout(() => { done(); reject(new Error("A bejelentkezés időtúllépés miatt megszakadt.")); }, 5 * 60_000);
    Promise.resolve(App.addListener("appUrlOpen", (ev) => {
      if (!ev.url.startsWith(`${SCHEME}:`)) return;
      let q: URLSearchParams;
      try { q = new URL(ev.url).searchParams; } catch { return; }
      if (q.get("state") !== state) return;
      done();
      const c = q.get("code");
      if (c) resolve(c); else reject(new Error("A Google-bejelentkezést megszakítottad vagy elutasították."));
    })).then((h) => { handle = h; return Browser.open({ url }); }).catch((e: unknown) => { done(); reject(e instanceof Error ? e : new Error("A böngésző megnyitása nem sikerült.")); });
  });

  const r = await tokenRequest({ client_id: CLIENT_ID, code, code_verifier: verifier, redirect_uri: REDIRECT, grant_type: "authorization_code" });
  if (!r.access_token) throw new Error(`Google-bejelentkezési hiba: ${r.error_description ?? r.error ?? "ismeretlen"}`);
  const email = emailFromIdToken(r.id_token);
  return { access: r.access_token, expires: Date.now() + ((r.expires_in ?? 3600) - 60) * 1000, ...(r.refresh_token ? { refresh: r.refresh_token } : {}), ...(email ? { email } : {}) };
}

type GisToken = { access_token?: string; expires_in?: number | string; error?: string; error_description?: string };
type GisWindow = { google?: { accounts: { oauth2: { initTokenClient: (c: { client_id: string; scope: string; callback: (r: GisToken) => void; error_callback: (e: { message?: string; type?: string }) => void }) => { requestAccessToken: (o: { prompt: string }) => void } } } } };

async function webSignIn(): Promise<Tokens> {
  if (!WEB_CLIENT_ID) throw new Error(driveSetupMessage());
  if (!(window as unknown as GisWindow).google) {
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client"; s.async = true;
      s.onload = () => resolve(); s.onerror = () => reject(new Error("A Google-bejelentkezés betöltése nem sikerült."));
      document.head.appendChild(s);
    });
  }
  const g = (window as unknown as GisWindow).google;
  if (!g) throw new Error("A Google-bejelentkezés nem érhető el.");
  return new Promise<Tokens>((resolve, reject) => {
    g.accounts.oauth2.initTokenClient({
      client_id: WEB_CLIENT_ID, scope: SCOPE,
      callback: (r) => (r.access_token ? resolve({ access: r.access_token, expires: Date.now() + (Number(r.expires_in ?? 3600) - 60) * 1000 }) : reject(new Error(r.error_description ?? r.error ?? "Google-bejelentkezési hiba"))),
      error_callback: (e) => reject(new Error(e.message ?? e.type ?? "A bejelentkezés megszakadt.")),
    }).requestAccessToken({ prompt: "" });
  });
}

let pending: Promise<string> | null = null;
/** Érvényes hozzáférési token: lejáratkor frissít, szükség esetén bejelentkezteti a felhasználót */
export function getAccessToken(interactive = true): Promise<string> {
  if (!driveConfigured()) return Promise.reject(new Error(driveSetupMessage()));
  pending ??= (async () => {
    try {
      const t = read();
      if (t && t.expires > Date.now()) return t.access;
      if (t?.refresh && isNative()) {
        const r = await tokenRequest({ client_id: CLIENT_ID, refresh_token: t.refresh, grant_type: "refresh_token" });
        if (r.access_token) {
          write({ ...t, access: r.access_token, expires: Date.now() + ((r.expires_in ?? 3600) - 60) * 1000 });
          return r.access_token;
        }
        write(null);
      }
      if (isNative() && nativeGoogle() && t) {
        // Frissítő token nélkül (belső bejelentkezés): az engedély megújítása ablak nélkül történik
        try {
          const n = await nativeAuthorize(false, t.email ?? "");
          write({ ...n, ...(n.email || !t.email ? {} : { email: t.email }) });
          return n.access;
        } catch { /* csendes megújítás nem sikerült: lent újra bejelentkeztetjük */ }
      }
      if (!interactive) throw new Error("Nincs bejelentkezve a Google-fiókba.");
      const fresh = isNative() ? await nativeSignIn() : await webSignIn();
      write({ ...fresh, ...(fresh.refresh || !t?.refresh ? {} : { refresh: t.refresh }) });
      return fresh.access;
    } finally { pending = null; }
  })();
  return pending;
}
