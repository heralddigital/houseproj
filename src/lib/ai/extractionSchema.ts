import { z } from "zod";

/**
 * What Claude returns when it reads a floor plan.
 *
 * This is deliberately NOT a HouseModel. The vision pass works in image pixels
 * and knows nothing about scale; calibration (a human step) converts pixels to
 * millimetres afterwards. Keeping the two apart means a re-calibration never
 * needs a re-extraction, and the model is never asked to guess a scale.
 *
 * Every field is required and non-nullable so the schema stays compatible with
 * strict structured outputs. "Unknown" is expressed with the documented
 * sentinel for each field plus an entry in `notes`, never with a silent guess.
 */

const PixelPointSchema = z.object({
  x: z.number(),
  y: z.number(),
});

const ConfidenceSchema = z.enum(["high", "medium", "low"]);

export const ExtractedWallSchema = z.object({
  /** Short unique label the model invents, e.g. "w1". Openings refer to it. */
  ref: z.string(),
  startPx: PixelPointSchema,
  endPx: PixelPointSchema,
  /** Drawn wall thickness in pixels. 0 when the plan draws a single line. */
  thicknessPx: z.number(),
  kind: z.enum(["external", "internal"]),
  confidence: ConfidenceSchema,
});

export const ExtractedOpeningSchema = z.object({
  ref: z.string(),
  /** `ref` of the wall this opening sits in. */
  wallRef: z.string(),
  type: z.enum(["door", "window", "rooflight"]),
  /** Centre of the opening along the wall, in pixels. */
  centrePx: PixelPointSchema,
  widthPx: z.number(),
  confidence: ConfidenceSchema,
});

export const ExtractedRoomSchema = z.object({
  ref: z.string(),
  /** Label printed on the plan, or "" when the space is unlabelled. */
  name: z.string(),
  use: z.enum([
    "habitable",
    "kitchen",
    "bathroom",
    "circulation",
    "garage",
    "other",
  ]),
  polygonPx: z.array(PixelPointSchema),
  confidence: ConfidenceSchema,
});

export const ExtractedStairSchema = z.object({
  ref: z.string(),
  /** Bottom of the flight, centred on its width. */
  originPx: PixelPointSchema,
  /** Direction of travel going up, degrees clockwise from +x (image space). */
  directionDeg: z.number(),
  widthPx: z.number(),
  /** Treads visible on the plan. 0 when the flight is drawn but not countable. */
  countedTreads: z.number(),
  type: z.enum(["straight", "quarter-turn", "half-turn"]),
  confidence: ConfidenceSchema,
});

export const ExtractedDimensionSchema = z.object({
  /** The dimension exactly as printed, e.g. "3,450" or "4.2m". */
  label: z.string(),
  /** That label converted to millimetres by the model. */
  valueMm: z.number(),
  /** The two ends of the dimension line, in pixels. */
  fromPx: PixelPointSchema,
  toPx: PixelPointSchema,
});

export const PlanExtractionSchema = z.object({
  /** Level name printed on the drawing, or "" if absent. */
  levelName: z.string(),
  /** Scale bar or scale note as printed, e.g. "1:50". "" when absent. */
  drawingScaleLabel: z.string(),
  walls: z.array(ExtractedWallSchema),
  openings: z.array(ExtractedOpeningSchema),
  rooms: z.array(ExtractedRoomSchema),
  stairs: z.array(ExtractedStairSchema),
  printedDimensions: z.array(ExtractedDimensionSchema),
  /** Everything uncertain, ambiguous, or assumed. One sentence per entry. */
  notes: z.array(z.string()),
});

export type PlanExtraction = z.infer<typeof PlanExtractionSchema>;
export type ExtractedWall = z.infer<typeof ExtractedWallSchema>;
export type ExtractedOpening = z.infer<typeof ExtractedOpeningSchema>;
export type ExtractedRoom = z.infer<typeof ExtractedRoomSchema>;
export type ExtractedStair = z.infer<typeof ExtractedStairSchema>;
export type ExtractedDimension = z.infer<typeof ExtractedDimensionSchema>;

export const EMPTY_EXTRACTION: PlanExtraction = {
  levelName: "",
  drawingScaleLabel: "",
  walls: [],
  openings: [],
  rooms: [],
  stairs: [],
  printedDimensions: [],
  notes: [],
};
