import { useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Plus, UserRound, X } from "lucide-react";
import { forgetAccount, knownAccounts, signInAccount, type KnownAccount } from "@/lib/googleAuth";

function Avatar({ account }: { account: KnownAccount }) {
  const [broken, setBroken] = useState(false);
  const initial = (account.name || account.email).trim().charAt(0).toUpperCase();
  return account.photo && !broken ? (
    <img src={account.photo} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} className="size-11 shrink-0 rounded-full object-cover" />
  ) : (
    <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary/20 font-bold text-primary">{initial || <UserRound className="size-5" />}</span>
  );
}

/** Bejelentkezési panel az app stílusában: a már használt fiókok profilképpel, vagy másik fiók hozzáadása */
export function AccountPanel({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [accounts, setAccounts] = useState<KnownAccount[]>(() => knownAccounts());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const pick = async (email?: string) => {
    setBusy(email ?? "new"); setError("");
    try { await signInAccount(email); onDone(); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : "A bejelentkezés nem sikerült."); }
    finally { setBusy(null); }
  };
  const remove = (email: string) => { forgetAccount(email); setAccounts(knownAccounts()); };

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 p-3 sm:items-center" onClick={() => { if (!busy) onClose(); }}>
      <div role="dialog" aria-label="Bejelentkezés" onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-3xl border bg-card p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] text-card-foreground shadow-2xl animate-in fade-in slide-in-from-bottom-4">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-bold">Bejelentkezés Google-fiókkal</h2>
          <button aria-label="Bezárás" disabled={!!busy} onClick={onClose} className="rounded-full p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-50"><X className="size-5" /></button>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">{accounts.length ? "A Drive-táblázat eléréséhez válaszd ki a fiókot." : "Az Android nem adja ki az appoknak a fiókok listáját, ezért az első belépéskor a Google fiókválasztója nyílik meg. Utána a használt fiókok itt jelennek meg profilképpel."}</p>
        <ul className="space-y-1.5">
          {accounts.map((a) => (
            <li key={a.email} className="flex items-center gap-1">
              <button disabled={!!busy} onClick={() => void pick(a.email)}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border bg-background/60 p-2.5 text-left transition active:scale-[0.99] disabled:opacity-60">
                <Avatar account={a} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{a.name || a.email}</span>
                  {a.name && <span className="block truncate text-xs text-muted-foreground">{a.email}</span>}
                </span>
                {busy === a.email && <Loader2 className="size-5 animate-spin text-primary" />}
              </button>
              <button aria-label={`${a.email} eltávolítása a listából`} disabled={!!busy} onClick={() => remove(a.email)} className="rounded-full p-2 text-muted-foreground hover:bg-muted disabled:opacity-50"><X className="size-4" /></button>
            </li>
          ))}
        </ul>
        <button disabled={!!busy} onClick={() => void pick()}
          className="mt-2 flex w-full items-center gap-3 rounded-2xl border border-dashed p-2.5 text-left transition active:scale-[0.99] disabled:opacity-60">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-muted">{busy === "new" ? <Loader2 className="size-5 animate-spin text-primary" /> : <Plus className="size-5" />}</span>
          <span className="font-semibold">{accounts.length ? "Másik fiók" : "Fiók kiválasztása"}</span>
        </button>
        {busy && <p className="mt-3 text-center text-sm text-muted-foreground">Bejelentkezés… Hagyd jóvá a Google ablakban, ha kéri.</p>}
        {error && <p role="alert" className="mt-3 rounded-xl bg-destructive/15 p-2.5 text-sm text-destructive">{error}</p>}
      </div>
    </div>,
    document.body,
  );
}
