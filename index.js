#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { loadEnv } from "./src/env.js";
import { intake, transcribe } from "./src/intake.js";

loadEnv();

const USAGE = `paperlane — read photographed paperwork into clean, redacted JSON

  node index.js text   <image>                         transcribe only
  node index.js intake <image> --schema <name|file>    transcribe, extract, redact

Options
  --as photo|page     photo = GLM-OCR (default), page = LightOnOCR-3
  --schema receipt    schemas/receipt.json
  --schema intake     schemas/intake.json
  --schema ./my.json  your own JSON schema
  --raw               print the unredacted fields as well
`;

function flag(argv, name, fallback) {
  const index = argv.indexOf(`--${name}`);
  if (index < 0) return fallback;
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`--${name} needs a value`);
  return value;
}

const has = (argv, name) => argv.includes(`--${name}`);

function seconds(ms) {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

function shorten(model) {
  const tail = model.split("/").pop() ?? model;
  return tail.split(":")[0];
}

function table(steps, models, as) {
  const rows = steps.map((step) => {
    const model = step.name === "transcribe" ? models[as] : models[step.name];
    return [step.name, model ? shorten(model) : "", seconds(step.ms)];
  });

  const width = Math.max(...rows.map((row) => row[0].length));
  return rows
    .map(([name, model, time]) => `  ${name.padEnd(width)}  ${model.padEnd(18)} ${time}`)
    .join("\n");
}

async function loadSchema(name) {
  const path = name.includes("/") || name.includes("\\") || name.endsWith(".json")
    ? resolve(process.cwd(), name)
    : resolve(process.cwd(), "schemas", `${name}.json`);

  if (!existsSync(path)) {
    throw new Error(`no schema at ${path}. Use --schema receipt, --schema intake, or a path to a .json file.`);
  }
  return { path, schema: JSON.parse(await readFile(path, "utf8")) };
}

async function main() {
  const argv = process.argv.slice(2);
  const command = argv[0];

  if (!command || command === "--help" || command === "-h") {
    console.log(USAGE);
    return;
  }

  const file = argv[1];
  if (!file) throw new Error("no image given");
  if (!existsSync(file)) throw new Error(`no such file: ${file}`);

  const as = flag(argv, "as", "photo");
  if (as !== "photo" && as !== "page") throw new Error("--as must be photo or page");

  if (command === "text") {
    const { text, steps } = await transcribe(file, as);
    console.log(`${file}  (${as})\n`);
    console.log(table(steps, {}, as));
    console.log(`\n${text}\n`);
    return;
  }

  if (command === "intake") {
    const schemaName = flag(argv, "schema", "receipt");
    const { path, schema } = await loadSchema(schemaName);

    const result = await intake(file, { schema, as });

    console.log(`${file}  (${as}, schema ${path.split(/[\\/]/).pop()})\n`);
    console.log(table(result.steps, result.models, result.as));
    console.log(`\n${JSON.stringify(result.redacted, null, 2)}\n`);

    console.log(`transcript: ${result.transcriptSpans.length} PII span(s) detected`);
    if (result.applied.length) {
      console.log(`redacted ${result.applied.length} field(s)`);
      const width = Math.max(...result.applied.map((entry) => entry.path.length));
      for (const entry of result.applied) {
        console.log(`  ${entry.path.padEnd(width)}  ${entry.after}`);
      }
    } else {
      console.log("no field values needed masking");
    }

    if (has(argv, "raw")) {
      console.log(`\nunredacted fields\n${JSON.stringify(result.fields, null, 2)}`);
    }
    return;
  }

  throw new Error(`unknown command: ${command}\n\n${USAGE}`);
}

main().catch((error) => {
  console.error(`\n${error.message}\n`);
  process.exitCode = 1;
});
