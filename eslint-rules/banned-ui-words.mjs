// Scope and the words themselves are documented in docs/copy.md, under Banned words.
const bannedWords = /\b(outcome|intake|confirmed|unconfirmed|correct)\b/i
const copyProps = new Set(['aria-label', 'label', 'title'])

/** @type {import('eslint').Rule.RuleModule} */
const bannedUiWords = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow internal words in visible JSX copy.' },
    messages: { banned: '"{{word}}" is banned in UI copy. See docs/copy.md for what to write.' },
    schema: [],
  },
  create(context) {
    function check(node, text) {
      const match = bannedWords.exec(text)
      if (match) context.report({ node, messageId: 'banned', data: { word: match[1] } })
    }

    // Follows the expressions that can yield copy. Identifiers and calls are never read.
    function checkExpression(node) {
      if (node.type === 'Literal' && typeof node.value === 'string') check(node, node.value)
      else if (node.type === 'TemplateLiteral')
        for (const quasi of node.quasis) check(quasi, quasi.value.cooked ?? '')
      else if (node.type === 'ConditionalExpression') {
        checkExpression(node.consequent)
        checkExpression(node.alternate)
      } else if (node.type === 'LogicalExpression') {
        checkExpression(node.left)
        checkExpression(node.right)
      } else if (node.type === 'JSXExpressionContainer') checkExpression(node.expression)
    }

    return {
      JSXText(node) {
        check(node, node.value)
      },
      JSXExpressionContainer(node) {
        if (node.parent.type === 'JSXElement' || node.parent.type === 'JSXFragment')
          checkExpression(node.expression)
      },
      JSXAttribute(node) {
        if (node.name.type === 'JSXIdentifier' && copyProps.has(node.name.name) && node.value)
          checkExpression(node.value)
      },
    }
  },
}

export default bannedUiWords
