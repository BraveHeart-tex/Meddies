import path from 'node:path'

// Closed neutral surface: adding a helper does not silently grant Worker/contract access.
const neutral = new Set([
  'src/lib/application-error',
  'src/lib/json-request',
  'src/lib/calendar-date',
  'src/features/medicines/contract',
  'src/features/schedules/contract',
  'src/features/schedules/occurrences',
  'src/features/schedules/weekdays',
])

// Narrow, centrally owned exceptions. Never use inline disables for this rule.
const gatewayTest = 'tests/gateway.test'
const authProtocol = 'src/app/api/auth/[...nextauth]/route'
const sessionProbe = 'src/app/api/session/route'

export const architectureExceptions = {
  [gatewayTest]: 'Exercises raw senders with synthetic authentication and transport.',
  'src/features/auth/server': 'Auth.js owns its protocol and signed-session authentication.',
  [authProtocol]: 'Auth.js protocol handler, not a domain operation.',
  [sessionProbe]: 'Session probe calls requireUser directly and preserves its errors.',
  'src/features/schedules/prefetch': 'Server-only composition may import neutral query options.',
}
const serverOwners = new Set([
  'src/lib/medicine-storage',
  'src/features/auth/server',
  'src/features/medicines/server',
  'src/features/schedules/server',
  'src/features/schedules/prefetch',
])
const stem = (value) => value.replace(/\.(?:[cm]?[jt]sx?)$/, '')
const wiring = (value) => /^src\/features\/[^/]+\/server$/.test(value)
const operations = (value) => /^src\/features\/[^/]+\/operations$/.test(value)
const contract = (value) => /^src\/features\/[^/]+\/contract$/.test(value)

const architecture = {
  meta: { type: 'problem', schema: [], messages: { boundary: 'Architecture: {{reason}}' } },
  create(context) {
    const file = stem(path.relative(context.cwd, context.filename).split(path.sep).join('/'))
    const isNeutral = neutral.has(file) || contract(file)
    const isWorker = file.startsWith('worker/')
    const isOperation = operations(file)
    const isBrowser =
      /^(src\/components\/|src\/features\/.*\.tsx$)/.test(
        path.relative(context.cwd, context.filename),
      ) ||
      /^src\/features\/[^/]+\/queries$/.test(file) ||
      file === 'src/lib/session-query-client'
    const report = (node, reason) =>
      context.report({ node, messageId: 'boundary', data: { reason } })
    function dependency(node, source, names = []) {
      if (typeof source !== 'string') {
        if (isNeutral || isOperation || isWorker || file.startsWith('src/'))
          report(node, 'Use literal module specifiers so dependency roles can be checked.')
        return
      }
      const target = source.startsWith('@/')
        ? stem(path.posix.normalize(`src/${source.slice(2)}`))
        : source.startsWith('.')
          ? stem(path.posix.normalize(path.posix.join(path.posix.dirname(file), source)))
          : source
      const local = target.startsWith('src/') || target.startsWith('worker/')
      if (
        ['@tanstack/react-query', '@tanstack/query-core'].includes(target) &&
        names.some((name) => ['HydrationBoundary', 'hydrate', '*'].includes(name)) &&
        !['src/lib/private-query-handoff', 'tests/private-query-handoff.test'].includes(file)
      )
        report(node, 'Private hydration belongs to PrivateQueryHandoff and its focused tests.')

      if (
        /^src\/features\/[^/]+\/queries$/.test(file) &&
        target === 'react' &&
        names.some((name) =>
          [
            '*',
            'useState',
            'useEffect',
            'useLayoutEffect',
            'useReducer',
            'useRef',
            'useSyncExternalStore',
            'useTransition',
            'useOptimistic',
          ].includes(name),
        )
      )
        report(node, 'Server prefetch imports query options; client hooks belong in components.')
      if (
        file.startsWith('src/') &&
        (target.startsWith('worker/') || /^drizzle-orm(?:\/|$)/.test(target))
      )
        report(node, 'Persistence belongs to the private Worker.')
      if ((isNeutral || isOperation) && !neutral.has(target))
        report(
          node,
          'Contracts, neutral rules and injected operations depend only on neutral modules.',
        )
      if (
        isWorker &&
        ((local && !target.startsWith('worker/') && !neutral.has(target)) ||
          (!local && !/^drizzle-orm(?:\/|$)/.test(target)))
      )
        report(node, 'Worker modules depend only on Worker code, Drizzle and neutral modules.')
      if (
        ['worker/http', 'worker/commands'].includes(file) &&
        !['worker/http', 'worker/commands'].includes(target) &&
        !neutral.has(target)
      )
        report(node, 'Worker HTTP and command decoding stay free of persistence.')
      if (
        target === 'src/lib/medicine-storage' &&
        !['src/features/medicines/server', 'src/features/schedules/server', gatewayTest].includes(
          file,
        )
      )
        report(node, 'Only feature server wiring owns the private Worker transport.')
      if (operations(target) && !wiring(file) && !file.startsWith('tests/'))
        report(
          node,
          'Use authenticated feature server entry points, not injected operation factories.',
        )
      if (
        wiring(target) &&
        names.some((name) => ['send', '*'].includes(name)) &&
        file !== gatewayTest
      )
        report(
          node,
          'Raw senders are reserved for focused gateway tests; use authenticated operations.',
        )
      if (
        isBrowser &&
        (wiring(target) ||
          operations(target) ||
          ['server-only', 'src/lib/http', 'src/lib/medicine-storage'].includes(target))
      )
        report(node, 'Browser modules reach data through API routes only.')
      if (
        target === 'src/features/auth/server' &&
        file.startsWith('src/app/api/') &&
        ![authProtocol, sessionProbe].includes(file)
      )
        report(node, 'Domain API routes authenticate through feature operations.')
      if (target === 'src/lib/http' && file.startsWith('src/') && !file.startsWith('src/app/'))
        report(node, 'Shared HTTP policy belongs to route adapters only.')
      if (
        file.startsWith('src/app/api/') &&
        !local &&
        !['next/server', 'next/headers', 'server-only'].includes(target)
      )
        report(node, 'External integrations belong to feature server wiring, not API routes.')
      if (
        file.startsWith('src/app/api/') &&
        file !== authProtocol &&
        local &&
        !wiring(target) &&
        !['src/lib/http', 'src/lib/json-request'].includes(target)
      )
        report(node, 'API routes adapt shared HTTP policy to authenticated feature entry points.')
    }
    return {
      Program(node) {
        if (
          (serverOwners.has(file) || wiring(file)) &&
          !node.body.some(
            (statement) =>
              statement.type === 'ImportDeclaration' && statement.source.value === 'server-only',
          )
        )
          report(node, 'Server wiring and prefetch composition must import server-only.')
      },
      ImportDeclaration(node) {
        dependency(
          node,
          node.source.value,
          node.specifiers.map((s) =>
            ['ImportNamespaceSpecifier', 'ImportDefaultSpecifier'].includes(s.type)
              ? '*'
              : (s.imported?.name ?? s.imported?.value),
          ),
        )
      },
      ExportNamedDeclaration(node) {
        if (node.source)
          dependency(
            node,
            node.source.value,
            node.specifiers.map((s) => s.local?.name ?? s.local?.value),
          )
      },
      ExportAllDeclaration(node) {
        dependency(node, node.source.value, ['*'])
      },
      ImportExpression(node) {
        dependency(node, node.source.value, ['*'])
      },
      TSImportEqualsDeclaration(node) {
        if (node.moduleReference.type === 'TSExternalModuleReference')
          dependency(node, node.moduleReference.expression.value, ['*'])
      },
      CallExpression(node) {
        if (node.callee.name === 'require') dependency(node, node.arguments[0]?.value, ['*'])
      },
      MemberExpression(node) {
        if (
          (isNeutral || isOperation) &&
          ['process', 'global', 'globalThis'].includes(node.object.name) &&
          ['env', 'process'].includes(node.property.name ?? node.property.value)
        )
          report(
            node,
            'Neutral modules and injected operations do not read environment configuration.',
          )
      },
    }
  },
}

export default architecture
