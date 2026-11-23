-- Catalog products (#196): shared reference rows a scanned barcode looks up, keyed by GTIN-14 so a
-- pack's DataMatrix GTIN and its EAN-13 or UPC-A find one row. original_name is the source list's
-- entry; name, strength and type are derived from it. No foreign keys run to or from personal
-- tables: a Medicine stores no catalog reference, and a refresh never touches personal rows.
CREATE TABLE catalog_products (
 gtin TEXT PRIMARY KEY NOT NULL CHECK (length(gtin) = 14 AND gtin NOT GLOB '*[^0-9]*'),
 original_name TEXT NOT NULL,
 name TEXT,
 strength TEXT,
 type TEXT,
 status TEXT NOT NULL CHECK (status IN ('classified', 'unresolved', 'unsupported'))
);
