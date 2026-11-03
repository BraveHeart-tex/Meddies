import { requireUser } from '@/features/auth/server'

export async function GET() {
  try {
    return Response.json(await requireUser(), { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return Response.json(
      { error: 'Please sign in again.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
