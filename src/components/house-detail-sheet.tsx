'use client'

import { useState } from 'react'
import { useBillingStore } from '@/stores/billing-store'
import { useSurveyById, useSurveyPayments } from '@/hooks/use-survey-data'
import { useDeliveryPhotos } from '@/hooks/use-delivery-photos'
import { Badge } from '@/components/ui/badge'
import { shortenMCName } from '@/lib/mc-utils'
import { cn } from '@/lib/utils'
import { X, MapPin, Copy, Camera, ChevronLeft, ChevronRight, Image, ExternalLink } from 'lucide-react'

export function HouseDetailSheet() {
  const selectedHouseId = useBillingStore((s) => s.selectedHouseId)
  const selectHouse = useBillingStore((s) => s.selectHouse)
  const setMapCenter = useBillingStore((s) => s.setMapCenter)
  const setMapZoom = useBillingStore((s) => s.setMapZoom)

  const { data: survey } = useSurveyById(selectedHouseId)
  const { data: billData } = useSurveyPayments(selectedHouseId)
  const { data: deliveryPhotos = [] } = useDeliveryPhotos(survey?.psid || null)

  const [imgIdx, setImgIdx] = useState(0)

  if (!survey) return null

  const bill = billData?.bill
  const payments = billData?.payments

  const allImages = [...deliveryPhotos.map((p) => p.photo_url), ...(survey.image_urls?.filter(Boolean) || [])]
  const currentImage = allImages[imgIdx] || null

  const openOnMap = (lat: number, lng: number) => {
    setMapCenter([lat, lng])
    setMapZoom(18)
    selectHouse(null)
  }

  const isPaid = bill?.payment_status?.toLowerCase() === 'paid'

  return (
    <div className="absolute inset-0 bg-background z-10 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b shrink-0 min-h-[44px]">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={() => selectHouse(null)} className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-muted cursor-pointer shrink-0" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <p className="text-xs font-bold truncate">{survey.consumer_name || 'Unknown'}</p>
            <p className="text-[10px] font-mono text-muted-foreground">#{survey.survey_id}</p>
          </div>
        </div>
        <button onClick={() => navigator.clipboard.writeText(survey.survey_id)} className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-muted cursor-pointer shrink-0" title="Copy ID">
          <Copy className="h-4 w-4" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Image gallery */}
        {allImages.length > 0 ? (
          <div className="relative bg-muted">
            <img src={currentImage!} alt="" className="w-full h-44 object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
            {allImages.length > 1 && (
              <>
                {imgIdx > 0 && (
                  <button onClick={() => setImgIdx(imgIdx - 1)} className="absolute left-2 top-1/2 -translate-y-1/2 h-9 w-9 flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 cursor-pointer">
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                )}
                {imgIdx < allImages.length - 1 && (
                  <button onClick={() => setImgIdx(imgIdx + 1)} className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 cursor-pointer">
                    <ChevronRight className="h-5 w-5" />
                  </button>
                )}
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
                  {allImages.map((_, i) => (
                    <button key={i} onClick={() => setImgIdx(i)} className={cn('h-1.5 rounded-full transition-all cursor-pointer', i === imgIdx ? 'w-4 bg-white' : 'w-1.5 bg-white/50')} />
                  ))}
                </div>
              </>
            )}
            {deliveryPhotos.length > 0 && (
              <div className="absolute top-2 right-2 bg-black/50 text-white text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1">
                <Camera className="h-3 w-3" /> {deliveryPhotos.length}
              </div>
            )}
          </div>
        ) : (
          <div className="bg-muted h-24 flex items-center justify-center">
            <Camera className="h-6 w-6 text-muted-foreground/40" />
          </div>
        )}

        {/* Delivery photos gallery strip */}
        {deliveryPhotos.length > 0 && (
          <div className="px-3 pt-2">
            <p className="text-[10px] font-semibold text-muted-foreground mb-1 flex items-center gap-1">
              <Image className="h-3 w-3" /> Delivery photos
            </p>
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {deliveryPhotos.map((p) => (
                <a
                  key={p.id}
                  href={p.photo_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 w-14 h-14 rounded-lg overflow-hidden bg-muted border border-border hover:opacity-80 transition-opacity"
                >
                  <img src={p.photo_url} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* House info */}
        <div className="px-3 pt-3 pb-2">
          <h1 className="text-base font-bold leading-tight">{survey.consumer_name || 'Unknown'}</h1>
          {survey.address && <p className="text-xs text-muted-foreground mt-0.5">{survey.address}</p>}
        </div>

        {/* Info chips */}
        <div className="flex items-center gap-2 px-3 pb-3 flex-wrap">
          {survey.uc_name && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
              {shortenMCName(survey.uc_name)}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground">{survey.billing_category || '-'}</span>
          {survey.monthly_fee > 0 && <span className="text-[10px] font-bold">Rs.{survey.monthly_fee}/mo</span>}
          {survey.tehsil && <span className="text-[10px] text-muted-foreground">{survey.tehsil}</span>}
          {survey.psid && <span className="text-[10px] font-mono text-muted-foreground">PSID: {survey.psid}</span>}
        </div>

        {/* Bill + payments */}
        <div className="p-3 space-y-2.5">
          {bill && (
            <div className="rounded-lg border border-border bg-muted/30 p-2.5">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold uppercase text-muted-foreground">{bill.bill_month || 'Current'} Bill</span>
                <Badge variant={isPaid ? 'default' : 'secondary'} className="text-[10px]">{bill.payment_status || 'UNPAID'}</Badge>
              </div>
              <div className="text-xs space-y-0.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount Due</span>
                  <span className="font-bold">Rs.{Number(bill.amount_due || 0).toLocaleString()}</span>
                </div>
                {Number(bill.amount_paid || 0) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Amount Paid</span>
                    <span className="font-bold text-green-600">Rs.{Number(bill.amount_paid).toLocaleString()}</span>
                  </div>
                )}
                {Number(bill.arrears || 0) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Arrears</span>
                    <span className="font-bold text-destructive">Rs.{Number(bill.arrears).toLocaleString()}</span>
                  </div>
                )}
                {Number(bill.fine || 0) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Fine</span>
                    <span className="font-bold text-destructive">Rs.{Number(bill.fine).toLocaleString()}</span>
                  </div>
                )}
                {Number(bill.total_payable || 0) > 0 && (
                  <div className="flex justify-between pt-1 border-t border-border mt-1">
                    <span className="text-muted-foreground font-semibold">Total Payable</span>
                    <span className="font-bold">Rs.{Number(bill.total_payable).toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Payment history */}
          <div>
            <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Payment History</p>
            {payments?.length ? (
              <div className="space-y-0.5">
                {payments.slice(0, 5).map((p: any, i: number) => (
                  <div key={`${p.psid}-${p.bill_month || i}`} className="flex items-center justify-between py-0.5">
                    <span className="text-xs font-mono">{p.bill_month}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold">Rs.{Number(p.amount_paid || 0).toLocaleString()}</span>
                      <Badge variant={p.payment_status?.toLowerCase() === 'paid' ? 'default' : 'secondary'} className="text-[9px]">{p.payment_status || '—'}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground py-2 text-center">No payment history</p>
            )}
          </div>
        </div>
      </div>

      {/* Fixed bottom bar */}
      {survey.lat && survey.lng && (
        <div className="border-t border-border p-2 shrink-0">
          <div className="flex gap-2">
            <button
              onClick={() => openOnMap(survey.lat!, survey.lng!)}
              className="flex-1 h-10 text-xs font-bold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <MapPin className="h-4 w-4" />
              Show on Map
            </button>
            {deliveryPhotos.length > 0 && (
              <a
                href={deliveryPhotos[0].photo_url}
                target="_blank"
                rel="noopener noreferrer"
                className="h-10 px-4 text-xs font-bold rounded-lg border border-border hover:bg-muted flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <ExternalLink className="h-4 w-4" />
                {deliveryPhotos.length}
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
