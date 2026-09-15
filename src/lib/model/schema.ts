import { z } from "zod";

/**
 * The single source of truth for a design.
 *
 * UNITS: every linear dimension in this file is MILLIMETRES. No exceptions.
 * COORDINATES: model space is a plan view. x increases to the right (east on
 * the drawing), y increases DOWNWARDS (south on the drawing), matching image
 * space so that plan overlays need no y-flip. The 3D viewer (Phase 2) maps
 * model (x, y) -> world (x, z) and uses world y for height.
 * ORIGIN: arbitrary per project, but shared by every level, so levels stack.
 */

export const PointSchema = z.object({
  x: z.number(),
  y: z.number(),
});
export type Point = z.infer<typeof PointSchema>;

export const StatusSchema = z.enum(["existing", "proposed", "demolish"]);
export type Status = z.infer<typeof StatusSchema>;

export const WallSchema = z.object({
  id: z.string().min(1),
  start: PointSchema,
  end: PointSchema,
  thicknessMm: z.number().positive(),
  kind: z.enum(["external", "internal"]),
  /**
   * Never inferred from a drawing. A floor plan cannot show load paths, so
   * extraction always sets "unknown" and only a human may change it.
   */
  structural: z.enum([
    "unknown",
    "assumed-loadbearing",
    "assumed-non-loadbearing",
  ]),
  status: StatusSchema,
  finishInside: z.string().optional(),
  finishOutside: z.string().optional(),
});
export type Wall = z.infer<typeof WallSchema>;

export const OpeningSchema = z.object({
  id: z.string().min(1),
  wallId: z.string().min(1),
  type: z.enum(["door", "window", "rooflight"]),
  /** Distance along the wall from `wall.start` to the opening's near edge. */
  offsetMm: z.number().nonnegative(),
  widthMm: z.number().positive(),
  heightMm: z.number().positive(),
  /** Height of the sill above finished floor level. Doors are 0. */
  sillMm: z.number().nonnegative().optional(),
  escapeWindow: z.boolean().optional(),
  status: z.enum(["existing", "proposed"]),
});
export type Opening = z.infer<typeof OpeningSchema>;

export const RoomUseSchema = z.enum([
  "habitable",
  "kitchen",
  "bathroom",
  "circulation",
  "garage",
  "other",
]);
export type RoomUse = z.infer<typeof RoomUseSchema>;

export const RoomSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  use: RoomUseSchema,
  /** Closed polygon of the room's internal face. Not repeated at the end. */
  polygon: z.array(PointSchema).min(3),
  status: StatusSchema,
});
export type Room = z.infer<typeof RoomSchema>;

export const StairSchema = z.object({
  id: z.string().min(1),
  fromLevel: z.number().int(),
  toLevel: z.number().int(),
  type: z.enum(["straight", "quarter-turn", "half-turn"]),
  /** Centre of the first (bottom) riser's leading edge. */
  origin: PointSchema,
  /** Direction of travel going up, degrees clockwise from +x. */
  directionDeg: z.number(),
  widthMm: z.number().positive(),
  risers: z.number().int().positive(),
  riseMm: z.number().positive(),
  goingMm: z.number().positive(),
  status: StatusSchema,
});
export type Stair = z.infer<typeof StairSchema>;

export const LevelSchema = z.object({
  /** Ground floor is 0, first floor is 1. Negative for basements. */
  index: z.number().int(),
  name: z.string(),
  floorToCeilingMm: z.number().positive(),
  slabThicknessMm: z.number().positive(),
  walls: z.array(WallSchema),
  openings: z.array(OpeningSchema),
  rooms: z.array(RoomSchema),
  stairs: z.array(StairSchema),
});
export type Level = z.infer<typeof LevelSchema>;

export const MaterialSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  kind: z.enum(["paint", "wallpaper", "floor", "external"]),
  /** sRGB hex, e.g. "#f4f1ea". Base colour or texture tint. */
  hex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  /**
   * Free text only, e.g. "Farrow & Ball Cornforth White". Stored as a label:
   * the app makes no claim that the rendered colour matches any product.
   */
  manufacturerLabel: z.string().optional(),
  /** Storage path / URL of a tileable texture, for wallpaper and floors. */
  textureUrl: z.string().optional(),
  /** Real-world width of one texture tile, for correct scaling. */
  textureWidthMm: z.number().positive().optional(),
  roughness: z.number().min(0).max(1).optional(),
});
export type Material = z.infer<typeof MaterialSchema>;

export const SiteSchema = z.object({
  boundaryPolygon: z.array(PointSchema).optional(),
  rearBoundaryDistanceMm: z.number().positive().optional(),
  sideBoundaryDistanceMm: z.number().positive().optional(),
  propertyType: z.enum(["detached", "semi-detached", "terraced"]),
  constraints: z.object({
    conservationArea: z.boolean().optional(),
    listed: z.boolean().optional(),
    article4: z.boolean().optional(),
    flat: z.boolean().optional(),
  }),
});
export type Site = z.infer<typeof SiteSchema>;

export const HouseModelSchema = z.object({
  meta: z.object({
    name: z.string(),
    country: z.literal("England"),
    version: z.number().int().nonnegative(),
    parentVersion: z.number().int().nonnegative().optional(),
    notes: z.string().optional(),
  }),
  site: SiteSchema.optional(),
  levels: z.array(LevelSchema),
  materials: z.array(MaterialSchema),
});
export type HouseModel = z.infer<typeof HouseModelSchema>;

/**
 * Per-level record of how plan-image pixels were mapped to millimetres.
 * Kept beside the model rather than inside it: it describes the *import*,
 * not the building, and the 3D scene must never depend on it.
 */
export const CalibrationSchema = z.object({
  levelIndex: z.number().int(),
  /** The two points clicked on the plan image, in image pixels. */
  pointA: PointSchema,
  pointB: PointSchema,
  /** The real-world distance the user typed for that span. */
  realDistanceMm: z.number().positive(),
  mmPerPixel: z.number().positive(),
  /** Image pixel that became model origin (0, 0). */
  originPx: PointSchema,
  calibratedAt: z.string(),
});
export type Calibration = z.infer<typeof CalibrationSchema>;

export const PlanImageSchema = z.object({
  levelIndex: z.number().int(),
  /** Object URL, data URL, or Supabase public URL. */
  url: z.string(),
  widthPx: z.number().positive(),
  heightPx: z.number().positive(),
  sourceFilename: z.string(),
  /** 1-based page number when the source was a PDF. */
  pdfPage: z.number().int().positive().optional(),
});
export type PlanImage = z.infer<typeof PlanImageSchema>;

export function parseHouseModel(input: unknown): HouseModel {
  return HouseModelSchema.parse(input);
}

export function safeParseHouseModel(input: unknown) {
  return HouseModelSchema.safeParse(input);
}
