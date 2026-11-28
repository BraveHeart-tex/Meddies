# 05 - Turkish Medication Catalog & Barcode

Catalog lookup, pack scanning and the approved barcode validation rules.

## Scope

For the user-facing barcode flow, the app initially needs **a medication/product name**, not a complete clinical drug monograph or ingredient database.

Flow, from _Scan the pack_ in Add medicine:

1. User scans the medicine package barcode or DataMatrix.
2. Extract/normalize the available product identifier (e.g. GTIN, where present).
3. Look up an indexed Turkish medicine catalog record.
4. Show the detected product name for user confirmation.
5. Continue to the user's own schedule and stock setup.
6. Allow manual entry when lookup is missing, ambiguous or unsupported.

**Manual medication creation stays the default.** A scan only fills the Add medicine form, every filled value stays editable, and nothing saves until _Save medication_.

**A match plays the match sound**, "Two capsules", about 0.5s, once the form fills: on every match, including an unsupported form, and on each match after _Scan again_. No match, a failed lookup and a lookup that ends after Close stay silent; there is no error sound. It follows the iPhone silent switch, mixes with the user's music without pausing it, follows media volume on Android, and never delays the fill: a sound that is not ready, blocked or fails to decode stays silent. No mute setting, no vibration.

## Pack barcode identification

Turkish packs carry a _karekod_: a GS1 DataMatrix (ECC200, square or rectangular), not a QR
code. A Catalog product is identified by the GTIN in that DataMatrix, or by the GTIN in the
pack's EAN-13 when one is printed. Serial number, expiry and batch identify one box and are not
used.

Sources, verified 2026-11-28:

- **Guide**: TİTCK, [Beşeri Tıbbi Ürünler Barkod ve Karekod Uygulama Kılavuzu](https://titck.gov.tr/mevzuat/beseri-tibbi-urunler-barkod-ve-karekod-uygulama-kilavuzu-27122018173036)
  ([PDF](https://titck.gov.tr/storage/legislation/eYHHQ828.PDF)). Undated, no revision number; in
  force since its October 2017 publication. It replaced the 2012 Beşeri İlaçlar Barkod Uygulama
  Kılavuzu (Art. 13).
- **Regulation**: [Beşeri Tıbbi Ürünlerin Ambalaj Bilgileri, Kullanma Talimatı ve Takibi Yönetmeliği](https://www.mevzuat.gov.tr/anasayfa/MevzuatFihristDetayIframe?MevzuatTur=7&MevzuatNo=23536&MevzuatTertip=5),
  Resmî Gazete 25.04.2017 No. 30048, consolidated text.

### Which packs carry which code

- **DataMatrix is required** on the outer pack of every prescription and non-prescription human
  medicine, hospital packs included, and on special medical foods (Regulation Art. 5(1)(n),
  16(2); Guide Art. 6(2)).
- **EAN-13 is optional**: a pack _may_ also print its GTIN as EAN-13 (Guide Art. 6(1);
  Regulation Art. 5(1)(o)). A pack with only a DataMatrix is compliant. The texts name no other
  linear symbology for packs.
- **Exceptions, no DataMatrix required**: large-volume parenterals, radiopharmaceuticals and
  patient-specific products (Regulation Art. 5(1)(n)); promotional samples TİTCK exempts
  (Regulation Art. 10(1)); export-only products (Guide Art. 2(2)).
- **Multi-unit packs**: when single units cannot be coded, the transport pack is coded as one
  product (Regulation Art. 17(4)).
- **Old packaging**: products made before 31.12.2017 may stay on sale in their old packs until
  expiry (Regulation Temporary Art. 1(2)).

### DataMatrix fields and order

Guide Art. 5(1) and 6(3):

| Order | Field           | AI   | Length                    |
| ----- | --------------- | ---- | ------------------------- |
| 1     | FNC1            | -    | marks the symbol as GS1   |
| 2     | GTIN            | `01` | fixed, 14 digits          |
| 3     | Serial number   | `21` | variable, up to 20        |
| 4     | Group separator | -    | ends the serial number    |
| 5     | Expiry date     | `17` | fixed, 6 digits, `YYMMDD` |
| 6     | Batch number    | `10` | variable, up to 20, last  |

- A retail 13-digit GTIN gets a leading `0` to make the GTIN-14 (Guide Art. 5(1)(a)).
- The reader drops the leading FNC1; a separator inside the content reaches the app as ASCII 29
  (`GS`). A separator follows a variable-length field only when another field follows it (Guide
  Art. 5(1)(e), 6(3)(a)).
- Serial and batch use only digits and capital letters `A`-`Z` (Guide Art. 5(1)(e)(2)).
- Expiry day `00` means the month's last day (Guide Art. 5(1)(c)).
- Parentheses around AIs appear only in the printed text beside the code, never inside it (Guide
  Art. 10(2)).

Guide example: printed `<FNC1>010869123456789021AB123456789CD<FNC1>1723043010123456ABC`; the app
receives `010869123456789021AB123456789CD<GS>1723043010123456ABC`.

So the GTIN is always the 14 digits after a leading `01`, with no separator before it. Content
that does not start that way is not a compliant pack code.

### Scanner rules

These approved rules apply to the planned Scanner validation update.

- Keep EAN-13, EAN-8, UPC-A, UPC-E and DataMatrix with `@yudiel/react-qr-scanner@2.6.0`. Use EAN-13 and GS1 DataMatrix as the primary Turkish pack verification cases. Required carriers and fields follow the verified profile above.
- Treat product identifiers as strings. Reuse the catalog's GTIN-14 normalizer and GS1 check-digit validation for lookup and candidate comparison. Preserve leading zeros and a nonzero GTIN-14 indicator digit. A compressed UPC-E must be expanded before normalization. The pinned decoder already returns an expanded identifier.
- For DataMatrix, identify the Catalog product from a single GS1 application identifier `01` containing a valid 14-digit GTIN. Recognize the boundaries of the supported pack fields `17` (expiry), `10` (batch or lot) and `21` (serial) only as needed to identify the product reliably. Honor the GS separator after a variable-length field when another field follows. Keep parsing scoped to the pack formats covered by the lookup.
- The decoder may return identical text for GS1 DataMatrix and ordinary DataMatrix and omit their symbology identifiers. Accept bare element text only when it conforms to the supported pack structure. Treat that as evidence for a Catalog product lookup, with the filled details still subject to user confirmation. Ignore explicit ordinary DataMatrix and payloads that cannot reliably yield a product identifier. Only the extracted GTIN may reach the lookup API. Discard raw DataMatrix payloads, expiry, batch and serial values after parsing and exclude them from telemetry.
- Validate all candidates before freezing the Scanner. Ignore invalid reads. Equivalent identifiers count as one product. When distinct valid GTINs are visible together, keep the camera active and guide the user to present a single barcode. A single valid candidate retains the existing lookup, No match, failed lookup, Scan again and manual-entry behavior.

## Approved catalog boundary

- Manual medicine entry works without a catalog match or barcode. UserMedication, schedules and dose history must exist independently of any external CatalogProduct identifier.
- Scanned names and catalog records are identity **hints for confirmation**, not medical advice, dose recommendations or a prescribing source.
- Catalog replacement, corrections and imports must not cascade into changes or deletion of the user's personal medication records, stock or intake history.
- Barcode-assisted onboarding is a later capability, not a prerequisite for the approved private-MVP manual entry flow. Source licensing, coverage and practical package recognition must be validated before vendor adoption.

Candidate datasets and camera libraries below remain investigatory until separately selected.

## Candidate Turkish data sources discussed

- **TİTCK** official Turkish medicines-related datasets and publications.
- **Selçuk Ecza** catalog / barcode and Excel-style product datasets.
- Türkiye İlaç Kataloğu datasets available via **Hugging Face**.
- Turkish Medicine API-style community sources.

These are research leads, not approved integrations. Earlier investigation identified a Turkish catalog dataset containing approximately 6,084 products; coverage, provenance, update cadence, completeness and permitted usage must be verified independently.

## Current preferred storage direction

Keep catalog data in **Cloudflare D1**, in a separately indexed model from user medication schedules and histories. Catalog changes are expected to be infrequent. Avoid introducing Redis without a measured need. An earlier local SQLite lookup approach was considered; the later D1-centric architecture is the current preference.

## Before vendor/source selection

- Verify data license and reuse rights; do not assume public availability means redistributable.
- Measure coverage for currently sold Turkish medications and real package formats.
- Check identifier normalization and GTIN/DataMatrix support.
- Define catalog versioning, refresh/import strategy and error handling.
- Handle unknown and duplicate identifiers, manual corrections and user confirmation.
- Verify camera permission and scan performance on iOS and Android PWAs.

## Important boundary

A catalog record provides a **product label/identity hint**, not a prescribing instruction. User-controlled schedules and historical intake belong to separate domain models.
