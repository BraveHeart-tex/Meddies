import { execFileSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

// Prints the top candidates of the Meddies "What's Next" Linear view (docs/tickets.md).
//
// Linearis 2026.8.0 has no view command. Reuse its credential resolver
// (LINEAR_API_TOKEN, encrypted stored token, then legacy token file) rather than
// reading encrypted storage ourselves or passing a token through argv. Credentials
// stay in memory: never print token files, export resolved tokens or enable
// request/header debug logging. `common/auth.js` is internal to Linearis; recheck it
// after CLI upgrades.
//
// The query mirrors the view's live filters and saved priority direction, with
// Linear's priority tie-breaker and unprioritized issues last, returning ten
// candidates and `next` as the first. Grouping, nesting, hidden parents/sub-issues
// or unsupported ordering are rejected rather than guessed; if the view's settings
// change, update this query. Browser-only temporary filters are not visible here.
async function main() {
  let token
  try {
    const cli = realpathSync(execFileSync('which', ['linearis'], { encoding: 'utf8' }).trim())
    const auth = await import(pathToFileURL(path.join(path.dirname(cli), 'common/auth.js')).href)
    token = auth.getApiToken({})
  } catch {
    throw new Error(
      'Cannot resolve Linearis credentials. Check installation and run linearis auth login.',
    )
  }
  if (typeof token !== 'string' || !token.trim()) {
    throw new Error('Linearis returned no credential. Run linearis auth login.')
  }

  async function query(query, variables = {}) {
    let response
    try {
      response = await fetch('https://api.linear.app/graphql', {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(20_000),
        headers: {
          'Content-Type': 'application/json',
          Authorization: token.startsWith('lin_api_') ? token : `Bearer ${token}`,
        },
        body: JSON.stringify({ query, variables }),
      })
    } catch {
      throw new Error('Linear request failed. Check network access.')
    }
    if (!response.ok) throw new Error(`Linear returned HTTP ${response.status}.`)
    let result
    try {
      result = await response.json()
    } catch {
      throw new Error('Linear returned invalid JSON.')
    }
    // Do not print response bodies, request objects or underlying exceptions:
    // only fixed errors and selected issue metadata leave this process.
    if (result.errors?.length || !result.data) {
      throw new Error('Linear GraphQL query failed. Recheck the API schema and view access.')
    }
    return result.data
  }

  const id = 'e5459d3a2a92'
  const { customView: view } = await query(
    `query NextView($id: String!) {
      customView(id: $id) {
        name
        viewPreferencesValues {
          viewOrdering viewOrderingDirection issueGrouping issueSubGrouping
          issueNesting showParents showSubIssues
        }
      }
    }`,
    { id },
  )
  const prefs = view?.viewPreferencesValues
  if (
    !prefs ||
    prefs.viewOrdering !== 'priority' ||
    !['asc', 'desc'].includes(prefs.viewOrderingDirection) ||
    prefs.issueGrouping !== 'none' ||
    prefs.issueSubGrouping !== 'none' ||
    prefs.issueNesting !== 'none' ||
    prefs.showParents !== true ||
    prefs.showSubIssues !== true
  ) {
    throw new Error(
      'View display settings changed. Check the view in Linear before selecting work.',
    )
  }
  const order = prefs.viewOrderingDirection === 'desc' ? 'Descending' : 'Ascending'
  const { customView } = await query(
    `query NextIssues($id: String!, $order: PaginationSortOrder!) {
      customView(id: $id) {
        issues(first: 10, sort: [{priority: {
          order: $order, noPriorityFirst: false, usePrioritySortOrderTiebreaker: true
        }}]) {
          nodes { identifier title url priority state { name } }
          pageInfo { hasNextPage }
        }
      }
    }`,
    { id, order },
  )
  const issues = customView?.issues
  if (!Array.isArray(issues?.nodes)) throw new Error('Linear returned no issue connection.')
  // Extra redaction is defensive; the token is never deliberately serialized.
  const output = JSON.stringify(
    {
      view: view.name,
      next: issues.nodes[0] ?? null,
      candidates: issues.nodes,
      ...issues.pageInfo,
    },
    null,
    2,
  )
  console.log(output.replaceAll(token, '[REDACTED]'))
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
