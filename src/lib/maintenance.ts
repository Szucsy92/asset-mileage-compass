import type { Device } from "./fleet";

export type Service = { id: string; name: string; interval: number; lastReading: number };
export function serviceStats(service: Service, reading: number, unit: Device["unit"]) {
  if (!Number.isFinite(service.interval) || service.interval <= 0) return { due: null, remaining: null, state: "none" as const };
  const due = service.lastReading + service.interval;
  const remaining = due - reading;
  const state = remaining < 0 ? "overdue" : remaining <= (unit === "km" ? 1000 : 100) ? "soon" : "ok";
  return { due, remaining, state };
}

export function compareDeadlines(a: number, b: number) {
  if ((a < 0) !== (b < 0)) return a < 0 ? 1 : -1;
  return a < 0 ? b - a : a - b;
}