import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const projectDirectory = process.env.npm_config_local_prefix
  || (process.env.npm_package_json ? path.dirname(process.env.npm_package_json) : "")
  || process.env.INIT_CWD
  || process.cwd();
const dataDirectory = process.env.OFFERGET_DATA_DIR || path.join(projectDirectory, ".offerget");
const stateFile = path.join(dataDirectory, "state.json");

async function readState() {
  try {
    const parsed = JSON.parse(await fs.readFile(pathToFileURL(stateFile), "utf8"));
    return parsed?.data && Array.isArray(parsed.data.jobs) ? parsed.data : parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function GET() {
  return NextResponse.json({ data: await readState() }, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function PUT(request: NextRequest) {
  const data = await request.json();
  if (!data || !Array.isArray(data.jobs) || !Array.isArray(data.statuses) || !Array.isArray(data.comparisons)) {
    return NextResponse.json({ error: "invalid_state" }, { status: 400 });
  }

  await fs.mkdir(pathToFileURL(dataDirectory), { recursive: true });
  const temporaryFile = `${stateFile}.${process.pid}.tmp`;
  await fs.writeFile(pathToFileURL(temporaryFile), JSON.stringify({ version: 1, data, updatedAt: new Date().toISOString() }, null, 2), "utf8");
  await fs.rename(pathToFileURL(temporaryFile), pathToFileURL(stateFile));
  return NextResponse.json({ ok: true });
}
