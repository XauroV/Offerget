import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    product: "job-tracker",
    status: "ok",
    version: 1,
  });
}
