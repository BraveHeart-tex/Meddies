import { execFileSync } from 'node:child_process'

// Prints the "Next up" candidates (docs/tickets.md): open `ready-for-agent` issues with no
// open blocker, ordered by the Meddies Project's Priority, then issue number. Uses gh only;
// run `gh auth refresh -s project` if the Project read fails.
const gh = (args) => JSON.parse(execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 << 20 }))
const RANK = { Urgent: 0, High: 1, Medium: 2, Low: 3 }

const { projects } = gh(['project', 'list', '--owner', 'BraveHeart-tex', '--format', 'json'])
const project = projects.find((p) => p.title === 'Meddies')
if (!project) throw new Error('Meddies Project not found for BraveHeart-tex.')
const { items } = gh([
  'project',
  'item-list',
  String(project.number),
  '--owner',
  'BraveHeart-tex',
  '--format',
  'json',
  '--limit',
  '1000',
])
const priority = new Map(items.map((item) => [item.content?.number, item.priority]))

const issues = gh([
  'issue',
  'list',
  '--state',
  'open',
  '--label',
  'ready-for-agent',
  '--limit',
  '500',
  '--json',
  'number,title,url,blockedBy',
])
const candidates = issues
  .filter((issue) => !(issue.blockedBy?.nodes ?? []).some((blocker) => blocker.state === 'OPEN'))
  .map(({ number, title, url }) => ({ number, title, url, priority: priority.get(number) ?? null }))
  .sort((a, b) => (RANK[a.priority] ?? 4) - (RANK[b.priority] ?? 4) || a.number - b.number)
  .slice(0, 10)

console.log(JSON.stringify({ next: candidates[0] ?? null, candidates }, null, 2))
