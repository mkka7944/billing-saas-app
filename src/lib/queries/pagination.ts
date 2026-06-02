import type { PostgrestFilterBuilder } from '@supabase/postgrest-js'

export interface PaginationParams {
  page: number
  pageSize: number
  from: number
  to: number
}

export function parsePagination(request: Request, maxPageSize = 100): PaginationParams {
  const sp = new URL(request.url).searchParams
  const page = Math.max(1, parseInt(sp.get('page') || '1', 10))
  const pageSize = Math.min(maxPageSize, Math.max(1, parseInt(sp.get('pageSize') || '25', 10)))
  return {
    page,
    pageSize,
    from: (page - 1) * pageSize,
    to: (page - 1) * pageSize + pageSize - 1,
  }
}

export function applyPagination<Q extends PostgrestFilterBuilder<any, any, any, unknown, unknown, unknown>>(
  query: Q,
  pagination: PaginationParams
): Q {
  return query.range(pagination.from, pagination.to) as Q
}
