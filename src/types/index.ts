export interface SurveyUnit {
  survey_id: string
  consumer_name: string | null
  address: string | null
  lat: number | null
  lng: number | null
  psid: string | null
  arrears: number | null
  current_bill_month: string | null
  route_name: string | null
  route_seq: number | null
  image_urls: string[] | null
  city_district: string | null
  tehsil: string | null
  uc_name: string | null
  surveyor_name: string | null
  survey_date: string | null
  survey_time: string | null
  monthly_fee: number
  billing_category: string
  status: string
}

export interface SavedRoute {
  id: string
  route_name: string
  created_by: string
  route_data: RouteData
  delivery_feb2026?: Record<string, unknown>
  created_at: string
}

interface RouteData {
  name: string
  sequence: RouteWaypoint[]
  polygon?: number[][] | null
  timestamp?: string
}

export interface RouteWaypoint {
  surveyId: string
  lat: number
  lng: number
  name: string
}

export type SearchMode = 'both' | 'psid' | 'sid'

export interface FilterState {
  districts: string[]
  tehsils: string[]
  ucs: string[]
  surveyor: string | null
  paymentStatus: 'all' | 'paid' | 'unpaid'
  search: string
  searchMode: SearchMode
  billMonth: string | null
  sort: SortConfig
}

export type SortField = 'survey_id' | 'surveyor_name' | 'survey_date' | 'survey_time'
export type SortDirection = 'asc' | 'desc'
export interface SortConfig {
  field: SortField
  direction: SortDirection
}

export interface FinanceSummary {
  grand_totals: {
    total_units: number
    total_paying: number
    total_collected: number
    total_expected: number
    recovery_rate: number
  }
  tehsil_stats: TehsilStat[]
  uc_stats: UCStat[]
  category_stats: CategoryStat[]
}

export interface TehsilStat {
  tehsil: string
  total_units: number
  paying_units: number
  expected: number
  collected: number
  rate: number
}

export interface UCStat {
  uc_name: string
  tehsil: string
  total_units: number
  paying_units: number
  expected: number
  collected: number
  rate: number
}

export interface CategoryStat {
  category: string
  total_units: number
  paying_units: number
  collected: number
}

export interface DailyAssignment {
  id: string
  staff_id: string
  issued_at: string
  uc_name: string
  uc_names: string[]
  name: string | null
  target_per_day: number | null
  total_items: number
  created_by: string | null
  created_at: string
}

export interface AssignmentItem {
  id: string
  assignment_id: string
  psid: string
  survey_id: string | null
  route_seq: number
  status: 'pending' | 'processing' | 'delivered' | 'missed' | 'skipped'
  started_at: string | null
  delivered_at: string | null
  gps_lat: number | null
  gps_lng: number | null
  notes: string | null
}

export interface AssignmentItemUnit {
  psid: string
  survey_id: string | null
  consumer_name: string | null
  address: string | null
  lat: number | null
  lng: number | null
  monthly_fee: number | null
  arrears: number | null
  route_name: string | null
  route_seq: number | null
  uc_name: string | null
  image_urls: string[]
}

export interface AssignmentItemWithUnit extends AssignmentItem {
  unit: AssignmentItemUnit | null
  deliveredByOther?: boolean
  deliveredByStaffName?: string | null
}

// ─── Bill Info (Bill Summary section in HouseDetailSheet) ──

export interface BillInfo {
  billNumber: number | null
  billTotal: number | null
  routeName: string | null
  routeSeq: number | null
  ucName: string | null
  paidMonths: number
  startMonth: string | null
  currentBillMonth: string | null
}

// ─── Chart / Dashboard Types ───────────────────────────────

export interface MonthlyTrendRow {
  bill_month: string
  amount: number
  bills: number
  fine_total: number
}

export interface DailyDetailRow {
  paid_date: string
  amount: number
  bills: number
}

export interface CategorySummaryRow {
  category_group: string
  amount: number
  bills: number
}

export interface TehsilBreakdownRow {
  tehsil: string
  bill_month: string
  amount: number
  bills: number
}

export interface MonthlyCurveRow {
  bill_month: string
  day: number
  daily_amount: number
  cumulative_amount: number
  day_label: string
}

export interface ChartKpi {
  total_units: number
  collected: number
}

export interface BillingChartsData {
  monthly_trend: MonthlyTrendRow[]
  daily_detail: DailyDetailRow[]
  category_summary: CategorySummaryRow[]
  tehsil_breakdown: TehsilBreakdownRow[]
  monthly_curves: MonthlyCurveRow[]
  kpi: ChartKpi
}

export interface OrphanPsidRow {
  psid: string
  bill_month: string
  amount_paid: number
  paid_date: string
  city_district: string | null
  tehsil: string | null
  uc_name: string | null
}

export interface OrphanPsidsData {
  rows: OrphanPsidRow[]
  total: number
  month_totals: { bill_month: string; psids: number; amount: number }[]
}

export interface Notification {
  id: string
  user_id: string
  type: 'info' | 'warning' | 'admin_alert' | 'staff_message' | 'item_update'
  title: string
  body: string | null
  link: string | null
  read: boolean
  created_at: string
}
