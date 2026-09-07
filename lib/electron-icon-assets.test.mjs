import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const mainSource = readFileSync(new URL("../electron/main.ts", import.meta.url), "utf8");
const traySource = readFileSync(new URL("../electron/tray.ts", import.meta.url), "utf8");
const builderConfig = readFileSync(new URL("../electron-builder.yml", import.meta.url), "utf8");

test("desktop window uses the packaged HaJiMi app icon", () => {
  assert.match(mainSource, /BrowserWindow\(\{/);
  assert.match(mainSource, /icon:\s*nativeImage\.createFromPath/);
  assert.match(mainSource, /getAppIconPath\(app\.getAppPath\(\)\)/);
});

test("tray uses the same packaged HaJiMi app icon instead of the broken placeholder", () => {
  assert.match(traySource, /getAppIconPath\(app\.getAppPath\(\)\)/);
  assert.doesNotMatch(traySource, /tray-icon\.ico/);
});

test("native Windows and macOS app icons are included in the Electron runtime package", () => {
  assert.match(builderConfig, /-\s+build\/icon\.ico/);
  assert.match(builderConfig, /-\s+build\/icon\.icns/);
  assert.doesNotMatch(builderConfig, /-\s+build\/tray-icon\.ico/);
  const winIcon = readFileSync(new URL("../build/icon.ico", import.meta.url));
  assert.equal(winIcon.readUInt16LE(2), 1);
  assert.equal(winIcon.readUInt16LE(4), 7);
  for (let i = 0; i < 7; i++) {
    const entry = 6 + i * 16, length = winIcon.readUInt32LE(entry + 8), offset = winIcon.readUInt32LE(entry + 12);
    assert.ok(length > 0 && offset + length <= winIcon.length);
    assert.equal(winIcon.subarray(offset + 1, offset + 4).toString("ascii"), "PNG");
  }
  assert.deepEqual(readFileSync(new URL("../app/favicon.ico", import.meta.url)), winIcon);
  const macIcon = readFileSync(new URL("../build/icon.icns", import.meta.url));
  assert.equal(macIcon.subarray(0, 4).toString("ascii"), "icns");
  assert.equal(macIcon.readUInt32BE(4), macIcon.length);
  assert.equal(macIcon.subarray(8, 12).toString("ascii"), "icp4");
});
