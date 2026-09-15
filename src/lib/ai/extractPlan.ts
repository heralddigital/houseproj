import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  PlanExtractionSchema,
  type PlanExtraction,
} from "@/lib/ai/extractionSchema";
import {
  PLAN_EXTRACTION_SYSTEM_PROMPT,
  buildExtractionUserPrompt,
} from "@/lib/ai/prompt";

/**
 * Server-only. Never import this from a client component: it reads the API key.
 */

export const EXTRACTION_MODEL = "claude-opus-5";

export const SUPPORTED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

export type SupportedImageType = (typeof SUPPORTED_IMAGE_TYPES)[number];

export type ExtractionSuccess = {
  ok: true;
  extraction: PlanExtraction;
  usage: { inputTokens: number; outputTokens: number };
  /** True when structured output failed and the JSON was recovered from text. */
  usedFallbackParse: boolean;
};

export type ExtractionFailure = {
  ok: false;
  error: string;
  /** Present when the model replied but the reply could not be parsed. */
  rawText?: string;
};

export type ExtractionOutcome = ExtractionSuccess | ExtractionFailure;

export function parseDataUrl(
  dataUrl: string,
): { mediaType: SupportedImageType; base64: string } | null {
  const match = /^data:([^;,]+);base64,(.+)$/s.exec(dataUrl);
  if (!match) return null;
  const mediaType = match[1] as SupportedImageType;
  if (!SUPPORTED_IMAGE_TYPES.includes(mediaType)) return null;
  return { mediaType, base64: match[2] };
}

/**
 * Last-resort recovery when structured output does not come back parsed.
 * Exported for testing: this is the path that runs when the model is having a
 * bad day, so it needs to be exercised deterministically.
 */
export function recoverExtractionJson(text: string): PlanExtraction | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const parsed = PlanExtractionSchema.safeParse(
      JSON.parse(candidate.slice(start, end + 1)),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function extractPlan(params: {
  imageBase64: string;
  mediaType: SupportedImageType;
  levelIndex: number;
  levelLabel: string;
  userHints?: string;
  apiKey?: string;
}): Promise<ExtractionOutcome> {
  const apiKey = params.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      error:
        "ANTHROPIC_API_KEY is not set on the server. Add it to .env.local and restart the dev server.",
    };
  }

  const client = new Anthropic({ apiKey });

  const request = {
    model: EXTRACTION_MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" as const },
    system: PLAN_EXTRACTION_SYSTEM_PROMPT,
    messages: [
      {
        role: "user" as const,
        content: [
          {
            type: "image" as const,
            source: {
              type: "base64" as const,
              media_type: params.mediaType,
              data: params.imageBase64,
            },
          },
          {
            type: "text" as const,
            text: buildExtractionUserPrompt({
              levelIndex: params.levelIndex,
              levelLabel: params.levelLabel,
              userHints: params.userHints ?? "",
            }),
          },
        ],
      },
    ],
  };

  try {
    const response = await client.messages.parse({
      ...request,
      output_config: { format: zodOutputFormat(PlanExtractionSchema) },
    });

    const usage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };

    if (response.parsed_output) {
      return {
        ok: true,
        extraction: response.parsed_output,
        usage,
        usedFallbackParse: false,
      };
    }

    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    const recovered = recoverExtractionJson(text);
    if (recovered) {
      return { ok: true, extraction: recovered, usage, usedFallbackParse: true };
    }

    if (response.stop_reason === "max_tokens") {
      return {
        ok: false,
        error:
          "The plan was too detailed to return in one response (hit the output limit). Try cropping the image to a single storey, or splitting a very large drawing.",
        rawText: text.slice(0, 2000),
      };
    }

    if (response.stop_reason === "refusal") {
      return {
        ok: false,
        error: `The model declined to process this image (${response.stop_details?.category ?? "no category given"}).`,
      };
    }

    return {
      ok: false,
      error: "The model's reply could not be parsed as a plan extraction.",
      rawText: text.slice(0, 2000),
    };
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return { ok: false, error: "Anthropic rejected the API key (401)." };
    }
    if (error instanceof Anthropic.RateLimitError) {
      return { ok: false, error: "Rate limited by Anthropic (429). Try again shortly." };
    }
    if (error instanceof Anthropic.APIConnectionError) {
      return { ok: false, error: "Could not reach the Anthropic API." };
    }
    if (error instanceof Anthropic.APIError) {
      return {
        ok: false,
        error: `Anthropic API error ${error.status ?? "?"}: ${error.message}`,
      };
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown extraction error.",
    };
  }
}
