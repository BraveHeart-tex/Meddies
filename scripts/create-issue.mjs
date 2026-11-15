import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

// Creates or resumes one issue under docs/tickets.md. All local inputs and Project
// metadata are validated before writes. Resume reconciles the same expected specification;
// it refuses different content rather than turning this into a generic editing command.
const repo = 'BraveHeart-tex/Meddies'
const owner = 'BraveHeart-tex'
const states = ['needs-triage', 'needs-info', 'ready-for-agent', 'ready-for-human', 'wontfix']
const priorities = ['Urgent', 'High', 'Medium', 'Low']
function run(...args) {
  try {
    return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (error) {
    throw new Error(
      `gh ${args.slice(0, 2).join(' ')}: ${String(error.stderr || error.message).trim()}. Check access; for Project scope run gh auth refresh -s project.`,
    )
  }
}
const json = (...args) => JSON.parse(run(...args))
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort())
let issue
let unfinished = [
  'validate inputs',
  'resolve Project',
  'create issue',
  'relationships',
  'Project fields',
  'verify',
]
try {
  const options = {}
  const flags = ['parent-ticket', 'approved-breakdown']
  const values = [
    'title',
    'body-file',
    'category',
    'areas',
    'triage-state',
    'priority',
    'parent',
    'blocked-by',
    'resume',
  ]
  const args = process.argv.slice(2)
  for (let i = 0; i < args.length; i++) {
    const name = args[i].replace(/^--/, '')
    if (
      !args[i].startsWith('--') ||
      !(flags.includes(name) || values.includes(name)) ||
      name in options
    )
      throw new Error(`Unknown or duplicate option: ${args[i]}`)
    options[name] = flags.includes(name) ? true : args[++i]
    if (options[name] === undefined || String(options[name]).startsWith('--'))
      throw new Error(`Missing value for --${name}`)
  }
  for (const name of ['title', 'body-file', 'category', 'areas']) {
    if (!options[name]?.trim()) throw new Error(`Required: --${name}`)
  }
  if (!['bug', 'enhancement'].includes(options.category))
    throw new Error('Category must be bug or enhancement')
  const areas = options.areas.split(',')
  if (
    !areas.length ||
    new Set(areas).size !== areas.length ||
    areas.some((a) => !['backend', 'frontend'].includes(a))
  )
    throw new Error('Areas must be backend, frontend or backend,frontend')
  const state = options['triage-state'] ?? 'needs-triage'
  if (!states.includes(state)) throw new Error('Invalid triage state')
  if (state === 'ready-for-agent' && !options['approved-breakdown'])
    throw new Error('ready-for-agent requires --approved-breakdown')
  if (
    options['parent-ticket']
      ? options.priority !== undefined
      : !priorities.includes(options.priority)
  )
    throw new Error('Supply --priority Urgent|High|Medium|Low, or --parent-ticket without Priority')
  const number = (value) => {
    if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)))
      throw new Error(`Invalid issue number: ${value}`)
    return Number(value)
  }
  const parent = options.parent !== undefined ? number(options.parent) : null
  const blockers =
    options['blocked-by'] !== undefined ? options['blocked-by'].split(',').map(number) : []
  if (new Set(blockers).size !== blockers.length) throw new Error('Duplicate blockers')
  const resume = options.resume !== undefined ? number(options.resume) : null
  if (resume && (parent === resume || blockers.includes(resume)))
    throw new Error('An issue cannot be its own relationship')
  const body = readFileSync(options['body-file'], 'utf8')
  const labels = [options.category, ...areas, state]
  if (resume) issue = { number: resume, url: `https://github.com/${repo}/issues/${resume}` }
  unfinished.shift()
  const project = json(
    'project',
    'list',
    '--owner',
    owner,
    '--format',
    'json',
    '--limit',
    '1000',
  ).projects.find((p) => p.title === 'Meddies')
  if (!project) throw new Error('Meddies Project not found')
  const fields = json(
    'project',
    'field-list',
    String(project.number),
    '--owner',
    owner,
    '--format',
    'json',
    '--limit',
    '1000',
  ).fields
  const selections = [
    ['Status', 'Backlog'],
    ['Priority', options.priority],
  ]
    .filter(([, value]) => value)
    .map(([name, value]) => {
      const field = fields.find((f) => f.name === name)
      const option = field?.options?.find((o) => o.name === value)
      if (!option) throw new Error(`Missing Project option ${name}: ${value}`)
      return { name, value, field: field.id, option: option.id }
    })
  const view = (ref) =>
    json(
      'issue',
      'view',
      String(ref),
      '--repo',
      repo,
      '--json',
      'number,url,title,body,labels,parent,blockedBy',
    )
  // Resolve relationship targets before creation, including private/deleted/invalid references.
  const targets = new Map(
    [...(parent ? [parent] : []), ...blockers].map((n) => [
      n,
      json('api', `repos/${repo}/issues/${n}`),
    ]),
  )
  for (const target of targets.values())
    if (target.pull_request)
      throw new Error('Relationships must reference issues, not pull requests')
  unfinished.shift()
  const verifyContent = (saved) => {
    if (
      saved.title !== options.title ||
      saved.body !== body ||
      !same(
        saved.labels.map((l) => l.name),
        labels,
      )
    )
      throw new Error(
        'Read-back mismatch: title, body or labels; resume requires the original inputs',
      )
  }
  if (resume) {
    issue = view(resume)
    verifyContent(issue)
  } else {
    const url = run(
      'issue',
      'create',
      '--repo',
      repo,
      '--title',
      options.title,
      '--body-file',
      options['body-file'],
      ...labels.flatMap((l) => ['--label', l]),
    ).trim()
    // Retain the URL before any subsequent read can fail.
    issue = { url, number: number(url.split('/').at(-1)) }
  }
  unfinished.shift()
  let saved = view(issue.number)
  verifyContent(saved)
  if (saved.parent && saved.parent.number !== parent)
    throw new Error('Read-back mismatch: unexpected parent')
  if ((saved.blockedBy?.nodes ?? []).some((b) => !blockers.includes(b.number)))
    throw new Error('Read-back mismatch: unexpected blockers')
  if (parent && !saved.parent)
    run(
      'api',
      '--method',
      'POST',
      `repos/${repo}/issues/${parent}/sub_issues`,
      '-F',
      `sub_issue_id=${json('api', `repos/${repo}/issues/${issue.number}`).id}`,
    )
  for (const blocker of blockers) {
    if (!(saved.blockedBy?.nodes ?? []).some((b) => b.number === blocker))
      run(
        'api',
        '--method',
        'POST',
        `repos/${repo}/issues/${issue.number}/dependencies/blocked_by`,
        '-F',
        `issue_id=${targets.get(blocker).id}`,
      )
  }
  unfinished.shift()
  const item = json(
    'project',
    'item-add',
    String(project.number),
    '--owner',
    owner,
    '--url',
    issue.url,
    '--format',
    'json',
  )
  for (const selection of selections)
    run(
      'project',
      'item-edit',
      '--id',
      item.id,
      '--project-id',
      project.id,
      '--field-id',
      selection.field,
      '--single-select-option-id',
      selection.option,
    )
  unfinished.shift()
  saved = view(issue.number)
  verifyContent(saved)
  if (
    (saved.parent?.number ?? null) !== parent ||
    !same(
      (saved.blockedBy?.nodes ?? []).map((b) => b.number),
      blockers,
    )
  )
    throw new Error('Read-back mismatch: relationships')
  // Query the exact item, avoiding truncated Project item lists.
  const result = json(
    'api',
    'graphql',
    '-f',
    `query=query($id:ID!){node(id:$id){... on ProjectV2Item{fieldValues(first:100){nodes{... on ProjectV2ItemFieldSingleSelectValue{name field{... on ProjectV2SingleSelectField{name}}}}}}}}`,
    '-f',
    `id=${item.id}`,
  )
  const actual = result.data.node.fieldValues.nodes
  for (const { name, value } of selections)
    if (!actual.some((f) => f.field?.name === name && f.name === value))
      throw new Error(`Read-back mismatch: Project ${name}`)
  if (options['parent-ticket'] && actual.some((f) => f.field?.name === 'Priority' && f.name))
    throw new Error('Read-back mismatch: parent ticket has Priority')
  unfinished.shift()
  console.log(
    JSON.stringify({
      number: issue.number,
      url: issue.url,
      status: 'Backlog',
      ...(options.priority ? { priority: options.priority } : {}),
      labels,
      relationships: { verified: true, parent, blockedBy: blockers },
    }),
  )
} catch (error) {
  console.error(
    JSON.stringify({
      error: error.message,
      ...(issue
        ? { url: issue.url, resume: `Rerun with original inputs and --resume ${issue.number}` }
        : {}),
      unfinished,
    }),
  )
  process.exitCode = 1
}
