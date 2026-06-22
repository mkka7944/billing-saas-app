import type { QueryClient } from '@tanstack/react-query'

export function refreshCurrentPage(pathname: string | null, queryClient: QueryClient) {
  const path = pathname || ''

  if (path.startsWith('/deliver')) {
    queryClient.invalidateQueries({ queryKey: ['staff-assignment'] })
    queryClient.invalidateQueries({ queryKey: ['assignment-totals'] })
    queryClient.invalidateQueries({ queryKey: ['staff-stats'] })
    queryClient.invalidateQueries({ queryKey: ['delivery-photos'] })
  } else if (path.startsWith('/map')) {
    queryClient.invalidateQueries({ queryKey: ['surveys'] })
    queryClient.invalidateQueries({ queryKey: ['staff-assignment'] })
    queryClient.invalidateQueries({ queryKey: ['billing-charts'] })
    queryClient.invalidateQueries({ queryKey: ['data-insight'] })
    queryClient.invalidateQueries({ queryKey: ['delivery-trail'] })
    queryClient.invalidateQueries({ queryKey: ['survey'] })
    queryClient.invalidateQueries({ queryKey: ['survey-payments'] })
    queryClient.invalidateQueries({ queryKey: ['flagged-psids'] })
  } else if (path.startsWith('/assignments')) {
    queryClient.invalidateQueries({ queryKey: ['assignment-list'] })
    queryClient.invalidateQueries({ queryKey: ['assignment-totals'] })
    queryClient.invalidateQueries({ queryKey: ['uc-stats'] })
    queryClient.invalidateQueries({ queryKey: ['unassigned-bills'] })
    queryClient.invalidateQueries({ queryKey: ['route-units'] })
    queryClient.invalidateQueries({ queryKey: ['route-tree'] })
    queryClient.invalidateQueries({ queryKey: ['staff-list'] })
    queryClient.invalidateQueries({ queryKey: ['staff-stats'] })
  } else {
    queryClient.invalidateQueries()
  }
}
