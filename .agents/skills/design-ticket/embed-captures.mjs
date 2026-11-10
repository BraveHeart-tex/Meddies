#!/usr/bin/env node
// Inlines PNG captures into a comparison page, since Artifact pages cannot load local files.
// Every src="<name>.png" is read from the capture folder and replaced with a data: URI.
// Usage: node embed-captures.mjs <page.html> <capture-folder> > out.html
import { readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

const [page, folder] = process.argv.slice(2)
if (!page || !folder) {
  console.error('Usage: node embed-captures.mjs <page.html> <capture-folder> > out.html')
  process.exit(2)
}
const html = await readFile(page, 'utf8')
const names = [...new Set([...html.matchAll(/src="([^"]+\.png)"/g)].map((match) => match[1]))]
const images = new Map()
for (const name of names)
  images.set(name, (await readFile(join(folder, basename(name)))).toString('base64'))
process.stdout.write(
  html.replace(
    /src="([^"]+\.png)"/g,
    (_, name) => `src="data:image/png;base64,${images.get(name)}"`,
  ),
)
