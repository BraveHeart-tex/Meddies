# 05 - Turkish Medication Catalog & Barcode

Discovery and preferred data direction, subject to source quality, licensing and feasibility.

## Scope

For the user-facing barcode flow, the app initially needs **a medication/product name**, not a complete clinical drug monograph or ingredient database.

Intended later flow:

1. User scans the medicine package barcode or DataMatrix.
2. Extract/normalize the available product identifier (e.g. GTIN, where present).
3. Look up an indexed Turkish medicine catalog record.
4. Show the detected product name for user confirmation.
5. Continue to the user's own schedule and stock setup.
6. Allow manual entry when lookup is missing, ambiguous or unsupported.

**Manual medication creation is the MVP starting point.** Barcode-assisted entry belongs to a later vertical slice.

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
