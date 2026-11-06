// Synthetic authentication wiring for gateway tests; no real sessions or credentials.
let authenticated = true
exports.setAuthenticated = (value) => {
  authenticated = value
}
exports.requireUser = async () => {
  if (!authenticated) throw new Error('synthetic unauthenticated session')
  return { id: 'google:test' }
}
