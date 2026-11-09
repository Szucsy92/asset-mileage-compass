import { expect, test } from "vitest";
import { isNewer } from "@/components/UpdateBanner";
test("newer dated build detected", () => {
  expect(isNewer("v2026.11.10.0600", "2026.11.09.0751")).toBe(true);
  expect(isNewer("v2026.11.09.0751", "2026.11.09.0751")).toBe(false);
  expect(isNewer("v2026.11.08.2359", "2026.11.09.0000")).toBe(false);
});
