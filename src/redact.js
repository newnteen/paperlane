import { post } from "./sie.js";

export const PII_LABELS = [
  "person",
  "email",
  "phone number",
  "address",
  "date of birth",
  "credit card number",
  "social security number",
  "medical record number",
  "insurance number",
];

const TOKENS = {
  person: "PERSON",
  email: "EMAIL",
  "phone number": "PHONE",
  address: "ADDRESS",
  "date of birth": "DOB",
  "credit card number": "CARD",
  "social security number": "SSN",
  "medical record number": "MRN",
  "insurance number": "INSURANCE",
};

/** Batch PII detection: one request for every string, in order. */
export async function findPii(texts) {
  if (texts.length === 0) return [];

  const model = process.env.SIE_PII_MODEL || "urchade/gliner_multi_pii-v1";
  const out = await post(`/v1/extract/${encodeURIComponent(model)}`, {
    items: texts.map((text, index) => ({ id: `v${index}`, text })),
    params: { labels: PII_LABELS },
  });

  const byId = new Map();
  for (const item of out.items ?? []) {
    byId.set(item.id, item.entities ?? []);
  }

  return texts.map((_, index) => byId.get(`v${index}`) ?? []);
}

export function mask(text, spans) {
  const ordered = [...spans].sort((a, b) => a.start - b.start || b.end - a.end);
  let out = "";
  let cursor = 0;

  for (const span of ordered) {
    if (span.start < cursor) continue; // overlaps an earlier span
    const label = String(span.label ?? "").toLowerCase();
    const token = TOKENS[label] ?? label.toUpperCase().replace(/\s+/g, "_") ?? "REDACTED";
    out += text.slice(cursor, span.start) + `[${token}]`;
    cursor = span.end;
  }

  return out + text.slice(cursor);
}

/** Walk every string in the extracted object. */
export function mapStrings(value, visit) {
  if (typeof value === "string") return visit(value);
  if (Array.isArray(value)) return value.map((entry) => mapStrings(entry, visit));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mapStrings(v, visit)]));
  }
  return value;
}

export function collectStrings(value) {
  const found = [];
  mapStrings(value, (text) => {
    if (text.trim()) found.push(text);
    return text;
  });
  return found;
}

function mapStringsWithPath(value, visit, path = "") {
  if (typeof value === "string") return visit(value, path);
  if (Array.isArray(value)) {
    return value.map((entry, index) => mapStringsWithPath(entry, visit, `${path}[${index}]`));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        mapStringsWithPath(entry, visit, path ? `${path}.${key}` : key),
      ]),
    );
  }
  return value;
}

/**
 * Redact the extracted object.
 *
 * Spans found in the full transcript are reused on the field values, because a
 * bare value like "1979-04-02" is weaker evidence than the same value under a
 * "Date of birth:" label. Anything the field-level pass still finds is masked too.
 */
export async function redactObject(object, transcriptSpans) {
  const values = collectStrings(object);
  const valueSpans = await findPii(values);

  const known = (transcriptSpans ?? []).map((span) => ({
    ...span,
    needle: span.text.trim().toLowerCase(),
  }));

  const applied = [];
  let index = 0;

  const redacted = mapStringsWithPath(object, (text, path) => {
    const lower = text.toLowerCase();
    const own = valueSpans[index++] ?? [];
    const inherited = known
      .filter((span) => span.needle && lower.includes(span.needle))
      .map((span) => ({
        label: span.label,
        score: span.score,
        start: lower.indexOf(span.needle),
        end: lower.indexOf(span.needle) + span.needle.length,
      }));

    const spans = [...own, ...inherited];
    if (spans.length === 0) return text;

    const masked = mask(text, spans);
    if (masked !== text) applied.push({ path, before: text, after: masked });
    return masked;
  });

  return { redacted, applied };
}
