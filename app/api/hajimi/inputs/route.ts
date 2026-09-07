import { NextResponse } from "next/server";
import { realpath } from "node:fs/promises";
import { getAllowedRoots, isPathAllowed } from "@/lib/allowed-roots";
import { validateAgentCwd } from "@/lib/path-policy";
import { importProblemFiles } from "@/lib/hajimi/input-upload";

export async function POST(request: Request) {
  try {
    if (Number(request.headers.get("content-length")) > 52 * 1024 * 1024) return NextResponse.json({ error: "附件总大小不能超过 50 MB。" }, { status: 413 });
    const form = await request.formData();
    const requested = form.get("cwd");
    if (typeof requested !== "string" || validateAgentCwd(requested)) return NextResponse.json({ error: "Invalid workspace" }, { status: 400 });
    const cwd = await realpath(requested);
    if (!isPathAllowed(cwd, await getAllowedRoots())) return NextResponse.json({ error: "Access denied" }, { status: 403 });
    const files = form.getAll("files").filter((item): item is File => item instanceof File);
    if (files.length > 20 || files.reduce((n, f) => n + f.size, 0) > 50 * 1024 * 1024) return NextResponse.json({ error: "每批最多 20 个文件、50 MB。" }, { status: 413 });
    const paths = await importProblemFiles(cwd, await Promise.all(files.map(async file => ({ name: file.name, data: new Uint8Array(await file.arrayBuffer()) }))));
    return NextResponse.json({ paths });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
