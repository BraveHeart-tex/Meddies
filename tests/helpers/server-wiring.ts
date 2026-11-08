// Synthetic authentication wiring for gateway tests; no real sessions or credentials.
let authenticated = true
export const setAuthenticated = (value: boolean) => {
  authenticated = value
}
export const requireUser = async () => {
  if (!authenticated) throw new Error('synthetic unauthenticated session')
  return { id: 'google:test' }
}
