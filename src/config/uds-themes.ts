export type UdsThemeId = 'default' | 'outdoor'

export interface UdsTheme {
  stripBg: string
  gpsLocating: string
  gpsUnavailable: string
  bodyTextMuted: string
  bodyTextSubtle: string
  hintText: string
  bodyTextShadow: string
  detailsBg: string
  detailsBorder: string
  flagBg: string
  flagText: string
  navArrowBg: string
  navArrowText: string
  dotInactive: string
  overlayBg: string
}

export const UDS_THEMES: Record<UdsThemeId, UdsTheme> = {
  default: {
    stripBg: 'bg-black/30',
    gpsLocating: 'text-white/60',
    gpsUnavailable: 'text-white/50',
    bodyTextMuted: 'text-white/70',
    bodyTextSubtle: 'text-white/50',
    hintText: 'text-amber-300/70',
    bodyTextShadow: '[text-shadow:0_1px_3px_rgba(0,0,0,0.8)]',
    detailsBg: 'bg-white/15',
    detailsBorder: 'border-white/20',
    flagBg: 'bg-white/15',
    flagText: 'text-white/60',
    navArrowBg: 'bg-black/5',
    navArrowText: 'text-white/50',
    dotInactive: 'bg-white/20',
    overlayBg: 'bg-black/80',
  },
  outdoor: {
    stripBg: 'bg-black/40',
    gpsLocating: 'text-gray-200',
    gpsUnavailable: 'text-gray-400',
    bodyTextMuted: 'text-gray-300',
    bodyTextSubtle: 'text-gray-400',
    hintText: 'text-amber-400',
    bodyTextShadow: '[text-shadow:0_2px_4px_rgba(0,0,0,1)]',
    detailsBg: 'bg-white/25',
    detailsBorder: 'border-white/30',
    flagBg: 'bg-white/25',
    flagText: 'text-gray-300',
    navArrowBg: 'bg-black/20',
    navArrowText: 'text-white/80',
    dotInactive: 'bg-white/40',
    overlayBg: 'bg-black/85',
  },
}
