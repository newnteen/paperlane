import { readFile } from "node:fs/promises";
import { extname } from "node:path";

import { post } from "./sie.js";

const FORMATS = {
  ".png": "png",
  ".jpg": "jpeg",
  ".jpeg": "jpeg",
  ".webp": "webp",
};

export function imageFormat(file) {
  const ext = extname(file).toLowerCase();
  const format = FORMATS[ext];
  if (!format) throw new Error(`unsupported image type: ${ext || file}`);
  return format;
}

export async function imageItem(file) {
  const data = await readFile(file);
  return { images: [{ data: data.toString("base64"), format: imageFormat(file) }] };
}

/** GLM-OCR: photos, receipts, faxes, anything a phone camera produced. */
export async function photoText(file) {
  const model = process.env.SIE_OCR_MODEL || "zai-org/GLM-OCR";
  const out = await post(`/v1/extract/${encodeURIComponent(model)}`, {
    items: [await imageItem(file)],
  });
  return firstText(out);
}

/** LightOnOCR-3: a flat page, keeps table structure as HTML in the Markdown. */
export async function pageMarkdown(file) {
  const model = process.env.SIE_PAGE_MODEL || "lightonai/LightOnOCR-3-4B";
  const out = await post(`/v1/extract/${encodeURIComponent(model)}`, {
    items: [await imageItem(file)],
    params: { options: { max_new_tokens: 12288, temperature: 0.1, top_p: 1 } },
  });
  return firstText(out);
}

function firstText(out) {
  const text = out?.items?.[0]?.entities?.[0]?.text;
  if (!text) throw new Error("SIE returned no text for this image");
  return text.trim();
}
