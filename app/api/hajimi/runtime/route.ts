import { NextResponse } from "next/server";
import { cancelRuntimeInstallation, ensureManagedRuntime, rollbackManagedRuntime, runtimeStatus } from "@/lib/hajimi/managed-runtime.mjs";

export const runtime = "nodejs";
const holder = globalThis as typeof globalThis & { __hajimiRuntimeOperation?: AbortController };
const productRoot = () => process.env.HAJIMI_PRODUCT_ROOT ?? process.cwd();

export async function GET() {
  return NextResponse.json(await runtimeStatus(productRoot()), { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request) {
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || origin !== url.origin) {
    return NextResponse.json({ error: "Same-origin local desktop request required" }, { status: 403 });
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) return NextResponse.json({ error: "JSON required" }, { status: 415 });
  try {
    const reader = request.body?.getReader(); let raw = ""; let bytes = 0; const decoder = new TextDecoder();
    if (!reader) throw new Error("Missing request body");
    for (;;) { const part = await reader.read(); if (part.done) break; bytes += part.value.length; if (bytes > 4096) { await reader.cancel(); throw new Error("Request body too large"); } raw += decoder.decode(part.value, { stream: true }); }
    raw += decoder.decode();
    const body = JSON.parse(raw) as { action?: string };
    if (Object.keys(body).some(key => key !== "action") || !["ensure", "repair", "verify", "rollback", "cancel"].includes(body.action ?? "")) return NextResponse.json({ error: "Invalid runtime action" }, { status: 400 });
    if (body.action === "cancel") { const active = cancelRuntimeInstallation(productRoot()); holder.__hajimiRuntimeOperation?.abort(); return NextResponse.json({ status: active || holder.__hajimiRuntimeOperation ? "cancelling" : "idle" }); }
    if (body.action === "verify") return NextResponse.json(await runtimeStatus(productRoot(), true));
    if (holder.__hajimiRuntimeOperation) return NextResponse.json({ status: "busy" }, { status: 409 });
    const controller = new AbortController(); holder.__hajimiRuntimeOperation = controller;
    const signal = AbortSignal.any([controller.signal, request.signal, AbortSignal.timeout(30 * 60 * 1000)]);
    try {
      if (body.action === "rollback") return NextResponse.json(await rollbackManagedRuntime(productRoot(), signal));
      const installed = await ensureManagedRuntime(productRoot(), { signal, repair: body.action === "repair" });
      return NextResponse.json({ status: "ready", version: installed.manifest.version, generation: installed.generation });
    } finally { if (holder.__hajimiRuntimeOperation === controller) delete holder.__hajimiRuntimeOperation; }
  } catch (error) {
    const e = error as Error & { code?: string };
    return NextResponse.json({ status: e.code === "BUSY" ? "busy" : "error", error: e.message }, { status: e.code === "BUSY" ? 409 : 400 });
  }
}
