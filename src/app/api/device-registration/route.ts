import { readJsonRequest } from '@/lib/json-request'
import { deviceRegistrations } from '@/features/device-registrations/server'
import { json, failure, mutationGuard } from '@/lib/http'

export const runtime = 'nodejs'

// GET ?installationId= reads; PUT saves, PATCH renews and DELETE removes with a JSON body.
// Every response is `{ registered }` or `{ error }`; the token never leaves the server.
export async function GET(request: Request) {
  try {
    const installationId = new URL(request.url).searchParams.get('installationId')
    return json(await deviceRegistrations.read({ installationId }))
  } catch (error) {
    return failure(error, 'device_registration_request_failure')
  }
}

async function mutate(request: Request, operation: (input: unknown) => Promise<unknown>) {
  const rejected = mutationGuard(request)
  if (rejected) return rejected
  try {
    return json(await operation(await readJsonRequest(request)))
  } catch (error) {
    return failure(error, 'device_registration_request_failure')
  }
}

export async function PUT(request: Request) {
  return mutate(request, deviceRegistrations.save)
}

export async function PATCH(request: Request) {
  return mutate(request, deviceRegistrations.renew)
}

export async function DELETE(request: Request) {
  return mutate(request, deviceRegistrations.remove)
}
