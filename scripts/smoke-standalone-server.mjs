import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const STARTUP_TIMEOUT_MS = 30_000;
const REQUEST_TIMEOUT_MS = 10_000;

function getFreePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("smoke-standalone-server: failed to allocate a test port"));
        return;
      }
      server.close((error) => {
        if (error) reject(error);
        else resolvePort(address.port);
      });
    });
  });
}

async function waitForHealth(url, child, stderr, spawnError) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const startupError = spawnError();
    if (startupError) {
      throw new Error(`standalone server failed to start: ${startupError.message}${stderr()}`);
    }
    if (child.exitCode !== null) {
      throw new Error(
        `standalone server exited before health check (code ${child.exitCode})${stderr()}`
      );
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (response.status === 200) return;
    } catch {
      // The server may still be starting.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error(`standalone server did not become healthy within ${STARTUP_TIMEOUT_MS}ms${stderr()}`);
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (!child.pid) return;

  const exited = new Promise((resolveExit) => child.once("exit", resolveExit));
  if (process.platform === "win32" && child.pid) {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
  } else {
    process.kill(-child.pid, "SIGTERM");
  }

  await Promise.race([
    exited,
    new Promise((resolveTimeout) => setTimeout(resolveTimeout, 2_000)),
  ]);
  if (child.exitCode === null && child.signalCode === null) {
    if (process.platform === "win32" || !child.pid) child.kill("SIGKILL");
    else process.kill(-child.pid, "SIGKILL");
    await Promise.race([
      exited,
      new Promise((resolveTimeout) => setTimeout(resolveTimeout, 2_000)),
    ]);
  }
  if (child.exitCode === null && child.signalCode === null) {
    throw new Error(`standalone server process ${child.pid ?? "unknown"} did not exit`);
  }
}

async function getJsonArray(baseUrl, endpoint, key, stderr) {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const body = await response.text();
  if (response.status !== 200) {
    throw new Error(`GET ${endpoint} returned HTTP ${response.status}${stderr()}`);
  }
  const payload = JSON.parse(body);
  if (!Array.isArray(payload[key])) {
    throw new Error(`GET ${endpoint} did not return a ${key} array`);
  }
  return payload[key];
}

function snapshotDirectory(root) {
  const entries = [];
  function walk(directory, prefix = "") {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const path = join(directory, entry.name);
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path, relativePath);
      else if (entry.isFile()) {
        const info = statSync(path);
        entries.push([relativePath, info.size, info.mtimeMs, readFileSync(path).toString("base64")]);
      }
    }
  }
  walk(root);
  return JSON.stringify(entries);
}

const sourceStandaloneDir = resolve(process.argv[2] ?? join(process.cwd(), ".next", "standalone"));
const runtimeExecutable = resolve(process.argv[3] ?? process.execPath);
const usesElectronRuntime = process.argv[3] !== undefined;
const sourceProductRoot = resolve(process.argv[4] ?? join(sourceStandaloneDir, "..", ".."));
const sourceServerScript = join(sourceStandaloneDir, "server.js");
const piAiEntry = join(
  sourceStandaloneDir,
  "node_modules",
  "@earendil-works",
  "pi-ai",
  "dist",
  "index.js"
);

if (!existsSync(sourceServerScript)) {
  console.error(`smoke-standalone-server: server.js not found at ${sourceServerScript}`);
  process.exit(1);
}
if (!existsSync(piAiEntry)) {
  console.error(`smoke-standalone-server: Pi runtime entry not found at ${piAiEntry}`);
  process.exit(1);
}
if (!existsSync(runtimeExecutable)) {
  console.error(`smoke-standalone-server: runtime executable not found at ${runtimeExecutable}`);
  process.exit(1);
}
if (!existsSync(join(sourceProductRoot, "bundled", "workflows", "modeling-core", "1.0.0", "definition.json"))) {
  console.error(`smoke-standalone-server: HaJiMi product resources not found at ${sourceProductRoot}`);
  process.exit(1);
}

const isolatedRoot = mkdtempSync(join(tmpdir(), "pi-agent-standalone-smoke-"));
let child = null;

try {
  const standaloneDir = join(isolatedRoot, "standalone");
  const isolatedAgentDir = join(isolatedRoot, "agent");
  const uninitializedTask = join(isolatedRoot, "uninitialized-task");
  const metadataDir = join(uninitializedTask, ".hajimi");
  mkdirSync(metadataDir, { recursive: true });
  writeFileSync(join(metadataDir, "sentinel.txt"), "read-only status probe\n", "utf8");

  // Register the probe cwd exactly as a real Pi session would. The status
  // route must remain subject to the production allowed-roots policy; the
  // smoke test must not introduce a privileged test-only bypass.
  const safeSessionPath = `--${resolve(uninitializedTask).replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`;
  const authorizedSessionDir = join(isolatedAgentDir, "sessions", safeSessionPath);
  mkdirSync(authorizedSessionDir, { recursive: true });
  const sessionId = randomUUID();
  const timestamp = new Date().toISOString();
  writeFileSync(
    join(authorizedSessionDir, `${timestamp.replace(/[:.]/g, "-")}_${sessionId}.jsonl`),
    `${JSON.stringify({ type: "session", version: 3, id: sessionId, timestamp, cwd: uninitializedTask })}\n`,
    "utf8",
  );
  cpSync(sourceStandaloneDir, standaloneDir, { recursive: true });
  const serverScript = join(standaloneDir, "server.js");
  const port = await getFreePort();
  let stderrText = "";
  let childSpawnError = null;
  child = spawn(runtimeExecutable, [serverScript], {
    cwd: standaloneDir,
    env: {
      ...process.env,
      NODE_ENV: "production",
      HOSTNAME: "127.0.0.1",
      PORT: String(port),
      PI_CODING_AGENT_DIR: isolatedAgentDir,
      HAJIMI_AGENT_DIR: isolatedAgentDir,
      HAJIMI_PRODUCT_ROOT: sourceProductRoot,
      ...(usesElectronRuntime ? { ELECTRON_RUN_AS_NODE: "1" } : {}),
    },
    stdio: ["ignore", "ignore", "pipe"],
    detached: process.platform !== "win32",
    windowsHide: true,
  });
  child.stderr?.on("data", (chunk) => {
    stderrText = `${stderrText}${chunk.toString()}`.slice(-8_000);
  });
  child.once("error", (error) => {
    childSpawnError = error;
  });
  const stderr = () => (stderrText.trim() ? `\n${stderrText.trim()}` : "");

  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForHealth(`${baseUrl}/api/health`, child, stderr, () => childSpawnError);

  const sessions = await getJsonArray(baseUrl, "/api/sessions", "sessions", stderr);
  const providers = await getJsonArray(baseUrl, "/api/auth/providers", "providers", stderr);
  for (const endpoint of ["/api/hajimi/projects", "/api/hajimi/inputs"]) {
    const response = await fetch(`${baseUrl}${endpoint}`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (response.status !== 405) throw new Error(`GET ${endpoint} must be disabled; received ${response.status}`);
  }
  const sessionsAfterRead = await getJsonArray(baseUrl, "/api/sessions", "sessions", stderr);
  if (sessionsAfterRead.length !== sessions.length) throw new Error("Read-only startup probes created a new session");

  const beforeStatus = snapshotDirectory(metadataDir);
  const statusResponse = await fetch(`${baseUrl}/api/hajimi/status?cwd=${encodeURIComponent(uninitializedTask)}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const statusBody = await statusResponse.text();
  if (statusResponse.status !== 404) {
    throw new Error(`GET /api/hajimi/status returned HTTP ${statusResponse.status}: ${statusBody}${stderr()}`);
  }
  const afterStatus = snapshotDirectory(metadataDir);
  if (afterStatus !== beforeStatus) throw new Error("GET /api/hajimi/status modified .hajimi metadata");

  console.log(
    `smoke-standalone-server: health 200, sessions 200 (${sessions.length}), auth providers 200 (${providers.length}), HaJiMi status 404/read-only, modeling create/upload GET 405, no implicit session creation`
  );
} catch (error) {
  console.error(`smoke-standalone-server: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  try {
    if (child) await stopChild(child);
  } finally {
    rmSync(isolatedRoot, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
  }
}
