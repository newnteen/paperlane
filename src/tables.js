/**
 * Turn the HTML tables that LightOnOCR leaves in its Markdown into rows.
 *
 * A page scan already comes back as Markdown with `<table>` blocks, so the
 * structure is there. Sending that text to another model to "read the table"
 * would only add cost and a chance of invented numbers.
 *
 * Two shapes come out:
 *   - a table with a header row  -> [{ headers, rows: [ { Line: "1", ... } ] }]
 *   - a table without one        -> [{ headers: null, rows: [ ["Subtotal", "772.80"] ] }]
 */

const ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "-",
  mdash: "-",
};

function decode(text) {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&([a-z]+);/gi, (whole, name) => ENTITIES[name.toLowerCase()] ?? whole);
}

function clean(html) {
  const flattened = html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, " ");
  return decode(flattened).replace(/\s+/g, " ").trim();
}

const TABLE = /<table\b[^>]*>([\s\S]*?)<\/table>/gi;
const ROW = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
const CELL = /<(t[hd])\b[^>]*>([\s\S]*?)<\/\1>/gi;

function cellsOf(rowHtml) {
  const cells = [];
  CELL.lastIndex = 0;
  let match;
  while ((match = CELL.exec(rowHtml))) {
    cells.push({ header: match[1].toLowerCase() === "th", text: clean(match[2]) });
  }
  return cells;
}

/** `Amount` twice in one header must not silently overwrite a column. */
function headerNames(cells) {
  const counts = new Map();
  return cells.map((cell, index) => {
    const name = cell.text || `col${index + 1}`;
    const seen = counts.get(name) ?? 0;
    counts.set(name, seen + 1);
    return seen === 0 ? name : `${name}_${seen + 1}`;
  });
}

function toObject(headers, cells) {
  const row = {};
  headers.forEach((key, index) => {
    row[key] = cells[index]?.text ?? "";
  });
  return row;
}

export function parseTables(markdown) {
  const tables = [];
  TABLE.lastIndex = 0;

  let table;
  while ((table = TABLE.exec(markdown))) {
    const rows = [];
    ROW.lastIndex = 0;
    let row;
    while ((row = ROW.exec(table[1]))) rows.push(cellsOf(row[1]));

    const first = rows[0];
    if (!first || first.length === 0) continue;

    const hasHeader = first.every((cell) => cell.header);
    const headers = hasHeader ? headerNames(first) : null;
    const body = hasHeader ? rows.slice(1) : rows;

    tables.push({
      headers,
      rows: body.map((cells) => (headers ? toObject(headers, cells) : cells.map((c) => c.text))),
    });
  }

  return tables;
}

export function countRows(tables) {
  return tables.reduce((total, entry) => total + entry.rows.length, 0);
}
