import { expect, test } from "vitest";
import { isNewer } from "@/components/UpdateBanner";
test("newer dated build detected", () => {
  expect(isNewer("v2026.11.10.0600", "2026.11.09.0751")).toBe(true);
  expect(isNewer("v2026.11.09.0751", "2026.11.09.0751")).toBe(false);
  expect(isNewer("v2026.11.08.2359", "2026.11.09.0000")).toBe(false);
});

import { buildFromRelease, isTrustedUpdateUrl, pickUpdate } from "@/components/UpdateBanner";
const apk = { name: "technikai-eszkoz-2026.11.12.1930.apk", browser_download_url: "https://github.com/me/app/releases/download/v1/x.apk" };
test("build number is read from the tag or the release name", () => {
  expect(buildFromRelease("v2026.11.12.1930", "Technikai eszköz 2026.11.12.1930 (build29012345)")).toBe(29012345);
  expect(buildFromRelease("v2.0.0-x-build12")).toBe(12);
  expect(buildFromRelease("v2026.11.12.1930")).toBeNull();
});
test("only a higher build with an apk is offered", () => {
  const rel = { tag_name: "v1", name: "x (build20)", assets: [apk] };
  expect(pickUpdate(rel, 19)?.apkUrl).toBe(apk.browser_download_url);
  expect(pickUpdate(rel, 20)).toBeNull();
  expect(pickUpdate({ ...rel, assets: [] }, 1)).toBeNull();
});
test("only this repo's https release assets are trusted", () => {
  expect(isTrustedUpdateUrl(apk.browser_download_url, "me/app")).toBe(true);
  expect(isTrustedUpdateUrl(apk.browser_download_url, "other/app")).toBe(false);
  expect(isTrustedUpdateUrl("http://github.com/me/app/releases/download/v1/x.apk", "me/app")).toBe(false);
  expect(isTrustedUpdateUrl("https://evil.com/me/app/releases/download/v1/x.apk", "me/app")).toBe(false);
});
