const localeString = /^toLocale\w*String$/

/** @type {import('eslint').Rule.RuleModule} */
const noRawDateFormat = {
  meta: {
    type: 'problem',
    docs: { description: 'Keep date and time formatting in the central date module.' },
    messages: {
      raw: 'Format dates and times with src/lib/calendar-date.ts, the one place they are formatted (docs/copy.md).',
    },
    schema: [],
  },
  create(context) {
    return {
      MemberExpression(node) {
        const name = node.computed ? node.property.value : node.property.name
        if (typeof name !== 'string') return
        const dateTimeFormat = node.object.type === 'Identifier' && node.object.name === 'Intl'
        if ((dateTimeFormat && name === 'DateTimeFormat') || localeString.test(name))
          context.report({ node, messageId: 'raw' })
      },
    }
  },
}

export default noRawDateFormat
