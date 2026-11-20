import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { countRows, parseTables } from "../src/tables.js";

// Captured verbatim from LightOnOCR-3 for samples/statement-table.png.
const REAL_PAGE = readFileSync(new URL("./fixtures/statement-table.md", import.meta.url), "utf8");

const HEADER_AND_ROWS = `
# Statement

<table>
  <thead>
    <tr><th>Line</th><th>Part</th><th>Qty</th><th>Amount</th></tr>
  </thead>
  <tbody>
    <tr><td>1</td><td>Bearing 6203-2RS</td><td>40</td><td>126.00</td></tr>
    <tr><td>2</td><td>Seal kit SK-220</td><td>12</td><td>100.80</td></tr>
  </tbody>
</table>
`;

test("a table with a header row becomes objects", () => {
  const tables = parseTables(HEADER_AND_ROWS);

  assert.equal(tables.length, 1);
  assert.deepEqual(tables[0].headers, ["Line", "Part", "Qty", "Amount"]);
  assert.deepEqual(tables[0].rows, [
    { Line: "1", Part: "Bearing 6203-2RS", Qty: "40", Amount: "126.00" },
    { Line: "2", Part: "Seal kit SK-220", Qty: "12", Amount: "100.80" },
  ]);
});

test("a table without a header row stays positional", () => {
  const tables = parseTables(`
<table>
  <tbody>
    <tr><td>Subtotal</td><td>772.80</td></tr>
    <tr><td>Total</td><td>875.66</td></tr>
  </tbody>
</table>
`);

  assert.equal(tables[0].headers, null);
  assert.deepEqual(tables[0].rows, [
    ["Subtotal", "772.80"],
    ["Total", "875.66"],
  ]);
});

test("numbers stay strings, so a leading zero survives", () => {
  const tables = parseTables("<table><tr><td>007</td></tr></table>");
  assert.equal(tables[0].rows[0][0], "007");
});

test("several tables on one page keep their order", () => {
  const tables = parseTables(`
<table><tr><th>A</th></tr><tr><td>1</td></tr></table>
text between
<table><tr><th>B</th></tr><tr><td>2</td></tr></table>
`);

  assert.deepEqual(
    tables.map((entry) => entry.headers[0]),
    ["A", "B"],
  );
});

test("a repeated header name does not overwrite the column", () => {
  const tables = parseTables("<table><tr><th>Amount</th><th>Amount</th></tr><tr><td>1</td><td>2</td></tr></table>");
  assert.deepEqual(tables[0].rows[0], { Amount: "1", Amount_2: "2" });
});

test("an empty header cell gets a positional name", () => {
  const tables = parseTables("<table><tr><th></th><th>Qty</th></tr><tr><td>a</td><td>2</td></tr></table>");
  assert.deepEqual(tables[0].rows[0], { col1: "a", Qty: "2" });
});

test("markup and entities inside a cell are flattened", () => {
  const tables = parseTables(
    "<table><tr><th>Part</th></tr><tr><td><b>Bolt</b> &amp; nut<br>M8</td></tr></table>",
  );
  assert.equal(tables[0].rows[0].Part, "Bolt & nut M8");
});

test("a short row does not lose its keys", () => {
  const tables = parseTables("<table><tr><th>A</th><th>B</th></tr><tr><td>1</td></tr></table>");
  assert.deepEqual(tables[0].rows[0], { A: "1", B: "" });
});

test("markdown with no table yields nothing", () => {
  assert.deepEqual(parseTables("# Title\n\nno table here\n"), []);
  assert.equal(countRows([]), 0);
});

test("a real OCR page parses to six rows that still add up", () => {
  const [table] = parseTables(REAL_PAGE);

  assert.deepEqual(table.headers, ["Line", "Part", "Qty", "Unit", "Amount"]);
  assert.equal(table.rows.length, 6);
  assert.equal(table.rows[0].Part, "Bearing 6203-2RS");

  // The page prints 772.80 as the subtotal; the parsed rows must agree.
  const total = table.rows.reduce((sum, row) => sum + Number(row.Amount), 0);
  assert.equal(total.toFixed(2), "772.80");
});
