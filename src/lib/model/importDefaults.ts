/**
 * Assumptions applied when a floor plan physically cannot show a value.
 *
 * These are IMPORT DEFAULTS, not regulation values and not measurements of
 * your house. Every one of them is surfaced in the import warnings so it can
 * be corrected in the editor. None of them is used by the Phase 5 compliance
 * engine as a source of truth — that engine reads the model after you have
 * checked it.
 */
export const IMPORT_DEFAULTS = {
  /** Typical UK internal door leaf height (6'6" = 1981mm). Verify per door. */
  doorHeightMm: 1981,
  /** Nothing on a plan gives window head or sill height. Both are guesses. */
  windowHeightMm: 1200,
  windowSillMm: 900,
  rooflightHeightMm: 800,
  /** Used only when a wall is drawn as a single line with no thickness. */
  fallbackExternalWallThicknessMm: 300,
  fallbackInternalWallThicknessMm: 100,
  /** Storey heights are not visible in plan; these are placeholders. */
  floorToCeilingMm: 2400,
  slabThicknessMm: 250,
  /** Stair width when the flight is drawn but its width is unreadable. */
  fallbackStairWidthMm: 850,
} as const;

/**
 * Starting sizes for elements you add by hand in the 2D editor. Same status as
 * IMPORT_DEFAULTS: a sensible UK starting point, not a measurement. 838mm is a
 * common internal door leaf width; the window figures are arbitrary.
 */
export const NEW_ELEMENT_DEFAULTS = {
  doorWidthMm: 838,
  windowWidthMm: 1200,
  externalWallThicknessMm: 300,
  internalWallThicknessMm: 100,
} as const;

/** Wall thicknesses are rounded to this, so imports do not carry false precision. */
export const THICKNESS_ROUNDING_MM = 5;

/** Imported coordinates are rounded to this. The editor then snaps to 50mm. */
export const COORDINATE_ROUNDING_MM = 10;
