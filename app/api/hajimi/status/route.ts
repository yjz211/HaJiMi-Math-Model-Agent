import { lstat, realpath } from "node:fs/promises";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { errorMessage, getRequestId, logApiError } from "@/lib/api-error";
import { getAllowedRoots, isPathAllowed } from "@/lib/allowed-roots";
import { validateAgentCwd } from "@/lib/path-policy";
import {
  readHajimiTask,
  readHajimiValidation,
} from "@/lib/hajimi/task-state";
import { createWorkspaceBackend } from "@/lib/hajimi/workspace-backend-factory";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  const requestedCwd = request.nextUrl.searchParams.get("cwd");
  if (!requestedCwd) {
    return NextResponse.json(
      { error: "cwd is required" },
      { status: 400, headers: { "x-request-id": requestId } },
    );
  }

  try {
    const policyError = validateAgentCwd(requestedCwd);
    if (policyError) {
      return NextResponse.json(
        { error: policyError },
        { status: 403, headers: { "x-request-id": requestId } },
      );
    }
    const cwd = await realpath(requestedCwd);
    let isInitializedHajimiTask = false;
    try {
      isInitializedHajimiTask = (await lstat(join(cwd, ".hajimi", "task.json"))).isFile();
    } catch {
      // A not-yet-started task must first be initialized through AgentSession.
    }
    if (!isPathAllowed(cwd, await getAllowedRoots()) && !isInitializedHajimiTask) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403, headers: { "x-request-id": requestId } },
      );
    }

    const productRoot = process.env.HAJIMI_PRODUCT_ROOT ?? process.cwd();
    const backend = createWorkspaceBackend(cwd, {
      productRoot,
      capabilitiesRoot: join(productRoot, "bundled", "capabilities"),
      toolkitRoot: join(productRoot, "toolkit", "src"),
    });
    const [task, validation, backendResult] = await Promise.all([
      readHajimiTask(cwd),
      readHajimiValidation(cwd),
      backend.health().then(
        (detail) => ({ status: "ready" as const, detail }),
        (error: unknown) => ({ status: "error" as const, error: errorMessage(error) }),
      ),
    ]);

    if (!task) {
      return NextResponse.json(
        { error: "HaJiMi task is not initialized" },
        { status: 404, headers: { "x-request-id": requestId } },
      );
    }

    return NextResponse.json({
      product: { name: "HaJiMi", version: "0.1.0" },
      task,
      backend: backendResult,
      validation,
    });
  } catch (error) {
    logApiError({ route: "/api/hajimi/status", method: "GET", requestId, error });
    return NextResponse.json(
      { error: errorMessage(error) },
      { status: 500, headers: { "x-request-id": requestId } },
    );
  }
}
