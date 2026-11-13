import { getRoles, isInaccessible } from '@testing-library/dom'

/**
 * A text outline of what assistive technology meets in `container`: each element with a role,
 * its accessible name and states, and the text between them. No classes or styles, so it changes
 * with copy and structure, never with visual tweaks (docs/design/README.md#outlines).
 */
export function outline(container: HTMLElement) {
  const roles = new Map<Element, string>()
  for (const [role, elements] of Object.entries(getRoles(container)))
    for (const element of elements) if (!ignoredRoles.has(role)) roles.set(element, role)
  const lines: string[] = []
  walk(container, 0, roles, lines)
  return `${lines.join('\n')}\n`
}

const ignoredRoles = new Set(['generic', 'presentation', 'none'])

// Roles whose name comes from their content (WAI-ARIA "name from content"), so their text is
// the name and is not repeated beneath them.
const nameFromContent = new Set([
  'button',
  'cell',
  'checkbox',
  'columnheader',
  'heading',
  'link',
  'menuitem',
  'option',
  'radio',
  'rowheader',
  'switch',
  'tab',
  'tooltip',
  'treeitem',
])

const states = [
  'aria-current',
  'aria-checked',
  'aria-disabled',
  'aria-expanded',
  'aria-invalid',
  'aria-pressed',
  'aria-selected',
]

const clean = (text: string) => text.replace(/\s+/g, ' ').trim()

/** The visible text of `node`, skipping hidden subtrees. */
function textOf(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
  if (!(node instanceof Element) || isInaccessible(node)) return ''
  return [...node.childNodes].map(textOf).join('')
}

function nameOf(element: Element, role: string) {
  const label = element.getAttribute('aria-label')
  if (label) return clean(label)
  const labelledBy = element.getAttribute('aria-labelledby')
  if (labelledBy)
    return clean(
      labelledBy
        .split(/\s+/)
        .map((id) => element.ownerDocument.getElementById(id))
        .map((target) => (target ? textOf(target) : ''))
        .join(' '),
    )
  if (role === 'img') return clean(element.getAttribute('alt') ?? '')
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    const labels = [...(element.labels ?? [])].map(textOf).join(' ')
    if (labels) return clean(labels)
  }
  return nameFromContent.has(role) ? clean(textOf(element)) : ''
}

function describe(element: Element, role: string) {
  const name = nameOf(element, role)
  const details = [
    ...(role === 'heading' ? [`level=${element.tagName.match(/^H(\d)$/)?.[1] ?? '?'}`] : []),
    ...states.flatMap((state) => {
      const value = element.getAttribute(state)
      return value === null || value === 'false' ? [] : [`${state.slice(5)}=${value}`]
    }),
    ...(element.hasAttribute('disabled') ? ['disabled'] : []),
  ]
  return `${role}${name ? ` "${name}"` : ''}${details.length ? ` [${details.join(', ')}]` : ''}`
}

function walk(element: Element, depth: number, roles: Map<Element, string>, lines: string[]) {
  let text = ''
  const flush = () => {
    if (clean(text)) lines.push(`${'  '.repeat(depth)}- text: ${clean(text)}`)
    text = ''
  }
  for (const child of element.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      text += child.textContent ?? ''
      continue
    }
    if (!(child instanceof Element) || isInaccessible(child)) continue
    const role = roles.get(child)
    if (!role) {
      // Unlabelled wrappers flatten into their parent, each on its own text line.
      flush()
      walk(child, depth, roles, lines)
      continue
    }
    flush()
    lines.push(`${'  '.repeat(depth)}- ${describe(child, role)}`)
    if (nameFromContent.has(role)) walkRolesOnly(child, depth + 1, roles, lines)
    else walk(child, depth + 1, roles, lines)
  }
  flush()
}

/** Inside a name-from-content element, only nested roles are listed; its text is the name. */
function walkRolesOnly(
  element: Element,
  depth: number,
  roles: Map<Element, string>,
  lines: string[],
) {
  for (const child of element.children) {
    if (isInaccessible(child)) continue
    const role = roles.get(child)
    if (!role) {
      walkRolesOnly(child, depth, roles, lines)
      continue
    }
    lines.push(`${'  '.repeat(depth)}- ${describe(child, role)}`)
    walkRolesOnly(child, depth + 1, roles, lines)
  }
}
