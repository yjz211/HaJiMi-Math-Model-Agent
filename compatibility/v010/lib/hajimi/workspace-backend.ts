import { spawn } from "node:child_process";
import { lstatSync, realpathSync } from "node:fs";
import { extname, relative, resolve, sep } from "node:path";

import type {
  BashOperations,
  EditOperations,
  ReadOperations,
  WriteOperations,
} from "@earendil-works/pi-coding-agent";

const MAX_CAPTURE_BYTES = 8 * 1024 * 1024;
const DEFAULT_TIMEOUT_SECONDS = 120;

export interface WslBackendOptions {
  distribution?: string;
  toolkitRoot?: string;
  readonlyRoots?: string[];
  capabilitiesRoot?: string;
}

export interface WslExecutionResult {
  exitCode: number | null;
  stdout: Buffer;
  stderr: Buffer;
}

export class WslWorkspaceBackend {
  readonly hostRoot: string;
  readonly wslRoot: string;
  readonly distribution: string;
  readonly toolkitWslRoot?: string;
  readonly readonlyRoots: string[];
  readonly capabilitiesWslRoot?: string;

  constructor(hostRoot: string, options: WslBackendOptions = {}) {
    this.hostRoot = resolve(hostRoot);
    this.wslRoot = windowsPathToWsl(this.hostRoot);
    this.distribution = options.distribution ?? process.env.HAJIMI_WSL_DISTRIBUTION ?? "Ubuntu";
    this.toolkitWslRoot = options.toolkitRoot ? windowsPathToWsl(resolve(options.toolkitRoot)) : undefined;
    this.readonlyRoots = (options.readonlyRoots ?? []).map((root) => resolve(root));
    this.capabilitiesWslRoot = options.capabilitiesRoot ? windowsPathToWsl(resolve(options.capabilitiesRoot)) : undefined;
  }

  describe(): { kind: "wsl2"; distribution: string; workspace: string } {
    return { kind: "wsl2", distribution: this.distribution, workspace: "/workspace" };
  }

  readOperations(): ReadOperations {
    return {
      readFile: (path) => this.readFile(path),
      access: (path) => this.access(path, "read"),
      detectImageMimeType: async (path) => imageMimeType(path),
    };
  }

  writeOperations(): WriteOperations {
    return {
      writeFile: (path, content) => this.writeFile(path, content),
      mkdir: (path) => this.mkdir(path),
    };
  }

  editOperations(): EditOperations {
    return {
      readFile: (path) => this.readFile(path),
      access: (path) => this.access(path, "write"),
      writeFile: (path, content) => this.writeFile(path, content),
    };
  }

  bashOperations(): BashOperations {
    return {
      exec: async (command, cwd, options) => {
        const result = await this.runShell(command, {
          cwd,
          signal: options.signal,
          timeoutSeconds: options.timeout,
          onData: options.onData,
        });
        return { exitCode: result.exitCode };
      },
    };
  }

  async health(): Promise<Record<string, unknown>> {
    const result = await this.runShell(
      "python -c \"import json,os,platform,shutil; import matplotlib,numpy,pandas,scipy; print(json.dumps({'python':platform.python_version(),'numpy':numpy.__version__,'pandas':pandas.__version__,'scipy':scipy.__version__,'matplotlib':matplotlib.__version__,'xelatex':shutil.which('xelatex'),'cwd':os.getcwd()}))\"",
      { cwd: this.hostRoot, timeoutSeconds: 20 },
    );
    if (result.exitCode !== 0) throw new Error(result.stderr.toString("utf8").trim() || "WSL health check failed");
    return {
      ...this.describe(),
      ...(JSON.parse(result.stdout.toString("utf8")) as Record<string, unknown>),
    };
  }

  async readFile(hostPath: string): Promise<Buffer> {
    const path = this.toWslPath(hostPath, "read");
    const result = await this.runProgram(
      ["python3", "-c", "import pathlib,sys; sys.stdout.buffer.write(pathlib.Path(sys.argv[1]).read_bytes())", path],
      { timeoutSeconds: 30 },
    );
    ensureSuccess(result, `Unable to read ${this.displayPath(hostPath)}`);
    return result.stdout;
  }

  async writeFile(hostPath: string, content: string): Promise<void> {
    const path = this.toWslPath(hostPath, "write");
    const result = await this.runProgram(
      [
        "python3",
        "-c",
        "import pathlib,sys; p=pathlib.Path(sys.argv[1]); p.parent.mkdir(parents=True,exist_ok=True); p.write_bytes(sys.stdin.buffer.read())",
        path,
      ],
      { input: Buffer.from(content, "utf8"), timeoutSeconds: 30 },
    );
    ensureSuccess(result, `Unable to write ${this.displayPath(hostPath)}`);
  }

  async mkdir(hostPath: string): Promise<void> {
    const path = this.toWslPath(hostPath, "write");
    const result = await this.runProgram(
      ["python3", "-c", "import pathlib,sys; pathlib.Path(sys.argv[1]).mkdir(parents=True,exist_ok=True)", path],
      { timeoutSeconds: 30 },
    );
    ensureSuccess(result, `Unable to create ${this.displayPath(hostPath)}`);
  }

  async access(hostPath: string, mode: "read" | "write"): Promise<void> {
    const path = this.toWslPath(hostPath, mode);
    const check = mode === "read" ? "os.R_OK" : "os.R_OK|os.W_OK";
    const result = await this.runProgram(
      [
        "python3",
        "-c",
        `import os,sys; p=sys.argv[1]; raise SystemExit(0 if os.path.exists(p) and os.access(p,${check}) else 2)`,
        path,
      ],
      { timeoutSeconds: 15 },
    );
    ensureSuccess(result, `Path is not ${mode === "read" ? "readable" : "writable"}: ${this.displayPath(hostPath)}`);
  }

  async list(hostPath: string, limit = 500): Promise<string[]> {
    const path = this.toWslPath(hostPath, "read");
    const result = await this.runProgram(
      [
        "python3",
        "-c",
        "import json,pathlib,sys; p=pathlib.Path(sys.argv[1]); lim=int(sys.argv[2]); print(json.dumps([x.name+('/' if x.is_dir() else '') for x in sorted(p.iterdir(),key=lambda x:(not x.is_dir(),x.name.lower()))][:lim]))",
        path,
        String(Math.max(1, Math.min(limit, 5000))),
      ],
      { timeoutSeconds: 30 },
    );
    ensureSuccess(result, `Unable to list ${this.displayPath(hostPath)}`);
    return JSON.parse(result.stdout.toString("utf8")) as string[];
  }

  async find(hostPath: string, pattern: string, limit = 1000): Promise<string[]> {
    const path = this.toWslPath(hostPath, "read");
    const result = await this.runProgram(
      [
        "python3",
        "-c",
        [
          "import fnmatch,json,pathlib,sys",
          "root=pathlib.Path(sys.argv[1]); pattern=sys.argv[2]; limit=int(sys.argv[3]); out=[]",
          "for p in root.rglob('*'):",
          " r=p.relative_to(root).as_posix()",
          " if '.git' in p.parts or 'node_modules' in p.parts or '.hajimi' in p.parts: continue",
          " if fnmatch.fnmatch(r,pattern) or fnmatch.fnmatch(p.name,pattern): out.append(r+('/' if p.is_dir() else ''))",
          " if len(out)>=limit: break",
          "print(json.dumps(out))",
        ].join("\n"),
        path,
        pattern,
        String(Math.max(1, Math.min(limit, 5000))),
      ],
      { timeoutSeconds: 60 },
    );
    ensureSuccess(result, `Unable to search ${this.displayPath(hostPath)}`);
    return JSON.parse(result.stdout.toString("utf8")) as string[];
  }

  async grep(input: {
    hostPath: string;
    pattern: string;
    glob?: string;
    ignoreCase?: boolean;
    literal?: boolean;
    context?: number;
    limit?: number;
  }): Promise<string> {
    const path = this.toWslPath(input.hostPath, "read");
    const spec = JSON.stringify({
      pattern: input.pattern,
      glob: input.glob ?? "*",
      ignoreCase: input.ignoreCase ?? false,
      literal: input.literal ?? false,
      context: Math.max(0, Math.min(input.context ?? 0, 20)),
      limit: Math.max(1, Math.min(input.limit ?? 100, 2000)),
    });
    const result = await this.runProgram(
      [
        "python3",
        "-c",
        [
          "import fnmatch,json,pathlib,re,sys",
          "root=pathlib.Path(sys.argv[1]); cfg=json.loads(sys.argv[2]); flags=re.I if cfg['ignoreCase'] else 0",
          "rx=re.compile(re.escape(cfg['pattern']) if cfg['literal'] else cfg['pattern'],flags); out=[]",
          "files=[root] if root.is_file() else root.rglob('*')",
          "for p in files:",
          " if not p.is_file() or '.git' in p.parts or 'node_modules' in p.parts or '.hajimi' in p.parts: continue",
          " rel=p.name if root.is_file() else p.relative_to(root).as_posix()",
          " if not fnmatch.fnmatch(rel,cfg['glob']) and not fnmatch.fnmatch(p.name,cfg['glob']): continue",
          " try: lines=p.read_text(encoding='utf-8').splitlines()",
          " except (UnicodeDecodeError,OSError): continue",
          " for i,line in enumerate(lines):",
          "  if not rx.search(line): continue",
          "  start=max(0,i-cfg['context']); end=min(len(lines),i+cfg['context']+1)",
          "  for j in range(start,end): out.append(f'{rel}:{j+1}: {lines[j][:500]}')",
          "  if len(out)>=cfg['limit']: break",
          " if len(out)>=cfg['limit']: break",
          "print('\\n'.join(out[:cfg['limit']]))",
        ].join("\n"),
        path,
        spec,
      ],
      { timeoutSeconds: 60 },
    );
    ensureSuccess(result, `Unable to grep ${this.displayPath(input.hostPath)}`);
    return result.stdout.toString("utf8").trim() || "No matches found";
  }

  async runShell(
    command: string,
    options: {
      cwd?: string;
      signal?: AbortSignal;
      timeoutSeconds?: number;
      onData?: (data: Buffer) => void;
    } = {},
  ): Promise<WslExecutionResult> {
    const cwd = options.cwd ? this.toWslPath(options.cwd, "read") : this.wslRoot;
    const timeout = Math.max(1, Math.min(options.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS, 24 * 60 * 60));
    const toolkit = this.toolkitWslRoot ?? "-";
    const capabilities = this.capabilitiesWslRoot ?? "-";
    const wrapper = [
      'export PATH="$HOME/.hajimi/bin:$HOME/.hajimi/venv/bin:$HOME/.local/bin:$PATH"',
      'if [ "$2" != "-" ]; then export PYTHONPATH="$2${PYTHONPATH:+:$PYTHONPATH}"; fi',
      'if [ "$3" != "-" ]; then export HAJIMI_CAPABILITIES_ROOT="$3"; fi',
      'exec bash -lc "$1"',
    ].join("; ");
    return this.runProgram(["bash", "-lc", wrapper, "hajimi", command, toolkit, capabilities], {
      cwdWsl: cwd,
      signal: options.signal,
      timeoutSeconds: timeout + 5,
      onData: options.onData,
    });
  }

  resolveHostPath(inputPath: string): string {
    const stripped = inputPath.startsWith("@") ? inputPath.slice(1) : inputPath;
    const resolvedPath = resolve(this.hostRoot, stripped);
    this.assertAuthorizedPath(resolvedPath, "read");
    return resolvedPath;
  }

  displayPath(hostPath: string): string {
    const resolvedPath = resolve(hostPath);
    const readonlyRoot = this.readonlyRoots.find((root) => isWithin(resolvedPath, root));
    if (readonlyRoot) {
      const guidanceRel = relative(readonlyRoot, resolvedPath).replaceAll("\\", "/");
      return guidanceRel ? `/hajimi-guidance/${guidanceRel}` : "/hajimi-guidance";
    }
    const rel = relative(this.hostRoot, resolvedPath).replaceAll("\\", "/");
    return rel ? `/workspace/${rel}` : "/workspace";
  }

  private toWslPath(hostPath: string, mode: "read" | "write"): string {
    const resolvedPath = resolve(hostPath);
    const authorizedRoot = this.assertAuthorizedPath(resolvedPath, mode);
    if (authorizedRoot !== this.hostRoot) return windowsPathToWsl(resolvedPath);
    const rel = relative(this.hostRoot, resolvedPath).replaceAll("\\", "/");
    const segments = rel.split("/").filter(Boolean);
    if (segments.includes(".hajimi")) throw new Error(".hajimi is managed by HaJiMi and is not directly accessible");
    if (mode === "write" && segments[0]?.toLowerCase() === "input") {
      throw new Error("input/ is frozen and read-only; write generated files under work/, data/derived/, figures/, paper/, or output/");
    }
    return rel ? `${this.wslRoot}/${rel}` : this.wslRoot;
  }

  private assertAuthorizedPath(path: string, mode: "read" | "write"): string {
    const roots = mode === "read" ? [this.hostRoot, ...this.readonlyRoots] : [this.hostRoot];
    const authorizedRoot = roots.find((root) => isWithin(path, root));
    if (!authorizedRoot) {
      throw new Error(`Path escapes the HaJiMi task workspace: ${path}`);
    }
    const rootReal = realpathSync.native(authorizedRoot).toLowerCase();
    const rel = relative(authorizedRoot, path);
    let current = authorizedRoot;
    for (const segment of rel.split(/[\\/]/).filter(Boolean)) {
      current = resolve(current, segment);
      try {
        const info = lstatSync(current);
        if (info.isSymbolicLink()) {
          throw new Error(`Symbolic links and junctions are not allowed in the HaJiMi workspace path: ${current}`);
        }
        const currentReal = realpathSync.native(current).toLowerCase();
        if (currentReal !== rootReal && !currentReal.startsWith(`${rootReal}${sep}`)) {
          throw new Error(`Resolved path escapes the HaJiMi task workspace: ${current}`);
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") break;
        throw error;
      }
    }
    return authorizedRoot;
  }

  private runProgram(
    args: string[],
    options: {
      cwd?: string;
      cwdWsl?: string;
      input?: Buffer;
      signal?: AbortSignal;
      timeoutSeconds?: number;
      onData?: (data: Buffer) => void;
    } = {},
  ): Promise<WslExecutionResult> {
    const cwdWsl = options.cwdWsl ?? (options.cwd ? this.toWslPath(options.cwd, "read") : undefined);
    const wslArgs = ["-d", this.distribution];
    if (cwdWsl) wslArgs.push("--cd", cwdWsl);
    wslArgs.push("--exec", ...args);

    return new Promise((resolvePromise, reject) => {
      const child = spawn("wsl.exe", wslArgs, {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
        env: sanitizedWindowsEnvironment(),
      });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let captured = 0;
      let timedOut = false;
      const timeoutSeconds = options.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, timeoutSeconds * 1000);

      const onAbort = () => child.kill();
      options.signal?.addEventListener("abort", onAbort, { once: true });
      child.stdout.on("data", (chunk: Buffer) => {
        options.onData?.(chunk);
        if (captured < MAX_CAPTURE_BYTES) {
          stdout.push(chunk.subarray(0, MAX_CAPTURE_BYTES - captured));
          captured += chunk.length;
        }
      });
      child.stderr.on("data", (chunk: Buffer) => {
        options.onData?.(chunk);
        if (captured < MAX_CAPTURE_BYTES) {
          stderr.push(chunk.subarray(0, MAX_CAPTURE_BYTES - captured));
          captured += chunk.length;
        }
      });
      child.on("error", (error) => {
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", onAbort);
        reject(error);
      });
      child.on("close", (exitCode) => {
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", onAbort);
        if (options.signal?.aborted) {
          reject(new Error("WSL operation aborted"));
          return;
        }
        if (timedOut) {
          reject(new Error(`WSL operation timed out after ${timeoutSeconds}s`));
          return;
        }
        resolvePromise({ exitCode, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) });
      });
      if (options.input) child.stdin.end(options.input);
      else child.stdin.end();
    });
  }
}

function isWithin(path: string, root: string): boolean {
  const normalizedRoot = root.toLowerCase();
  const candidate = path.toLowerCase();
  return candidate === normalizedRoot || candidate.startsWith(`${normalizedRoot}${sep}`);
}

export function windowsPathToWsl(path: string): string {
  const normalized = resolve(path);
  const driveMatch = /^([A-Za-z]):[\\/](.*)$/.exec(normalized);
  if (driveMatch) {
    return `/mnt/${driveMatch[1].toLowerCase()}/${driveMatch[2].replaceAll("\\", "/")}`;
  }
  const uncMatch = /^\\\\(?:wsl\$|wsl\.localhost)\\[^\\]+\\?(.*)$/i.exec(normalized);
  if (uncMatch) return `/${uncMatch[1].replaceAll("\\", "/")}`.replace(/\/$/, "") || "/";
  throw new Error(`HaJiMi WSL backend does not support this workspace path: ${path}`);
}

function sanitizedWindowsEnvironment(): NodeJS.ProcessEnv {
  const allow = ["SystemRoot", "WINDIR", "PATH", "Path", "PATHEXT", "TEMP", "TMP", "USERPROFILE", "WSLENV"];
  return {
    NODE_ENV: process.env.NODE_ENV ?? "production",
    ...Object.fromEntries(allow.flatMap((key) => (process.env[key] === undefined ? [] : [[key, process.env[key]]]))),
  } as NodeJS.ProcessEnv;
}

function ensureSuccess(result: WslExecutionResult, prefix: string): void {
  if (result.exitCode === 0) return;
  const detail = result.stderr.toString("utf8").trim() || result.stdout.toString("utf8").trim();
  throw new Error(`${prefix}${detail ? `: ${detail}` : ""}`);
}

function imageMimeType(path: string): string | null {
  return ({
    ".gif": "image/gif",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
  } as Record<string, string>)[extname(path).toLowerCase()] ?? null;
}
