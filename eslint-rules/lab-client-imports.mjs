import fs from 'node:fs'
import path from 'node:path'

// Lab frame files render on the server (docs/design/README.md#design-lab). From a 'use client'
// module they may take only components: any other value arrives as a client reference, which
// fails when the server calls or reads it, and otherwise only `pnpm lab:capture` would notice.

const directive = /^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*['"]use client['"]/
const component = /^[A-Z][A-Za-z0-9]*[a-z][A-Za-z0-9]*$/
const extensions = ['.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts']
const clientCache = new Map()

function resolve(source, filename, cwd) {
  const base = source.startsWith('@/')
    ? path.join(cwd, 'src', source.slice(2))
    : source.startsWith('.')
      ? path.resolve(path.dirname(filename), source)
      : null
  if (!base) return null
  for (const candidate of [base, ...extensions.map((extension) => base + extension)])
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate
  return null
}

function isClientModule(file) {
  if (!clientCache.has(file)) clientCache.set(file, directive.test(fs.readFileSync(file, 'utf8')))
  return clientCache.get(file)
}

/** @type {import('eslint').Rule.RuleModule} */
const labClientImports = {
  meta: {
    type: 'problem',
    docs: { description: 'Lab frame files import only components from client modules.' },
    messages: {
      value:
        "Lab frames render on the server: '{{name}}' from a 'use client' module is not a component. Move plain values to <topic>-model.ts.",
    },
    schema: [],
  },
  create(context) {
    return {
      ImportDeclaration(node) {
        if (node.importKind === 'type' || typeof node.source.value !== 'string') return
        const target = resolve(node.source.value, context.filename, context.cwd)
        if (!target || !isClientModule(target)) return
        for (const specifier of node.specifiers) {
          if (specifier.type === 'ImportSpecifier' && specifier.importKind === 'type') continue
          const name =
            specifier.type === 'ImportNamespaceSpecifier'
              ? `* as ${specifier.local.name}`
              : specifier.local.name
          if (specifier.type === 'ImportNamespaceSpecifier' || !component.test(name))
            context.report({ node: specifier, messageId: 'value', data: { name } })
        }
      },
    }
  },
}

export default labClientImports
