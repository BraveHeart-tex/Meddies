import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { unstable_splitSqlQuery } from 'wrangler'
import { catalogStatuses } from '../src/features/catalog-products/contract'
import { writableMedicineTypes } from '../src/lib/quantity-policy'
import {
  catalogMigrationSql,
  catalogStatuses as scriptStatuses,
  catalogTypes,
  statementBudget,
} from '../scripts/catalog-migration.mjs'

// `pnpm catalog:migration` (#472): validates the catalog CSV, reports GTIN changes against the
// previous CSV and writes the next numbered data migration.
const dirs: string[] = []
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })))

const header = 'barcode,original_name,name,strength,type,status'
function generate(csv: string, previous = header) {
  const dir = mkdtempSync(join(tmpdir(), 'catalog-migration-'))
  dirs.push(dir)
  const migrations = join(dir, 'migrations')
  mkdirSync(migrations)
  writeFileSync(join(migrations, '0001_first.sql'), '')
  writeFileSync(join(migrations, '0009_ninth.sql'), '')
  writeFileSync(join(dir, 'next.csv'), csv)
  writeFileSync(join(dir, 'previous.csv'), previous)
  const result = spawnSync(
    process.execPath,
    [
      'scripts/catalog-migration.mjs',
      ...['--csv', join(dir, 'next.csv'), '--previous', join(dir, 'previous.csv')],
      ...['--migrations', migrations, '--date', '2026-01-02'],
    ],
    { encoding: 'utf8' },
  )
  const written = readdirSync(migrations).filter((file) => file.includes('catalog_data'))
  return { ...result, written, sql: (file: string) => readFileSync(join(migrations, file), 'utf8') }
}

test('writes the next numbered data migration that replaces every Catalog product', () => {
  const result = generate(
    [
      header,
      '8699809018853,WARFMADIN 5 MG TABLET (28 TABLET),WARFMADIN,5 mg,tablet,classified',
      '"036000291452","DEMO, ""PLUS"" 10 MG",DEMO,10 mg,capsule,unresolved',
      "16949236216261,O'NEIL IGNE,,,,unsupported",
      '96385074,KISA,KISA,1%,drops,classified',
      '',
    ].join('\n'),
  )
  expect(result.stderr).toBe('')
  expect(result.status).toBe(0)
  expect(result.written).toEqual(['0010_catalog_data_2026-01-02.sql'])
  const sql = result.sql(result.written[0]!)
  expect(sql).toMatch(/^-- Catalog data: every Catalog product from .*next\.csv/)
  const statements = unstable_splitSqlQuery(sql.replace(/^--.*\n/gm, ''))
  expect(statements).toEqual([
    'DELETE FROM catalog_products',
    `INSERT INTO catalog_products (gtin, original_name, name, strength, type, status) VALUES
('08699809018853', 'WARFMADIN 5 MG TABLET (28 TABLET)', 'WARFMADIN', '5 mg', 'tablet', 'classified'),
('00036000291452', 'DEMO, "PLUS" 10 MG', 'DEMO', '10 mg', 'capsule', 'unresolved'),
('16949236216261', 'O''NEIL IGNE', NULL, NULL, NULL, 'unsupported'),
('00000096385074', 'KISA', 'KISA', '1%', 'drops', 'classified')`,
  ])
})

test('splits the inserts so each statement stays under D1’s 100 KB limit', () => {
  const rows = Array.from({ length: 3000 }, (_, i) => ({
    gtin: String(i).padStart(14, '0'),
    original_name: `İLAÇ ${'X'.repeat(60)} ${i}`,
    name: 'İLAÇ',
    strength: '5 mg',
    type: 'tablet',
    status: 'classified',
  }))
  const statements = unstable_splitSqlQuery(catalogMigrationSql(rows))
  expect(statements.length).toBeGreaterThan(3)
  for (const statement of statements)
    expect(Buffer.byteLength(statement)).toBeLessThanOrEqual(statementBudget)
  const tuples = statements.slice(1).flatMap((statement) => statement.split('\n').slice(1))
  expect(tuples).toHaveLength(rows.length)
})

test('invalid input writes no migration and names each failing row', () => {
  const result = generate(
    [
      header,
      '8699809018853,OK,OK,5 mg,tablet,classified',
      '869980901885a,HARF,,,,classified',
      '8699809018854,KONTROL,,,,classified',
      '08699809018853,TEKRAR,,,,classified',
      '8699809018884,ENJEKTOR,,,injection,classified',
      '8680199543995,DURUM,,,,retired',
      '8680199615715,EKSIK,,',
      '1234567,KISA,,,,classified',
    ].join('\n'),
  )
  expect(result.status).toBe(1)
  expect(result.written).toEqual([])
  expect(result.stdout).toBe('')
  const lines = result.stderr.trim().split('\n').slice(1)
  expect(lines).toEqual([
    'line 3: barcode "869980901885a" is not digits',
    'line 4: barcode 8699809018854 is not a GTIN or fails its check digit',
    'line 5: duplicate GTIN-14 08699809018853 (line 2)',
    'line 6: type "injection" is not a Medicine type',
    'line 7: status "retired" is not a known status',
    'line 8: 4 columns, expected 6',
    'line 9: barcode 1234567 is not a GTIN or fails its check digit',
  ])

  const wrongHeader = generate('barcode,name,original_name,strength,type,status\n')
  expect(wrongHeader.status).toBe(1)
  expect(wrongHeader.written).toEqual([])
  expect(wrongHeader.stderr).toContain(`line 1: header must be ${header}`)
})

test('prints added, removed and changed GTIN counts against the previous CSV', () => {
  const previous = [
    header,
    '8699809018853,WARFMADIN,WARFMADIN,5 mg,tablet,classified',
    '8699809018884,SINORETIK,SINORETIK,20 mg,tablet,classified',
    '8680199543995,TEKANAFIN,TEKANAFIN,1%,,unsupported',
    '8680199615715,RIMONAL,RIMONAL,0.2%,drops,classified',
  ].join('\n')
  const next = [
    header,
    '08699809018853,WARFMADIN,WARFMADIN,5 mg,tablet,classified',
    '8699809018884,SINORETIK,SINORETIK,20 mg/12.5 mg,tablet,classified',
    '8680199615715,RIMONAL,RIMONAL,0.2%,drops,unresolved',
    '036000291452,DEMO,DEMO,10 mg,capsule,classified',
  ].join('\n')
  const result = generate(next, previous)
  expect(result.status).toBe(0)
  expect(result.stdout).toContain(
    '4 Catalog products. Against the previous committed CSV: 1 added, 1 removed, 2 changed GTINs.',
  )
})

test('accepts exactly the writable Medicine types and the Catalog statuses', () => {
  const result = generate(
    [
      header,
      '8699809018853,DEMO SUPPOSITORY,DEMO,200 mg,suppository,classified',
      '036000291452,DEMO OVULE,DEMO,500 mg,ovule,classified',
    ].join('\n'),
  )
  expect(result.stderr).toBe('')
  expect(result.status).toBe(0)
  expect(result.sql(result.written[0]!)).toContain("'suppository', 'classified'")
  expect(result.sql(result.written[0]!)).toContain("'ovule', 'classified'")
  expect([...catalogTypes].sort()).toEqual([...writableMedicineTypes].sort())
  expect(scriptStatuses).toEqual([...catalogStatuses])
})
