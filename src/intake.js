import { pageMarkdown, photoText } from "./ocr.js";
import { DEFAULT_FIELDS_MODEL, extractFields } from "./fields.js";
import { findPii, redactObject } from "./redact.js";

export function modelNames() {
  return {
    photo: process.env.SIE_OCR_MODEL || "zai-org/GLM-OCR",
    page: process.env.SIE_PAGE_MODEL || "lightonai/LightOnOCR-3-4B",
    fields: process.env.SIE_FIELDS_MODEL || DEFAULT_FIELDS_MODEL,
    pii: process.env.SIE_PII_MODEL || "urchade/gliner_multi_pii-v1",
  };
}

async function timed(steps, name, run) {
  const started = performance.now();
  const value = await run();
  steps.push({ name, ms: Math.round(performance.now() - started) });
  return value;
}

export async function transcribe(file, as = "photo") {
  const steps = [];
  const text = await timed(steps, as === "page" ? "page" : "photo", () =>
    as === "page" ? pageMarkdown(file) : photoText(file),
  );
  return { text, steps };
}

/**
 * transcribe -> typed fields -> redaction.
 * The transcript is what the PII pass reads first, because labels such as
 * "Date of birth:" make detection much more reliable than bare field values.
 */
export async function intake(file, { schema, as = "photo" }) {
  const steps = [];
  const models = modelNames();

  const transcript = await timed(steps, "transcribe", () =>
    as === "page" ? pageMarkdown(file) : photoText(file),
  );

  const fields = await timed(steps, "fields", () => extractFields(file, schema));

  const redactStarted = performance.now();
  const transcriptSpans = (await findPii([transcript]))[0] ?? [];
  const { redacted, applied } = await redactObject(fields, transcriptSpans);
  steps.push({ name: "redact", ms: Math.round(performance.now() - redactStarted) });

  return { as, models, transcript, transcriptSpans, fields, redacted, applied, steps };
}
