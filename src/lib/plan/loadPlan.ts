"use client";

/**
 * Turns an uploaded file into the normalised PNG that everything downstream
 * agrees on.
 *
 * One image, one coordinate space. The pixels Claude reads, the pixels you
 * click during calibration, and the pixels the 2D editor draws over are all the
 * SAME pixels — so an extraction never has to be re-scaled to match the view.
 * That is why normalisation happens once, here, at import.
 */

/** Long-edge cap. Above this, detail stops improving and tokens start burning. */
export const MAX_EDGE_PX = 2200;

/** Render PDFs at this scale before the cap, so thin line work survives. */
const PDF_BASE_SCALE = 3;

export type LoadedPlanPage = {
  dataUrl: string;
  widthPx: number;
  heightPx: number;
  sourceFilename: string;
  /** 1-based, only for PDFs. */
  pdfPage?: number;
};

function canvasToPng(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL("image/png");
}

function fitScale(width: number, height: number): number {
  const longest = Math.max(width, height);
  return longest > MAX_EDGE_PX ? MAX_EDGE_PX / longest : 1;
}

async function loadRasterImage(file: File): Promise<LoadedPlanPage> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = fitScale(bitmap.width, bitmap.height);
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not get a 2D canvas context.");
    // Plans are line art; smoothing on downscale keeps hairlines visible.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);

    return {
      dataUrl: canvasToPng(canvas),
      widthPx: width,
      heightPx: height,
      sourceFilename: file.name,
    };
  } finally {
    bitmap.close();
  }
}

async function loadPdf(file: File): Promise<LoadedPlanPage[]> {
  // Imported lazily: pdf.js pulls in a large bundle and touches DOM APIs, so
  // it must never end up in the server build.
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) });
  const document_ = await loadingTask.promise;

  const pages: LoadedPlanPage[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= document_.numPages; pageNumber++) {
      const page = await document_.getPage(pageNumber);
      const base = page.getViewport({ scale: PDF_BASE_SCALE });
      const scale = PDF_BASE_SCALE * fitScale(base.width, base.height);
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not get a 2D canvas context.");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvas, canvasContext: ctx, viewport }).promise;

      pages.push({
        dataUrl: canvasToPng(canvas),
        widthPx: canvas.width,
        heightPx: canvas.height,
        sourceFilename: file.name,
        pdfPage: pageNumber,
      });
      page.cleanup();
    }
  } finally {
    // Frees the worker and its transferred buffers; without it a multi-page
    // import holds every page's render memory for the session.
    await loadingTask.destroy();
  }
  return pages;
}

/**
 * One page per storey. A multi-page PDF returns every page so you can pick
 * which one is which level — the app does not guess page order.
 */
export async function loadPlanFile(file: File): Promise<LoadedPlanPage[]> {
  const isPdf =
    file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (isPdf) return loadPdf(file);

  if (!file.type.startsWith("image/")) {
    throw new Error(
      `"${file.name}" is not a PDF or an image. Export the plan as PDF, PNG or JPEG first.`,
    );
  }
  return [await loadRasterImage(file)];
}
