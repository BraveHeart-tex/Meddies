import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

// `pnpm catalog:migration` (#472): turns the committed TİTCK catalog CSV into the next numbered
// data migration that replaces every Catalog product. The CSV's derived columns come from the
// maintainer's pipeline outside the repo. Rows are stored unchanged except the barcode, which is
// left-padded to its GTIN-14; an empty cell is NULL. Any invalid row rejects the whole file and
// writes nothing. Rollback: check out the previous CSV commit's file and run this again.
export const catalogCsv = 'worker/catalog-products.csv'
export const catalogHeader = ['barcode', 'original_name', 'name', 'strength', 'type', 'status']
// Writable Medicine types (src/lib/quantity-policy.ts) and Catalog statuses
// (src/features/catalog-products/contract.ts); the tooling test asserts they match.
export const catalogTypes = ['tablet', 'capsule', 'liquid', 'inhaler', 'drops']
export const catalogStatuses = ['classified', 'unresolved', 'unsupported']
// D1 rejects a statement over 100 KB; each INSERT stays well under it.
export const statementBudget = 90_000
const columns = ['gtin', 'original_name', 'name', 'strength', 'type', 'status']

/** RFC 4180 records, each with the 1-based line it starts on. */
function records(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  let line = 1
  let start = 1
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (char === '"') quoted = false
      else {
        if (char === '\n') line++
        field += char
      }
    } else if (char === '"' && field === '') quoted = true
    else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push({ line: start, values: row })
      row = []
      field = ''
      start = ++line
    } else field += char
  }
  if (field !== '' || row.length) rows.push({ line: start, values: [...row, field] })
  return rows
}

/** GS1 mod 10 check over a left-padded GTIN-14, as normalizeGtin in the catalog contract. */
function gtin14(barcode) {
  if (!/^(?:\d{8}|\d{12,14})$/.test(barcode)) return null
  const gtin = barcode.padStart(14, '0')
  let sum = 0
  for (let i = 0; i < 13; i++) sum += Number(gtin[i]) * (i % 2 === 0 ? 3 : 1)
  return (10 - (sum % 10)) % 10 === Number(gtin[13]) ? gtin : null
}

/** Validated Catalog products, or every failing row by line. */
export function parseCatalog(text) {
  const [header, ...body] = records(text)
  if (header?.values.join(',') !== catalogHeader.join(','))
    return { rows: [], errors: [`line 1: header must be ${catalogHeader.join(',')}`] }
  const rows = []
  const errors = []
  const seen = new Map()
  for (const { line, values } of body) {
    if (values.length !== catalogHeader.length) {
      errors.push(`line ${line}: ${values.length} columns, expected ${catalogHeader.length}`)
      continue
    }
    const [barcode, originalName, name, strength, type, status] = values
    const problems = []
    const gtin = gtin14(barcode)
    if (!/^\d+$/.test(barcode)) problems.push(`barcode "${barcode}" is not digits`)
    else if (!gtin) problems.push(`barcode ${barcode} is not a GTIN or fails its check digit`)
    else if (seen.has(gtin)) problems.push(`duplicate GTIN-14 ${gtin} (line ${seen.get(gtin)})`)
    if (type && !catalogTypes.includes(type)) problems.push(`type "${type}" is not a Medicine type`)
    if (!catalogStatuses.includes(status)) problems.push(`status "${status}" is not a known status`)
    if (gtin && !seen.has(gtin)) seen.set(gtin, line)
    if (problems.length) errors.push(`line ${line}: ${problems.join('; ')}`)
    else
      rows.push({
        gtin,
        original_name: originalName,
        name: name || null,
        strength: strength || null,
        type: type || null,
        status,
      })
  }
  return { rows, errors }
}

/** Added, removed and changed GTINs from the previous catalog to the next. */
export function diffCatalogs(previous, next) {
  const before = new Map(previous.map((row) => [row.gtin, row]))
  const after = new Map(next.map((row) => [row.gtin, row]))
  let added = 0
  let changed = 0
  for (const [gtin, row] of after) {
    const old = before.get(gtin)
    if (!old) added++
    else if (columns.some((column) => old[column] !== row[column])) changed++
  }
  const removed = [...before.keys()].filter((gtin) => !after.has(gtin)).length
  return { added, removed, changed }
}

const literal = (value) => (value === null ? 'NULL' : `'${value.replaceAll("'", "''")}'`)

/** A migration replacing every Catalog product, in INSERTs under the statement budget. */
export function catalogMigrationSql(rows, source = catalogCsv) {
  const prefix = `INSERT INTO catalog_products (${columns.join(', ')}) VALUES\n`
  const statements = []
  let values = []
  let size = Buffer.byteLength(prefix) + 2
  for (const row of rows) {
    const tuple = `(${columns.map((column) => literal(row[column])).join(', ')})`
    const bytes = Buffer.byteLength(tuple) + 2
    if (values.length && size + bytes > statementBudget) {
      statements.push(`${prefix}${values.join(',\n')};`)
      values = []
      size = Buffer.byteLength(prefix) + 2
    }
    values.push(tuple)
    size += bytes
  }
  if (values.length) statements.push(`${prefix}${values.join(',\n')};`)
  return [
    `-- Catalog data: every Catalog product from ${source}, written by pnpm catalog:migration.`,
    '-- Generated; never edit. A refresh or rollback is a new data migration.',
    'DELETE FROM catalog_products;',
    ...statements,
    '',
  ].join('\n')
}

/** The next numbered data migration's file name. */
export function catalogMigrationName(existing, date) {
  const last = Math.max(0, ...existing.map((file) => Number(/^(\d+)_/.exec(file)?.[1] ?? 0)))
  return `${String(last + 1).padStart(4, '0')}_catalog_data_${date}.sql`
}

function committedCsv() {
  try {
    return execFileSync('git', ['show', `HEAD:${catalogCsv}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 64 * 1024 * 1024,
    })
  } catch {
    return null
  }
}

function main(args) {
  const option = (name) => {
    const index = args.indexOf(`--${name}`)
    return index === -1 ? undefined : args[index + 1]
  }
  const csv = option('csv') ?? catalogCsv
  const previousPath = option('previous')
  const migrations = option('migrations') ?? 'worker/migrations'
  const date = option('date') ?? new Date().toISOString().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`--date ${date} is not YYYY-MM-DD`)

  const { rows, errors } = parseCatalog(readFileSync(csv, 'utf8'))
  if (errors.length) {
    process.stderr.write(`${csv} is invalid; no migration written:\n${errors.join('\n')}\n`)
    return 1
  }
  const previousText = previousPath ? readFileSync(previousPath, 'utf8') : committedCsv()
  const previous = previousText === null ? { rows: [], errors: [] } : parseCatalog(previousText)
  if (previous.errors.length) {
    process.stderr.write(`The previous CSV is invalid:\n${previous.errors.join('\n')}\n`)
    return 1
  }
  const { added, removed, changed } = diffCatalogs(previous.rows, rows)
  const file = join(migrations, catalogMigrationName(readdirSync(migrations), date))
  if (existsSync(file)) throw new Error(`${file} already exists`)
  writeFileSync(file, catalogMigrationSql(rows, relative(process.cwd(), csv)))
  process.stdout.write(
    `${rows.length} Catalog products. Against the previous committed CSV: ${added} added, ${removed} removed, ${changed} changed GTINs.\nWrote ${file}\n`,
  )
  return 0
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  }
}
