import { readFile } from "node:fs/promises";

import { imageFormat } from "./ocr.js";
import { post } from "./sie.js";

const INSTRUCTION =
  "Extract data from the document image into the JSON schema. " +
  "Copy values as they appear on the document. " +
  "Use null for a field the document does not contain. Return only the JSON.";

export const DEFAULT_FIELDS_MODEL = "google/gemma-4-31B-it:h100-96k-hires-out8k-no-spec";

/**
 * One vision call turns the page into typed fields.
 * A strict schema is the point: a wrong shape is a failed call, not a silent guess.
 */
export async function extractFields(file, schema) {
  const data = await readFile(file);
  const mime = imageFormat(file);

  const out = await post(
    "/v1/chat/completions",
    {
      model: process.env.SIE_FIELDS_MODEL || DEFAULT_FIELDS_MODEL,
      messages: [
        { role: "system", content: `${INSTRUCTION}\n\nJSON schema:\n${JSON.stringify(schema)}` },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: `data:image/${mime};base64,${data.toString("base64")}` },
            },
          ],
        },
      ],
      max_completion_tokens: 8192,
      temperature: 0,
      presence_penalty: 0,
      response_format: {
        type: "json_schema",
        json_schema: { name: "fields", strict: true, schema },
      },
    },
    { timeoutMs: 600_000 },
  );

  const content = out?.choices?.[0]?.message?.content;
  if (!content) throw new Error("the field-extraction call returned an empty message");

  try {
    return JSON.parse(content);
  } catch {
    throw new Error(`the model did not return JSON: ${content.slice(0, 200)}`);
  }
}
