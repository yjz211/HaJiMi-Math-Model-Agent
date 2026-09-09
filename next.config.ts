import type { NextConfig } from "next";
import { readFileSync } from "fs";
import { join } from "path";

const { version } = JSON.parse(readFileSync(join(__dirname, "package.json"), "utf8")) as { version: string };
let piVersion = "unknown";
try {
  const piPkgPath = join(__dirname, "node_modules/@earendil-works/pi-coding-agent/package.json");
  piVersion = (JSON.parse(readFileSync(piPkgPath, "utf8")) as { version: string }).version;
} catch { /* package not found, use default */ }

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: { root: __dirname },
  outputFileTracingRoot: __dirname,
  serverExternalPackages: ["@earendil-works/pi-coding-agent", "@earendil-works/pi-ai"],
  allowedDevOrigins: ["127.0.0.1", "localhost", "192.168.*.*"],
  outputFileTracingIncludes: {
    "/*": ["./node_modules/@earendil-works/pi-ai/**/*"],
  },
  outputFileTracingExcludes: {
    '*': [
      'release/**/*',
      'docs/local-archive/**/*',
      '.git/**/*',
      'dist/**/*',
      // Electron ships the signed archive once under resources/hajimi/runtime.
      'runtime/windows/payloads/**/*',
      'runtime/windows/drawio/**/*',
      'compatibility/v010/runtime/windows/payloads/**/*',
      'compatibility/v010/runtime/windows/drawio/**/*',
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.test.mjs',
      '**/*.test.js',
      'middleware.test.ts',
      'package.test.ts',
    ],
  },
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
    NEXT_PUBLIC_PI_VERSION: piVersion,
  },
};

export default nextConfig;
