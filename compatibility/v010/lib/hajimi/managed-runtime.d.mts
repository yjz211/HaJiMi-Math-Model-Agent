/// <reference types="node" />
export interface ManagedRuntime {
  root: string;
  generation: string;
  digest: string;
  envelope: unknown;
  manifest: {
    format: string; abi: number; version: string; platform: string; arch: string;
    tools: Record<string, string>;
    capabilities: Record<string, boolean | string>;
    files: Array<{ path: string; size: number; sha256: string }>;
    archive: { file: string; size: number; sha256: string; url?: string };
  };
}
export const RUNTIME_ABI: number;
export const MIN_WINDOWS_BUILD: number;
export function windowsBuildNumber(release?: string): number;
export function isSupportedWindowsHost(platform?: NodeJS.Platform, arch?: string, release?: string): boolean;
export function sha256(bytes: string | Buffer): string;
export function hashFile(path: string): Promise<string>;
export function runtimeConfig(productRoot?: string): { home: string; productRoot: string; cache: string };
export function cancelRuntimeInstallation(productRoot?: string): boolean;
export function decodeRelease(envelope: unknown, trust: unknown): Pick<ManagedRuntime, "manifest" | "digest" | "envelope">;
export function allowedUrl(value: string, origins: string[]): URL;
export function checkDirectoryPath(path: string): Promise<void>;
export function verifyRuntimeTree(runtime: ManagedRuntime, signal?: AbortSignal, force?: boolean): Promise<ManagedRuntime>;
export function invalidateRuntimeVerification(runtime: ManagedRuntime): void;
export function runtimeStatus(productRoot?: string, verifyFiles?: boolean): Promise<Record<string, unknown>>;
export function ensureManagedRuntime(productRoot?: string, options?: { signal?: AbortSignal; repair?: boolean }): Promise<ManagedRuntime>;
export function rollbackManagedRuntime(productRoot?: string, signal?: AbortSignal): Promise<{ version: string; generation: string }>;
export function loadManagedRuntime(productRoot?: string): Promise<ManagedRuntime>;
export function runManagedGit(cwd: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }>;
