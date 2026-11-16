// Owned capture cases screenshot only through captureSettled (tests/browser/settled-capture.ts),
// which finishes animations and waits for a Drawer to rest. Other capture paths are not owned.

/** The title of a `test('title', ...)` declaration, or null. */
function testTitle(node) {
  if (node.type !== 'CallExpression') return null
  const { callee } = node
  const isTest =
    (callee.type === 'Identifier' && callee.name === 'test') ||
    (callee.type === 'MemberExpression' &&
      callee.object.type === 'Identifier' &&
      callee.object.name === 'test' &&
      !callee.computed &&
      ['only', 'skip', 'fixme', 'fail'].includes(callee.property.name))
  const [title] = node.arguments
  return isTest && title?.type === 'Literal' && typeof title.value === 'string' ? title.value : null
}

/** @type {import('eslint').Rule.RuleModule} */
const settledCaptures = {
  meta: {
    type: 'problem',
    docs: { description: 'Require captureSettled for screenshots in owned capture cases.' },
    messages: {
      direct:
        "Capture through captureSettled from tests/browser/settled-capture.ts: '{{test}}' must screenshot the settled interface.",
    },
    schema: [
      {
        type: 'object',
        properties: { tests: { type: 'array', items: { type: 'string' } } },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const owned = new Set(context.options[0]?.tests ?? [])
    return {
      CallExpression(node) {
        const { callee } = node
        if (
          callee.type !== 'MemberExpression' ||
          callee.computed ||
          callee.property.name !== 'screenshot'
        )
          return
        const test = context.sourceCode
          .getAncestors(node)
          .map(testTitle)
          .find((title) => title !== null && owned.has(title))
        if (test) context.report({ node, messageId: 'direct', data: { test } })
      },
    }
  },
}

export default settledCaptures
