# paperlane

Turn photographed paperwork into clean, redacted JSON.

A receipt arrives as a phone photo. A new-client form comes in over fax. A supplier
statement is a scan of a printed page. All three end up being retyped into some
system by a person, and all three carry a name, a date of birth, an address or a
card number that has no business sitting in a spreadsheet.

This is the intake side of that: photo in, typed fields out, PII masked on the way.

## How it works

| Step | Model | Endpoint | What it handles |
| --- | --- | --- | --- |
| Read a photo | `zai-org/GLM-OCR` | `/v1/extract` | receipts, faxes, anything a camera produced |
| Read a page | `lightonai/LightOnOCR-3-4B` | `/v1/extract` | flat pages, keeps tables as HTML in the Markdown |
| Typed fields | `google/gemma-4-31B-it` | `/v1/chat/completions` | your JSON schema, strict |
| Mask PII | `urchade/gliner_multi_pii-v1` | `/v1/extract` | names, DOB, phone, email, address, card, MRN |

The transcription model is picked per document: a camera photo goes to GLM-OCR, a
scanned page goes to LightOnOCR-3. Everything after that is the same call.

## Why SIE

Four models with four different jobs behind one API, no per-model deployment to
babysit. The same calls run against SIE Serverless or a self-hosted SIE Cluster,
which is the point: these documents are somebody else's private paperwork, so the
end state is that they never leave the network.

## Setup

```bash
npm install          # no dependencies, this just makes npm happy
cp .env.example .env # then put your sk-sie- key in .env
```

Node 20 or newer. There are no runtime dependencies; `fetch` is built in.

## Run

```bash
node index.js intake samples/fax-intake.png --schema intake
node index.js intake samples/receipt-photo.png --schema receipt
node index.js text   samples/statement-table.png --as page
```

`--schema` takes a built-in name (`receipt`, `intake`) or a path to your own JSON
schema file. `--as photo` (default) sends the image to GLM-OCR, `--as page` sends it
to LightOnOCR-3.

The samples are generated, not real paperwork — see `tools/make_samples.py`.

## Example output

### A faxed intake form

```
$ node index.js intake samples/fax-intake.png --schema intake
samples/fax-intake.png  (photo, schema intake.json)

  transcribe  GLM-OCR            1.3 s
  fields      gemma-4-31B-it     2.2 s
  redact                         1.4 s

{
  "full_name": "[PERSON]",
  "date_of_birth": "[DOB]",
  "phone": "[PHONE]",
  "email": "[EMAIL]",
  "address": "[ADDRESS]",
  "insurance_no": "[INSURANCE]",
  "referred_by": "[PERSON]"
}

transcript: 7 PII span(s) detected
redacted 7 field(s)
  full_name      [PERSON]
  date_of_birth  [DOB]
  phone          [PHONE]
  email          [EMAIL]
  address        [ADDRESS]
  insurance_no   [INSURANCE]
  referred_by    [PERSON]
```

Nothing sensitive survives in the object you would store. `--raw` prints the
unredacted fields too, for checking what the model actually read.

### A photographed receipt

```
$ node index.js intake samples/receipt-photo.png --schema receipt
samples/receipt-photo.png  (photo, schema receipt.json)

  transcribe  GLM-OCR            2.5 s
  fields      gemma-4-31B-it     1.9 s
  redact                         1.3 s

{
  "merchant": "HARBOR HARDWARE",
  "date": "2026-10-28",
  "receipt_no": "R-40218",
  "total": "184.25",
  "currency": null
}

transcript: 2 PII span(s) detected
no field values needed masking
```

`currency` is `null` because the receipt never prints one. The model is told to use
`null` rather than guess, and the strict schema makes a wrong shape a failed call.

### A scanned statement page

```
$ node index.js text samples/statement-table.png --as page
samples/statement-table.png  (page)

  page                     179.4 s

# QUARTERLY PARTS STATEMENT

Account 88214
Period 2026-07-01 to 2026-09-30

<table>
  <thead>
    <tr><th>Line</th><th>Part</th><th>Qty</th><th>Unit</th><th>Amount</th></tr>
  </thead>
  <tbody>
    <tr><td>1</td><td>Bearing 6203-2RS</td><td>40</td><td>3.15</td><td>126.00</td></tr>
    <tr><td>2</td><td>Seal kit SK-220</td><td>12</td><td>8.40</td><td>100.80</td></tr>
    <tr><td>3</td><td>Shaft 12x420</td><td>6</td><td>22.50</td><td>135.00</td></tr>
    <tr><td>4</td><td>Coupling L-095</td><td>18</td><td>11.20</td><td>201.60</td></tr>
    <tr><td>5</td><td>Bushing 16mm</td><td>60</td><td>1.85</td><td>111.00</td></tr>
    <tr><td>6</td><td>Grease cartridge</td><td>24</td><td>4.10</td><td>98.40</td></tr>
  </tbody>
</table>

<table>
  <tbody>
    <tr><td>Subtotal</td><td>772.80</td></tr>
    <tr><td>Freight</td><td>38.00</td></tr>
    <tr><td>Tax</td><td>64.86</td></tr>
    <tr><td>Total</td><td>875.66</td></tr>
  </tbody>
</table>

Terms net 30. Questions: accounts@northgate-supply.example
```

(Table rows collapsed onto one line here to keep the README readable; the real
output is one cell per line.)

### Tables become rows, with no second model call

The page scan already arrives as Markdown with `<table>` blocks, so the structure
is in the text. Sending that to a chat model to "read the table" would only add a
call and a chance of invented numbers. `table` parses it instead:

```bash
node index.js table samples/statement-table.png        # OCR first
node index.js table page.md                            # or a page you already saved
```

```
$ node index.js table test/fixtures/statement-table.md
test/fixtures/statement-table.md  (saved markdown)

{
  "tables": [
    {
      "headers": ["Line", "Part", "Qty", "Unit", "Amount"],
      "rows": [
        { "Line": "1", "Part": "Bearing 6203-2RS", "Qty": "40", "Unit": "3.15", "Amount": "126.00" },
        { "Line": "2", "Part": "Seal kit SK-220", "Qty": "12", "Unit": "8.40", "Amount": "100.80" },
        ...
      ]
    }
  ]
}

1 table(s), 6 row(s)
```

Values stay strings, so a part number like `007` keeps its leading zero. A table
with no header row comes back positional (`["Subtotal", "772.80"]`) instead of
being given invented column names.

Parsing a saved page is free and deterministic, which is why `test/` can check it:
`npm test` runs the parser over a real LightOnOCR page and asserts the six line
amounts still add up to the subtotal printed on the page.

## Notes

- **Cold starts are real.** A model that is not loaded answers `503` with
  `Retry-After`; `src/sie.js` waits it out instead of failing. LightOnOCR-3 took
  about three minutes to provision on the first call above, GLM-OCR a few seconds.
  The same page took **7.1 s** on the next call, once the model was warm.
- **Redaction reads the transcript first.** A bare `1979-04-02` is weak evidence;
  the same string under a `Date of birth:` label is not. Spans found in the
  transcript are reused on the extracted field values, then every value gets its
  own detection pass.
- **Overlapping spans collapse.** The first span wins and the rest of the text keeps
  its original characters.
- **Models are configurable** through `.env` if you want to swap the OCR model or
  point the field-extraction step at a different profile.
- **Brute-force pipeline.** No queue, no database. One file in, one object out. At
  real volume you would put this behind a worker pool; the four SIE calls do not
  change.

## License

MIT
