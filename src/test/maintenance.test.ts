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