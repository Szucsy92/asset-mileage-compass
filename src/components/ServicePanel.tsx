import { Plus, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { actions, lastOdometer, uid, type Device } from "@/lib/fleet";
import { serviceStats, type Service } from "@/lib/maintenance";

export function ServicePanel({ dev, closed }: { dev: Device; closed: boolean }) {
  const services = dev.services ?? [];
  const reading = lastOdometer(dev);
  const update = (id: string, patch: Partial<Service>) => actions.update(dev.id, { services: services.map(s => s.id === id ? { ...s, ...patch } : s) });
  return <section className="flex flex-col gap-1 border-t border-border pt-2">
    <div className="flex items-center justify-between">
      <h2 className="flex items-center gap-1 font-display text-xs font-bold uppercase"><Wrench className="size-3" />Olajcsere, szerviz</h2>
      <Button variant="ghost" size="sm" disabled={closed} aria-label="Szervizciklus hozzáadása" className="h-6 px-1 text-primary" onClick={() => actions.update(dev.id, { services: [...services, { id: uid(), name: "Olajcsere", interval: 0, lastReading: reading }] })}><Plus />Szerviz</Button>
    </div>
    {services.map(service => {
      const stats = serviceStats(service, reading, dev.unit);
      const tone = stats.state === "overdue" ? "text-destructive border-l-destructive" : stats.state === "soon" ? "text-warning border-l-warning" : "text-muted-foreground border-l-success";
      return <div key={service.id} className={`flex flex-col gap-1 rounded-md border-l-4 bg-secondary p-1.5 ${tone}`}>
        <div className="flex items-center gap-1">
          <input aria-label="Szerviz neve" value={service.name} onChange={e => update(service.id, { name: e.target.value })} className="min-w-0 flex-1 bg-transparent text-xs font-semibold text-foreground outline-none" />
          <Button variant="ghost" size="icon" className="size-6" aria-label="Szervizciklus törlése" disabled={closed} onClick={() => { if (confirm(`Törlöd a szervizciklust: ${service.name}?`)) actions.update(dev.id, { services: services.filter(s => s.id !== service.id) }); }}><X /></Button>
        </div>
        <div className="grid grid-cols-2 gap-2 text-foreground">
          <label className="min-w-0 text-[10px] text-muted-foreground">Ciklus ({dev.unit})<input aria-label={`Szervizciklus ${dev.unit}`} type="number" min="0" step="any" value={service.interval || ""} onChange={e => update(service.id, { interval: Math.max(0, Number(e.target.value)) })} className="block w-full min-w-0 bg-transparent font-mono text-xs text-foreground outline-none" /></label>
          <label className="min-w-0 text-[10px] text-muted-foreground">Utolsó szerviz ({dev.unit})<input aria-label={`Utolsó szerviz ${dev.unit}`} type="number" min="0" step="any" value={service.lastReading} onChange={e => update(service.id, { lastReading: Math.max(0, Number(e.target.value)) })} className="block w-full min-w-0 bg-transparent font-mono text-xs text-foreground outline-none" /></label>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-1 text-[10px]">
          <span>{stats.remaining == null ? "Nincs beállított ciklus" : `${stats.state === "overdue" ? "Túllépés" : "Hátralévő"}: ${Math.abs(stats.remaining).toLocaleString("hu-HU")} ${dev.unit} · esedékes: ${stats.due?.toLocaleString("hu-HU")}`}</span>
          <Button variant="ghost" size="sm" disabled={closed} className="h-6 px-1 text-[10px] text-primary" onClick={() => { if (confirm(`Elvégezve: ${service.name}, ${reading.toLocaleString("hu-HU")} ${dev.unit} állásnál?`)) update(service.id, { lastReading: reading }); }}>Elvégezve</Button>
        </div>
      </div>;
    })}
  </section>;
}