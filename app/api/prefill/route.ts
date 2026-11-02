// POST /api/prefill (multipart, fields file0..file4): the AI classifies each document and the form is
// pre-filled from what it reads. Readings are cached by file hash, so the run that follows reuses them.
import { NextResponse } from "next/server";
import { prefillFromFormData } from "@/lib/workflow/prefill";

export const runtime = "nodejs";
export const maxDuration = 90;

export async function POST(req: Request) {
  try {
    return NextResponse.json(await prefillFromFormData(await req.formData()));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
