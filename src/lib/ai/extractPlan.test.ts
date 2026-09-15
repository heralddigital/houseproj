import { describe, expect, it } from "vitest";
import { parseDataUrl, recoverExtractionJson } from "./extractPlan";
import { EMPTY_EXTRACTION } from "./extractionSchema";

const validExtraction = {
  ...EMPTY_EXTRACTION,
  walls: [
    {
      ref: "w1",
      startPx: { x: 0, y: 0 },
      endPx: { x: 100, y: 0 },
      thicknessPx: 10,
      kind: "external",
      confidence: "high",
    },
  ],
};

describe("parseDataUrl", () => {
  it("splits a PNG data URL", () => {
    const result = parseDataUrl("data:image/png;base64,AAAA");
    expect(result).toEqual({ mediaType: "image/png", base64: "AAAA" });
  });

  it("accepts jpeg, webp and gif", () => {
    for (const type of ["image/jpeg", "image/webp", "image/gif"]) {
      expect(parseDataUrl(`data:${type};base64,AAAA`)?.mediaType).toBe(type);
    }
  });

  it("rejects an unsupported media type", () => {
    expect(parseDataUrl("data:application/pdf;base64,AAAA")).toBeNull();
    expect(parseDataUrl("data:image/svg+xml;base64,AAAA")).toBeNull();
  });

  it("rejects a non-data URL", () => {
    expect(parseDataUrl("https://example.com/plan.png")).toBeNull();
  });
});

describe("recoverExtractionJson", () => {
  it("parses bare JSON", () => {
    const recovered = recoverExtractionJson(JSON.stringify(validExtraction));
    expect(recovered?.walls[0].ref).toBe("w1");
  });

  it("parses JSON inside a fenced code block", () => {
    const text = "Here is the plan:\n```json\n" + JSON.stringify(validExtraction) + "\n```";
    expect(recoverExtractionJson(text)?.walls).toHaveLength(1);
  });

  it("parses JSON surrounded by prose", () => {
    const text = `I read the drawing.\n${JSON.stringify(validExtraction)}\nLet me know if that helps.`;
    expect(recoverExtractionJson(text)?.walls).toHaveLength(1);
  });

  it("returns null for JSON that does not match the schema", () => {
    expect(recoverExtractionJson('{"walls": "not an array"}')).toBeNull();
  });

  it("returns null when there is no JSON at all", () => {
    expect(recoverExtractionJson("I could not read this image.")).toBeNull();
  });

  it("returns null for malformed JSON rather than throwing", () => {
    expect(recoverExtractionJson('{"walls": [')).toBeNull();
  });
});
