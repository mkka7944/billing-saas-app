'use client'

import { useBillingStore } from '@/stores/billing-store'
import { useSurveyById, useSurveyPayments } from '@/hooks/use-survey-data'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { X, MapPin, Copy, Camera } from 'lucide-react'

export function HouseDetailSheet() {
  const selectedHouseId = useBillingStore((s) => s.selectedHouseId)
  const selectHouse = useBillingStore((s) => s.selectHouse)
  const setView = useBillingStore((s) => s.setView)

  const { data: survey } = useSurveyById(selectedHouseId)
  const { data: payments } = useSurveyPayments(selectedHouseId)

  if (!survey) return null

  const copyToClipboard = (text: string) => navigator.clipboard.writeText(text)

  const openGoogleMaps = (lat: number, lng: number) => {
    window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank')
  }

  return (
    <div className="absolute inset-0 bg-background z-10 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold truncate">{survey.consumer_name || 'Unknown'}</h2>
          <p className="text-xs text-muted-foreground">{survey.survey_id}</p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => copyToClipboard(survey.survey_id)}>
            <Copy className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => selectHouse(null)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {survey.address && (
            <div className="col-span-2">
              <p className="text-xs text-muted-foreground">Address</p>
              <p className="text-sm">{survey.address}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-muted-foreground">Tehsil</p>
            <p className="text-sm">{survey.tehsil || '-'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">UC</p>
            <p className="text-sm">{survey.uc_name || '-'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Unit Type</p>
            <p className="text-sm">{survey.unit_type || '-'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Category</p>
            <p className="text-sm">{survey.billing_category || '-'}</p>
          </div>
          {survey.monthly_fee > 0 && (
            <div>
              <p className="text-xs text-muted-foreground">Monthly Fee</p>
              <p className="text-sm font-semibold">Rs. {survey.monthly_fee}</p>
            </div>
          )}
          {survey.surveyor_name && (
            <div>
              <p className="text-xs text-muted-foreground">Surveyor</p>
              <p className="text-sm">{survey.surveyor_name}</p>
            </div>
          )}
        </div>

        {survey.lat && survey.lng && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => openGoogleMaps(survey.lat!, survey.lng!)}>
              <MapPin className="h-4 w-4 mr-1" /> Open Maps
            </Button>
            <Button variant="outline" size="sm">
              <Camera className="h-4 w-4 mr-1" /> Capture Photo
            </Button>
          </div>
        )}

        <Separator />

        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Payment History</h3>
          {payments?.length ? (
            <div className="space-y-1">
              {payments.slice(0, 6).map((p: any, i: number) => (
                <div key={`${p.psid}-${p.bill_month || i}`} className="flex items-center justify-between py-1">
                  <div>
                    <p className="text-xs font-medium">{p.bill_month}</p>
                    <p className="text-xs text-muted-foreground">{p.payment_method || '-'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs">Rs. {Number(p.amount_paid || 0).toLocaleString()}</p>
                    <Badge variant={p.payment_status?.toLowerCase() === 'paid' ? 'default' : 'secondary'} className="text-[10px]">
                      {p.payment_status || 'UNPAID'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground py-4 text-center">No payment history</p>
          )}
        </div>
      </div>
    </div>
  )
}
