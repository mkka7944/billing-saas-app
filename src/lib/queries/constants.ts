export const STALE_TIMES = {
  REFERENCE: 30 * 60 * 1000,
  HOURLY: 60 * 60 * 1000,
  BILLING: 5 * 60 * 1000,
  DELIVERY: 30_000,
  PERFORMANCE: 2 * 60 * 1000,
  DEFAULT: 0,
} as const

export const SURVEY_UNIT_COLS = [
  'survey_id',
  'status',
  'city_district',
  'tehsil',
  'uc_name',
  'consumer_name',
  'address',
  'surveyor_name',
  'survey_date',
  'survey_time',
  'lat',
  'lng',
  'psid',
  'monthly_fee',
  'billing_category',
  'amount_due',
  'arrears',
  'route_name',
  'route_seq',
  'current_bill_month',
  'start_month',
  'image_urls',
] as const

export type SurveyUnitColumn = typeof SURVEY_UNIT_COLS[number]
