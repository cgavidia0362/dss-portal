import { extractImages, getDocumentProxy, renderPageAsImage } from 'unpdf';
import { copyPdfBytes } from './pdf';

export interface RenderedPageImage {
  pageNumber: number;
  mimeType: 'image/png';
  bytes: Uint8Array;
}

export type PageRenderer = (
  pdfBytes: Uint8Array,
  pageNumbers: number[]
) => Promise<RenderedPageImage[]>;

const DEFAULT_SCALE = 1.6;
export const MAX_VISION_PAGES_PER_BATCH = 4;
const MIN_PAGE_IMAGE_WIDTH = 700;
const MIN_PAGE_IMAGE_HEIGHT = 900;
const MIN_RENDERED_IMAGE_BYTES = 20_000;

export function visionPageBatches(
  pageNumbers: number[],
  batchSize = MAX_VISION_PAGES_PER_BATCH
): number[][] {
  const batches: number[][] = [];
  for (let i = 0; i < pageNumbers.length; i += batchSize) {
    batches.push(pageNumbers.slice(i, i + batchSize));
  }
  return batches;
}

async function encodeRawImage(image: {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  channels: 1 | 3 | 4;
}): Promise<Uint8Array> {
  const { createCanvas } = await import('@napi-rs/canvas');
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(image.width, image.height);
  if (image.channels === 4) {
    imageData.data.set(image.data);
  } else if (image.channels === 3) {
    for (let i = 0, j = 0; i < image.data.length; i += 3, j += 4) {
      imageData.data[j] = image.data[i] ?? 0;
      imageData.data[j + 1] = image.data[i + 1] ?? 0;
      imageData.data[j + 2] = image.data[i + 2] ?? 0;
      imageData.data[j + 3] = 255;
    }
  } else {
    for (let i = 0, j = 0; i < image.data.length; i += 1, j += 4) {
      const value = image.data[i] ?? 0;
      imageData.data[j] = value;
      imageData.data[j + 1] = value;
      imageData.data[j + 2] = value;
      imageData.data[j + 3] = 255;
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return new Uint8Array(canvas.toBuffer('image/png'));
}

function embeddedImageLooksLikePage(image: {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  channels: 1 | 3 | 4;
}): boolean {
  if (image.width < MIN_PAGE_IMAGE_WIDTH || image.height < MIN_PAGE_IMAGE_HEIGHT) {
    return false;
  }
  const expected = image.width * image.height * image.channels;
  if (!image.data?.length || image.data.length < expected * 0.5) {
    return false;
  }
  let nonzero = 0;
  const step = Math.max(1, Math.floor(image.data.length / 2000));
  for (let i = 0; i < image.data.length; i += step) {
    if ((image.data[i] ?? 0) > 8) nonzero += 1;
  }
  return nonzero > 10;
}

async function imageFromEmbeddedScan(
  pdf: Awaited<ReturnType<typeof getDocumentProxy>>,
  pageNumber: number
): Promise<Uint8Array | null> {
  try {
    const images = await extractImages(pdf, pageNumber);
    const pageLike = [...images]
      .filter((image) => embeddedImageLooksLikePage(image))
      .sort((a, b) => b.width * b.height - a.width * a.height)[0];
    if (!pageLike) return null;
    return encodeRawImage(pageLike);
  } catch {
    return null;
  }
}

async function imageFromPageRender(
  pdf: Awaited<ReturnType<typeof getDocumentProxy>>,
  pageNumber: number
): Promise<Uint8Array | null> {
  try {
    const buffer = await renderPageAsImage(pdf, pageNumber, {
      canvasImport: () => import('@napi-rs/canvas'),
      scale: DEFAULT_SCALE,
    });
    return new Uint8Array(buffer);
  } catch {
    return null;
  }
}

/**
 * Render requested PDF pages to in-memory PNGs. Does not write files.
 * Prefers large embedded page scans (image-only PDFs) and falls back to
 * vector page rasterization when needed. Callers must drop the buffers
 * after the vision request.
 */
export const renderPdfPages: PageRenderer = async (pdfBytes, pageNumbers) => {
  if (!pageNumbers.length) return [];
  const pdf = await getDocumentProxy(copyPdfBytes(pdfBytes));
  const rendered: RenderedPageImage[] = [];
  for (const pageNumber of pageNumbers) {
    const bytes =
      (await imageFromEmbeddedScan(pdf, pageNumber)) ??
      (await imageFromPageRender(pdf, pageNumber));
    if (!bytes || bytes.byteLength < MIN_RENDERED_IMAGE_BYTES) {
      throw new Error(`Unable to render PDF page ${pageNumber} for vision input.`);
    }
    rendered.push({
      pageNumber,
      mimeType: 'image/png',
      bytes,
    });
  }
  return rendered;
};
