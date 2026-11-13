import { describe, expect, it } from "vitest";
import { compareDeadlines, serviceStats } from "@/lib/maintenance";

const service = { id: "oil", name: "Olajcsere", lastReading: 5000, interval: 10000 };
describe("Service intervals", () => {
  it("warns at 1000 km remaining, not at 1001", () => {
    expect(serviceStats(service, 14000, "km")).toMatchObject({ remaining: 1000, state: "soon" });
    expect(serviceStats(service, 13999, "km").state).toBe("ok");
  });
  it("warns at 100 operating hours remaining, not at 101", () => {
    expect(serviceStats(service, 14900, "üó")).toMatchObject({ remaining: 100, state: "soon" });
    expect(serviceStats(service, 14899, "üó").state).toBe("ok");
  });
  it("is red only after exceeding the due reading", () => {
    expect(serviceStats(service, 15000, "km").state).toBe("soon");
    expect(serviceStats(service, 15001, "km")).toMatchObject({ due: 15000, remaining: -1, state: "overdue" });
  });
  it("does not warn for an unset interval", () => {
    expect(serviceStats({ ...service, interval: 0 }, 20000, "km").state).toBe("none");
  });
});
it("puts upcoming deadlines before expired ones and oldest expired last", () => {
  expect([ -90, 20, -1, 0, 5, -30 ].sort(compareDeadlines)).toEqual([0, 5, 20, -1, -30, -90]);
});
import { isOilService, oilDue, serviceDue, yearStats } from "@/lib/maintenance";
describe("olajcsere esedékesség a táblázatból", () => {
  it("a táblázatban megadott esedékes állás elsőbbséget élvez, ciklus nélkül is működik", () => {
    expect(serviceDue({ ...service, dueAt: 20000 })).toBe(20000);
    expect(serviceStats({ ...service, interval: 0, dueAt: 20000 }, 19500, "km")).toMatchObject({ due: 20000, remaining: 500, state: "soon" });
    expect(serviceStats({ ...service, dueAt: 20000 }, 20001, "km").state).toBe("overdue");
  });
  it("az olajcsere az E9-be kerülő érték", () => {
    expect(isOilService("Olajcsere")).toBe(true);
    expect(isOilService("Fékcsere")).toBe(false);
    const dev = { services: [service] } as never;
    expect(oilDue(dev)).toBe(15000);
  });
});
describe("éves km keret", () => {
  it("a táblázat F4 cellájával egyező hátralévő érték és állapot", () => {
    expect(yearStats(10000, 8999, "km")).toMatchObject({ remaining: 1001, state: "ok" });
    expect(yearStats(10000, 9000, "km")).toMatchObject({ remaining: 1000, state: "soon" });
    expect(yearStats(10000, 10500, "km")).toMatchObject({ remaining: -500, state: "overdue" });
    expect(yearStats(0, 500, "km").state).toBe("none");
  });
});
