export interface SurveyUnit {
  survey_id: string
  consumer_name: string | null
  address: string | null
  lat: number | null
  lng: number | null
  image_urls: string[] | null
  city_district: string | null
  tehsil: string | null
  uc_name: string | null
  uc_type: string | null
  unit_type: string | null
  surveyor_name: string | null
  survey_date: string | null
  monthly_fee: number
  billing_category: string
  status: string
  category: string | null
  sub_category: string | null
  house_type: string | null
}

export interface Bill {
  psid: string
  bill_month: string
  survey_id: string
  amount_due: number
  amount_paid: number
  fine: number
  total_payable: number
  payment_status: string
  paid_date: string | null
  payment_method: string | null
  is_primary: boolean
  is_issued: boolean
  monthly_fee: number
  billing_category: string | null
  category: string | null
  sub_category: string | null
  arrears: number
  current_bill: number
  deleted_in_portal: string | null
}

export interface SavedRoute {
  id: string
  route_name: string
  created_by: string
  route_data: RouteData
  delivery_feb2026?: Record<string, unknown>
  created_at: string
}

export interface RouteData {
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

export interface VerifiedHouse {
  id: string
  survey_id: string
  latitude: number
  longitude: number
  surveyor_name: string | null
  route_name: string | null
  verified_at: string
  billing_month: string | null
  verified_by: string | null
  is_delivered: boolean
  delivered_at: string | null
}

export interface Staff {
  id: string
  email: string
  role: 'admin' | 'staff' | 'viewer'
  full_name: string | null
  assigned_city: string | null
  assigned_ucs: string[] | null
  is_active: boolean
}

export interface FilterState {
  districts: string[]
  tehsils: string[]
  ucs: string[]
  surveyor: string | null
  paymentStatus: 'all' | 'paid' | 'unpaid' | 'overdue'
  unitType: string | null
  search: string
  billMonth: string | null
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
