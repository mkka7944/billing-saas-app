'use client'

import { useEffect } from 'react'
import { CircleMarker, Popup, useMap } from 'react-leaflet'
import { useBillingStore } from '@/stores/billing-store'

export default function SearchResultMarker() {
  const searchResult = useBillingStore((s) => s.searchResult)
  const map = useMap()

  useEffect(() => {
    if (searchResult?.lat != null && searchResult?.lng != null) {
      map.flyTo([searchResult.lat, searchResult.lng], 20, { duration: 0.5 })
    }
  }, [searchResult, map])

  if (!searchResult?.lat || !searchResult?.lng || !searchResult?.psid) return null

  return (
    <CircleMarker
      center={[searchResult.lat, searchResult.lng]}
      radius={10}
      pathOptions={{
        color: '#3b82f6',
        fillColor: '#3b82f6',
        fillOpacity: 0.4,
        weight: 3,
      }}
    >
      <Popup>
        <div className="text-xs space-y-0.5">
          <p className="font-semibold">{searchResult.consumer_name || 'Unknown'}</p>
          {searchResult.psid && <p className="font-mono text-[10px]">PSID: {searchResult.psid}</p>}
          {searchResult.survey_id && <p className="font-mono text-[10px]">SID: {searchResult.survey_id}</p>}
        </div>
      </Popup>
    </CircleMarker>
  )
}
