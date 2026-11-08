// Width variants never earn a journey (docs/verification.md, When a journey is allowed).
const widthName = /width|viewport/i
const declaringMembers = new Set([
  'describe',
  'only',
  'skip',
  'fixme',
  'fail',
  'parallel',
  'serial',
])
const iterationMethods = new Set(['forEach', 'map', 'flatMap'])
const isFunction = (node) =>
  node?.type === 'ArrowFunctionExpression' || node?.type === 'FunctionExpression'

/** `test(...)` and `test.describe(...)` chains that declare; steps, hooks and `test.skip(cond)` do not. */
function isDeclaration(node) {
  if (node.type !== 'CallExpression') return false
  const members = []
  let callee = node.callee
  while (callee.type === 'MemberExpression' && !callee.computed) {
    members.unshift(callee.property.name)
    callee = callee.object
  }
  if (callee.type !== 'Identifier' || callee.name !== 'test') return false
  if (!members.every((member) => declaringMembers.has(member))) return false
  return (
    isFunction(node.arguments.at(-1)) && (node.arguments.length > 1 || members.includes('describe'))
  )
}

/** The parts of a loop that say what it iterates, or null for anything that is not a loop. */
function loopHead(node) {
  if (node.type === 'ForOfStatement' || node.type === 'ForInStatement')
    return [node.left, node.right]
  if (node.type === 'ForStatement') return [node.init, node.test, node.update].filter(Boolean)
  if (
    node.type === 'CallExpression' &&
    node.callee.type === 'MemberExpression' &&
    iterationMethods.has(node.callee.property.name) &&
    isFunction(node.arguments[0])
  )
    return [node.callee.object, ...node.arguments[0].params]
  return null
}

/** The value a name was declared with, so a loop over `const sizes = [...]` is still read. */
function initializer(identifier, sourceCode) {
  for (let scope = sourceCode.getScope(identifier); scope; scope = scope.upper) {
    const variable = scope.set.get(identifier.name)
    if (variable) return variable.defs[0]?.node.init ?? null
  }
  return null
}

// Names and property keys only: a route titled 'width' is a string, not a width.
function mentionsWidth(node, sourceCode, seen = new Set()) {
  if (node.type === 'Identifier') {
    if (widthName.test(node.name)) return true
    const init = initializer(node, sourceCode)
    if (!init || seen.has(init)) return false
    seen.add(init)
    return mentionsWidth(init, sourceCode, seen)
  }
  return (sourceCode.visitorKeys[node.type] ?? []).some((key) =>
    [node[key]].flat().some((child) => child && mentionsWidth(child, sourceCode, seen)),
  )
}

/** @type {import('eslint').Rule.RuleModule} */
const noWidthLoopTests = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow journeys declared in a loop over screen widths or viewports.' },
    messages: {
      widthLoop:
        'Width variants never earn a journey (docs/verification.md). A real exception needs an inline disable saying why behavior differs by width.',
    },
    schema: [],
  },
  create(context) {
    const { sourceCode } = context
    const isWidthLoop = (node) =>
      loopHead(node)?.some((part) => mentionsWidth(part, sourceCode)) ?? false
    return {
      CallExpression(node) {
        if (!isDeclaration(node)) return
        const ancestors = sourceCode.getAncestors(node)
        const loop = ancestors.findIndex(isWidthLoop)
        // A describe in the loop already reports; its tests would only repeat it.
        if (loop !== -1 && !ancestors.slice(loop + 1).some(isDeclaration))
          context.report({ node, messageId: 'widthLoop' })
      },
    }
  },
}

export default noWidthLoopTests
