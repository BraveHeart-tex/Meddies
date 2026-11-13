// Tests assert behavior, not styling (docs/verification.md, When a test is required).
// Flags `toHaveClass` with a Tailwind styling utility; a class that is the behavior's only
// observable signal stays allowed through an inline disable stating the reason.
const exactUtilities = new Set([
  'block',
  'inline',
  'inline-block',
  'inline-flex',
  'inline-grid',
  'flex',
  'grid',
  'hidden',
  'contents',
  'container',
  'border',
  'rounded',
  'shadow',
  'ring',
  'outline',
  'underline',
  'italic',
  'uppercase',
  'lowercase',
  'capitalize',
  'truncate',
  'absolute',
  'relative',
  'fixed',
  'sticky',
  'static',
  'grow',
  'shrink',
  'transition',
  'sr-only',
])
const utilityPrefix = new RegExp(
  `^(?:${[
    'bg',
    'text',
    'border(?:-[xytrbl])?',
    'rounded',
    'shadow',
    'ring',
    'outline',
    'p[xytrblse]?',
    'm[xytrblse]?',
    'w',
    'h',
    'min-w',
    'max-w',
    'min-h',
    'max-h',
    'size',
    'gap(?:-[xy])?',
    'space-[xy]',
    'col',
    'row',
    'grid-cols',
    'grid-rows',
    'flex',
    'items',
    'justify',
    'self',
    'place',
    'font',
    'leading',
    'tracking',
    'opacity',
    'z',
    'top',
    'left',
    'right',
    'bottom',
    'inset(?:-[xy])?',
    'fill',
    'stroke',
    'translate-[xy]',
    'scale',
    'rotate',
    'duration',
    'delay',
    'ease',
    'animate',
    'overflow(?:-[xy])?',
    'whitespace',
    'break',
    'aspect',
    'order',
    'basis',
    'line-clamp',
    'decoration',
    'cursor',
    'pointer-events',
    'select',
    'divide',
    'backdrop',
    'blur',
    'grow',
    'shrink',
  ].join('|')})-.+$`,
)

/** Strips variants (`md:`, `data-[state=open]:`), `!` and the negative `-` from a class token. */
function isUtility(token) {
  const base = token.replace(/^(?:[^\s:]*\[[^\]]*\][^\s:]*:|[^\s:[]+:)+/, '').replace(/^!?-?/, '')
  return exactUtilities.has(base) || utilityPrefix.test(base)
}

function classText(node) {
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0)
    return node.quasis[0].value.cooked
  return null
}

/** @type {import('eslint').Rule.RuleModule} */
const noCosmeticClassAssertions = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow toHaveClass assertions on styling utility classes.' },
    messages: {
      cosmetic:
        "'{{token}}' is styling, not behavior (docs/verification.md). Assert the behavior, or add an inline disable naming why the class is its only observable signal.",
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        const { callee } = node
        if (callee.type !== 'MemberExpression' || callee.computed) return
        if (callee.property.name !== 'toHaveClass') return
        const token = node.arguments
          .map(classText)
          .filter((text) => text !== null)
          .flatMap((text) => text.split(/\s+/))
          .find(isUtility)
        if (token) context.report({ node, messageId: 'cosmetic', data: { token } })
      },
    }
  },
}

export default noCosmeticClassAssertions
