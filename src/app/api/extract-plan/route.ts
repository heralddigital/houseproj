import { NextResponse } from "next/server";
import { z } from "zod";
import { extractPlan, parseDataUrl } from "@/lib/ai/extractPlan";

export const runtime = "nodejs";
// Plan reading is a long vision call; keep well clear of the default 15s.
export const maxDuration = 300;

const RequestSchema = z.object({
  imageDataUrl: z.string().min(32),
  levelIndex: z.number().int(),
  levelLabel: z.string(),
  hints: z.string().max(2000).optional(),
});

/** Anthropic's per-image cap is 5MB of base64; stop before the API does. */
const MAX_BASE64_BYTES = 5 * 1024 * 1024;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Request body was not valid JSON." },
      { status: 400 },
    );
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: `Invalid request: ${parsed.error.issues[0]?.message}` },
      { status: 400 },
    );
  }

  const image = parseDataUrl(parsed.data.imageDataUrl);
  if (!image) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "The plan image must be a base64 data URL of type png, jpeg, webp or gif.",
      },
      { status: 400 },
    );
  }

  if (image.base64.length > MAX_BASE64_BYTES) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "The plan image is over the 5MB limit for a single image. Re-import it — the uploader downscales, so this usually means it was bypassed.",
      },
      { status: 413 },
    );
  }

  const result = await extractPlan({
    imageBase64: image.base64,
    mediaType: image.mediaType,
    levelIndex: parsed.data.levelIndex,
    levelLabel: parsed.data.levelLabel,
    userHints: parsed.data.hints,
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
