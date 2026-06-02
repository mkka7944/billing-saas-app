'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useBillingStore } from '@/stores/billing-store'
import { useAuthStore } from '@/stores/auth-store'
import { useSurveyById, useSurveyPayments, useSurveyBillInfo } from '@/hooks/use-survey-data'
import { useDeliveryPhotos } from '@/hooks/use-delivery-photos'
import { shortenMCName } from '@/lib/mc-utils'
import { currentMonth } from '@/lib/constants'
import { PaymentHistoryCard } from '@/components/payment-history-card'
import { cn } from '@/lib/utils'
import { X, MapPin, Copy, Camera, ChevronLeft, ChevronRight, Image, ChevronsLeft, ChevronsRight, Flag, ChevronDown, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Lightbox from 'yet-another-react-lightbox'
import 'yet-another-react-lightbox/styles.css'
import Counter from 'yet-another-react-lightbox/plugins/counter'
import 'yet-another-react-lightbox/plugins/counter.css'
import Zoom from 'yet-another-react-lightbox/plugins/zoom'
import Fullscreen from 'yet-another-react-lightbox/plugins/fullscreen'

export function HouseDetailSheet() {
  const selectedHouseId = useBillingStore((s) => s.selectedHouseId)
  const selectHouse = useBillingStore((s) => s.selectHouse)
  const setMapCenter = useBillingStore((s) => s.setMapCenter)
  const setMapZoom = useBillingStore((s) => s.setMapZoom)
  const houseList = useBillingStore((s) => s.houseList)
  const houseListIndex = useBillingStore((s) => s.houseListIndex)
  const houseListTotal = useBillingStore((s) => s.houseListTotal)
  const nextHouse = useBillingStore((s) => s.nextHouse)
  const prevHouse = useBillingStore((s) => s.prevHouse)
  const firstHouse = useBillingStore((s) => s.firstHouse)
  const lastHouse = useBillingStore((s) => s.lastHouse)

  const { data: survey } = useSurveyById(selectedHouseId)
  const { data: billData } = useSurveyPayments(selectedHouseId)
  const { data: billInfo } = useSurveyBillInfo(selectedHouseId)
  const { data: deliveryPhotos = [] } = useDeliveryPhotos(survey?.psid || null)

  const [imgIdx, setImgIdx] = useState(0)
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [flagging, setFlagging] = useState(false)
  const [flagDone, setFlagDone] = useState(false)
  const roleName = useAuthStore((s) => s.roleName)

  useEffect(() => { setImgIdx(0); setGalleryOpen(false) }, [selectedHouseId])

  // Fetch flagged status for this survey/psid
  const [flaggedSummary, setFlaggedSummary] = useState<{ action: string; label: string; icon: string; plus_count: number } | null>(null)
  const [flaggedEntries, setFlaggedEntries] = useState<{ psid: string; reason: string; notes: string | null }[]>([])
  const [showOtherPsids, setShowOtherPsids] = useState(false)
  useEffect(() => {
    if (!survey?.survey_id && !survey?.psid) return
    const surveyId = survey.survey_id
    const psid = survey.psid
    const params = new URLSearchParams()
    if (surveyId) params.set('survey_id', surveyId)
    if (psid) params.set('psid', psid)
    fetch(`/api/flagged-psids?${params}`)
      .then(r => r.json())
      .then(d => {
        setFlaggedSummary(d.summary || null)
        setFlaggedEntries(d.entries || [])
      })
      .catch(() => { setFlaggedSummary(null); setFlaggedEntries([]) })
  }, [survey?.survey_id, survey?.psid])

  // Compute before effects so allImages is accessible
  const surveyImages = (survey?.image_urls)?.filter(Boolean) || []
  const deliveryPhotoUrls = (deliveryPhotos || []).map((p) => p.photo_url)
  const allImages = [...surveyImages, ...deliveryPhotoUrls]

  const openGallery = (idx: number) => {
    setImgIdx(idx)
    setGalleryOpen(true)
  }

  // Touch swipe between records
  const touchStartX = useRef(0)
  const touchStartY = useRef(0)
  const contentRef = useRef<HTMLDivElement>(null)

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }, [])

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current
    const dy = e.changedTouches[0].clientY - touchStartY.current
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) nextHouse()
      else prevHouse()
    }
  }, [nextHouse, prevHouse])

  // Keyboard: record navigation (gallery closed)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') prevHouse()
      else if (e.key === 'ArrowRight') nextHouse()
    }
    if (galleryOpen) return
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [prevHouse, nextHouse, galleryOpen])

  if (!survey) return null

  const payments = billData?.payments
  const currentImage = allImages[imgIdx] || null
  const slides = allImages.map((src) => ({ src }))

  const hasNext = houseListIndex < houseList.length - 1
  const hasPrev = houseListIndex > 0
  const canNav = houseList.length > 1

  const openOnMap = () => {
    if (survey.lat && survey.lng) {
      setMapCenter([survey.lat, survey.lng])
      setMapZoom(18)
    }
    selectHouse(null)
  }

  const infoValues: string[] = [
    ...(survey.uc_name ? [shortenMCName(survey.uc_name)] : []),
    ...(survey.tehsil ? [survey.tehsil] : []),
    ...(survey.surveyor_name ? [survey.surveyor_name] : []),
    ...(survey.survey_date ? [new Date(survey.survey_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })] : []),
    ...(survey.survey_time ? [survey.survey_time] : []),
    ...(survey.billing_category ? [survey.billing_category] : []),
    ...(survey.monthly_fee > 0 ? [`Rs.${survey.monthly_fee}/mo`] : []),
    ...(survey.route_name ? [survey.route_name] : []),
  ]

  return (
    <div
      className="absolute inset-0 bg-background z-10 flex flex-col"
      onTouchStart={canNav && !galleryOpen ? handleTouchStart : undefined}
      onTouchEnd={canNav && !galleryOpen ? handleTouchEnd : undefined}
    >
      {/* Toolbar — Close, Survey ID, Map */}
      <div className="flex items-center gap-2 px-3 py-2 border-b shrink-0 min-h-[52px]">
        <button onClick={() => selectHouse(null)} className="h-11 w-11 flex items-center justify-center rounded-lg border border-border bg-background hover:bg-muted cursor-pointer shrink-0" aria-label="Close">
          <X className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1 flex items-center gap-2">
          <p className="text-sm font-mono font-bold truncate">{survey.survey_id}</p>
          {survey.status === 'ARCHIVED' && (
            <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-900 rounded px-1.5 py-0.5 shrink-0">ARCHIVED</span>
          )}
        </div>
        {survey.lat && survey.lng && (
          <button onClick={openOnMap} className="h-11 w-11 flex items-center justify-center rounded-lg border border-border bg-background hover:bg-muted cursor-pointer shrink-0" aria-label="Show on map">
            <MapPin className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Scrollable content */}
      <div ref={contentRef} className="flex-1 overflow-y-auto">
        {/* Hero Image Gallery */}
        <div className="relative bg-muted">
          {allImages.length > 0 ? (
            <>
              <button
                onClick={() => openGallery(imgIdx)}
                className="w-full h-52 cursor-pointer text-left"
                aria-label="Open gallery"
              >
                <img
                  src={currentImage!}
                  alt=""
                  className="w-full h-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              </button>
              {allImages.length > 1 && (
                <>
                  {imgIdx > 0 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setImgIdx(imgIdx - 1) }}
                      className="absolute left-2 top-1/2 -translate-y-1/2 h-10 w-10 flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 cursor-pointer transition-colors"
                      aria-label="Previous image"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                  )}
                  {imgIdx < allImages.length - 1 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setImgIdx(imgIdx + 1) }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 cursor-pointer transition-colors"
                      aria-label="Next image"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  )}
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
                    {allImages.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setImgIdx(i)}
                        className={cn(
                          'h-2 rounded-full transition-all cursor-pointer',
                          i === imgIdx ? 'w-5 bg-white' : 'w-2 bg-white/50'
                        )}
                      />
                    ))}
                  </div>
                  <div className="absolute top-2 left-2 bg-black/50 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {imgIdx + 1} / {allImages.length}
                  </div>
                </>
              )}
              {deliveryPhotos.length > 0 && (
                <div className="absolute top-2 right-2 bg-black/50 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Camera className="h-3 w-3" /> {deliveryPhotos.length}
                </div>
              )}
              <div className="absolute bottom-2 left-2 bg-black/50 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
                {survey.status || 'UNKNOWN'}
              </div>
            </>
          ) : (
            <div className="h-52 flex items-center justify-center bg-muted">
              <Camera className="h-8 w-8 text-muted-foreground/30" />
            </div>
          )}
        </div>

        {/* Identity — 2-column with divider */}
        <div className="px-4 pt-4 pb-3 border-b border-border">
          <div className="grid grid-cols-2 gap-4">
            <div className="border-r border-border pr-4">
              <h1 className="text-lg font-bold leading-tight">{survey.consumer_name || 'Unknown'}</h1>
              {survey.address && (
                <p className="text-xs text-muted-foreground mt-1">{survey.address}</p>
              )}
              {survey.psid && (
                <div className="flex items-center gap-1.5 mt-2">
                  <span className="text-xs font-mono font-bold text-blue-500 dark:text-blue-300">{survey.psid}</span>
                  <button
                    onClick={() => navigator.clipboard.writeText(survey.psid!)}
                    className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted cursor-pointer"
                    title="Copy PSID"
                  >
                    <Copy className="h-3 w-3 text-muted-foreground" />
                  </button>
                </div>
              )}

              {/* Status indication for flagged/archived */}
              {flaggedSummary && (() => {
                const isStop = flaggedSummary.action === 'DO_NOT_DELIVER'
                const isCheck = flaggedSummary.action === 'DELIVER'
                return (
                  <div className={cn(
                    'mt-2 px-2 py-1.5 rounded border-l-3 text-xs',
                    isStop && 'border-l-red-500 bg-red-50 dark:bg-red-950/20',
                    isCheck && 'border-l-green-500 bg-green-50 dark:bg-green-950/20',
                    !isStop && !isCheck && 'border-l-amber-500 bg-amber-50 dark:bg-amber-950/20',
                  )}>
                    <div className="flex items-center gap-1.5">
                      <Flag className={cn(
                        'h-3 w-3 shrink-0',
                        isStop && 'text-red-600 dark:text-red-400',
                        isCheck && 'text-green-600 dark:text-green-400',
                        !isStop && !isCheck && 'text-amber-600 dark:text-amber-400',
                      )} />
                      <span className={cn(
                        'font-bold text-[11px]',
                        isStop && 'text-red-700 dark:text-red-300',
                        isCheck && 'text-green-700 dark:text-green-300',
                        !isStop && !isCheck && 'text-amber-700 dark:text-amber-300',
                      )}>{flaggedSummary.label}</span>
                      {flaggedSummary.plus_count > 1 && (
                        <span className={cn(
                          'text-[10px]',
                          isStop && 'text-red-600/70',
                          isCheck && 'text-green-600/70',
                        )}>+{flaggedSummary.plus_count - 1}</span>
                      )}
                    </div>
                    {/* Surplus PSIDs collapsible */}
                    {flaggedSummary.plus_count > 1 && (
                      <>
                        <button
                          onClick={() => setShowOtherPsids(!showOtherPsids)}
                          className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground hover:text-foreground cursor-pointer"
                        >
                          <ChevronDown className={cn('h-3 w-3 transition-transform', showOtherPsids && 'rotate-180')} />
                          {flaggedSummary.plus_count - 1} other PSID{(flaggedSummary.plus_count - 1) > 1 ? 's' : ''}
                        </button>
                        {showOtherPsids && (
                          <div className="mt-1 space-y-0.5">
                            {flaggedEntries.filter(e => e.psid !== survey.psid).map((entry, i) => (
                              <div key={i} className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
                                <span className="truncate max-w-[100px]">{entry.psid}</span>
                                <span className="shrink-0 text-[9px] italic">
                                  {entry.reason === 'psid_duplicate_orphan' ? '— never paid' :
                                   entry.reason === 'psid_duplicate_superseded' ? '— superseded' :
                                   entry.notes ? entry.notes : ''}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )
              })()}

              {survey.status === 'ARCHIVED' && !flaggedSummary && (
                <div className="mt-2 px-2 py-1.5 rounded border-l-3 border-l-gray-400 bg-gray-50 dark:bg-gray-900/20 text-xs">
                  <div className="flex items-center gap-1.5">
                    <Flag className="h-3 w-3 text-gray-500 shrink-0" />
                    <span className="font-bold text-[11px] text-gray-600 dark:text-gray-400">Archived — removed from portal</span>
                  </div>
                </div>
              )}

              {survey.monthly_fee > 0 && (
                <div className="flex items-center gap-1.5 mt-1.5">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-600 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/30 rounded px-1.5 py-0.5 shrink-0">
                    Current Bill
                  </span>
                  <span className="text-xs font-bold">Rs.{((survey.monthly_fee ?? 0) + (survey.arrears ?? 0)).toLocaleString()}</span>
                </div>
              )}
            </div>
            <div className="pl-1">
              <PaymentHistoryCard payments={payments || []} allMonths={billData?.allMonths} currentMonthTag={currentMonth()} />
            </div>
          </div>
        </div>

        {/* Info Grid — compact 3-col, no labels, no district */}
        {infoValues.length > 0 && (
          <div className="px-4 py-3 border-b border-border">
            <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider mb-2">Information</p>
            <div className="grid grid-cols-3 gap-x-3 gap-y-2">
              {infoValues.map((val, i) => (
                <p key={i} className="text-xs font-medium truncate">{val}</p>
              ))}
            </div>
          </div>
        )}

        {/* Bill Summary */}
        <div className="px-4 py-3 border-b border-border">
          <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider mb-2">Bill Summary</p>
          {billInfo ? (
            <div className="space-y-1.5">
              {billInfo.billNumber != null && billInfo.billTotal != null && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-600 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/30 rounded px-1.5 py-0.5 shrink-0">
                    Bill #{billInfo.billNumber}/{billInfo.billTotal}
                  </span>
                  {billInfo.routeName && (
                    <span className="text-[10px] font-medium text-muted-foreground">{billInfo.routeName}</span>
                  )}
                </div>
              )}
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Paid months:</span>
                <span className="font-bold">{billInfo.paidMonths}</span>
                {billInfo.startMonth && (
                  <>
                    <span className="text-muted-foreground">Since:</span>
                    <span className="font-medium">{billInfo.startMonth}</span>
                  </>
                )}
              </div>
              {billInfo.currentBillMonth && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-600 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/30 rounded px-1.5 py-0.5">
                    Current Month
                  </span>
                  <span className="text-xs font-medium">{billInfo.currentBillMonth}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4 text-center">
              <p className="text-xs text-muted-foreground/60 dark:text-muted-foreground/80 italic">Loading...</p>
            </div>
          )}
        </div>

        {/* Delivery Photos */}
        {deliveryPhotos.length > 0 && (
          <div className="px-4 py-3 border-b border-border">
            <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider mb-2 flex items-center gap-1">
              <Image className="h-3 w-3" /> Delivery Photos ({deliveryPhotos.length})
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              {deliveryPhotos.map((p, i) => (
                <button
                  key={p.id}
                  onClick={() => openGallery(surveyImages.length + i)}
                  className="shrink-0 w-20 h-20 rounded-lg overflow-hidden bg-muted border border-border hover:opacity-80 transition-opacity cursor-pointer"
                >
                  <img src={p.photo_url} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="h-3" />
      </div>

      {/* Flag for Review + Record Navigation Bar */}
      {canNav && (
        <div className="border-t bg-card shrink-0">
          {/* Flag for Review row */}
          {(roleName === 'admin' || roleName === 'super_admin') && (
            <div className="px-3 py-1.5 border-b">
              {flagDone ? (
                <span className="text-[10px] text-green-600 dark:text-green-300 font-medium flex items-center gap-1">
                  <Flag className="h-3 w-3" /> Flagged for review
                </span>
              ) : (
                <button
                  onClick={async () => {
                    if (flagging) return
                    setFlagging(true)
                    try {
                      const res = await fetch('/api/admin/flagged-psids', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          psid: survey.psid,
                          survey_id: survey.survey_id,
                          reason: 'staff_flagged',
                          notes: 'Flagged for review from House Detail',
                        }),
                      })
                      if (res.ok) {
                        setFlagDone(true)
                        setFlaggedSummary({
                          action: 'PENDING',
                          label: 'Flagged for review',
                          icon: 'flag',
                          plus_count: 1,
                        })
                      }
                    } finally {
                      setFlagging(false)
                    }
                  }}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 text-[10px] font-semibold hover:bg-pink-200 dark:hover:bg-pink-900/50 cursor-pointer disabled:opacity-50"
                  disabled={flagging}
                >
                  {flagging ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Flag className="h-3 w-3" />
                  )}
                  Flag for Review
                </button>
              )}
            </div>
          )}
          <div className="flex items-center justify-between px-3 py-2">
            <div className="flex items-center gap-1.5">
              <Button
                variant="secondary"
                className="h-11 w-11"
                disabled={!hasPrev}
                onClick={firstHouse}
                aria-label="First"
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="secondary"
                className="h-11 w-11"
                disabled={!hasPrev}
                onClick={prevHouse}
                aria-label="Previous"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>

            <div className="text-center min-w-0 px-2">
              <p className="text-xs font-medium text-foreground font-mono">
                {houseListIndex + 1} / {houseListTotal.toLocaleString()}
              </p>
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                variant="secondary"
                className="h-11 w-11"
                disabled={!hasNext}
                onClick={nextHouse}
                aria-label="Next"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="secondary"
                className="h-11 w-11"
                disabled={!hasNext}
                onClick={lastHouse}
                aria-label="Last"
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Image Gallery Lightbox */}
      <Lightbox
        open={galleryOpen}
        close={() => setGalleryOpen(false)}
        index={imgIdx}
        slides={slides}
        plugins={[Counter, Zoom, Fullscreen]}
        on={{
          view: ({ index }) => setImgIdx(index),
        }}
      />
    </div>
  )
}
