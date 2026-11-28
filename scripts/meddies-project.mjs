const owner = 'BraveHeart-tex'
export const repo = `${owner}/Meddies`
const projectNumber = 3

function graphql(gh, query, variables) {
  const args = Object.entries(variables).flatMap(([name, value]) => ['-F', `${name}=${value}`])
  return gh('api', 'graphql', '-f', `query=${query}`, ...args).data
}

export function readProject(gh) {
  const { user } = graphql(
    gh,
    `
      query MeddiesProject($owner: String!, $number: Int!) {
        user(login: $owner) {
          projectV2(number: $number) {
            id
            title
            status: field(name: "Status") {
              ... on ProjectV2SingleSelectField {
                id
                options {
                  id
                  name
                }
              }
            }
            priority: field(name: "Priority") {
              ... on ProjectV2SingleSelectField {
                id
                options {
                  id
                  name
                }
              }
            }
          }
        }
      }
    `,
    { owner, number: projectNumber },
  )
  const project = user?.projectV2
  if (project?.title !== 'Meddies') throw new Error(`Meddies Project not found for ${owner}.`)
  return project
}

export function findProjectIssue(gh, project, number) {
  let after
  do {
    const { node } = graphql(
      gh,
      `
        query MeddiesProjectIssue($project: ID!, $filter: String!, $after: String) {
          node(id: $project) {
            ... on ProjectV2 {
              items(
                first: 20
                after: $after
                query: $filter
                archivedStates: [ARCHIVED, NOT_ARCHIVED]
              ) {
                pageInfo {
                  hasNextPage
                  endCursor
                }
                nodes {
                  id
                  content {
                    ... on Issue {
                      number
                      fullDatabaseId
                      repository {
                        nameWithOwner
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `,
      { project: project.id, filter: `#${number}`, ...(after ? { after } : {}) },
    )
    const { nodes, pageInfo } = node.items
    const item = nodes.find(
      ({ content }) => content?.number === number && content.repository.nameWithOwner === repo,
    )
    if (item) return item
    after = pageInfo.hasNextPage ? pageInfo.endCursor : undefined
  } while (after)
}

export function readProjectItem(gh, project, id) {
  const { node } = graphql(
    gh,
    `
      query MeddiesProjectItem($id: ID!) {
        node(id: $id) {
          ... on ProjectV2Item {
            project {
              id
            }
            status: fieldValueByName(name: "Status") {
              ... on ProjectV2ItemFieldSingleSelectValue {
                name
              }
            }
            priority: fieldValueByName(name: "Priority") {
              ... on ProjectV2ItemFieldSingleSelectValue {
                name
              }
            }
          }
        }
      }
    `,
    { id },
  )
  if (node?.project?.id !== project.id) throw new Error('Read-back mismatch: Project item')
  return node
}

export function ensureProjectIssue(gh, project, issue) {
  const existing = findProjectIssue(gh, project, issue.number)
  if (existing) return existing
  try {
    return gh(
      'project',
      'item-add',
      String(projectNumber),
      '--owner',
      owner,
      '--url',
      issue.url,
      '--format',
      'json',
    )
  } catch (error) {
    if (/content already exists in this project/i.test(error.message)) {
      const item = findProjectIssue(gh, project, issue.number)
      if (item) return item
    }
    throw error
  }
}

export function assertRepositoryIssue(issue) {
  if (issue.url !== `https://github.com/${repo}/issues/${issue.number}`)
    throw new Error(`Expected an issue in ${repo}, got ${issue.url}.`)
}
