import { createCn } from 'cn/config'

// Cozy Care font-size utilities must merge as sizes, not colors (text-label vs text-muted-foreground).
export const cn = createCn({
  extend: {
    classGroups: {
      'font-size': [
        {
          text: ['display', 'title', 'heading', 'body-lg', 'body-sm', 'caption', 'label', 'micro'],
        },
      ],
    },
  },
})
