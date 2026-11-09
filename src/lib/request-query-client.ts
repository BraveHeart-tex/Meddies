import 'server-only'
import { cache } from 'react'
import { createQueryClient } from './session-query-client'

/**
 * The Query client for one server request. Sections prefetch into it and dehydrate it for
 * `PrivateQueryHandoff`; React `cache` scopes it to the request, so it is never shared across users.
 */
export const requestQueryClient = cache(createQueryClient)
