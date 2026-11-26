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

These approved rules apply to the planned Scanner validation update.

- Keep EAN-13, EAN-8, UPC-A, UPC-E and DataMatrix with `@yudiel/react-qr-scanner@2.6.0`. Use EAN-13 and GS1 DataMatrix as the primary Turkish pack verification cases. Confirm required carriers and fields against the current TİTCK packaging or İlaç Takip Sistemi guidance before implementing the DataMatrix rules.
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
