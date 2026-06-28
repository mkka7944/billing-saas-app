import { z } from 'zod'

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
})

export const sortSchema = z.object({
  sortField: z.enum(['survey_id', 'surveyor_name', 'survey_date', 'survey_time', 'consumer_name']).default('survey_id'),
  sortDirection: z.enum(['asc', 'desc']).default('desc'),
})

export const statusFilterSchema = z.enum(['active', 'archived', 'duplicates', '']).default('')

export const hierarchyFilterSchema = z.object({
  district: z.string().default(''),
  tehsil: z.string().default(''),
  uc: z.string().default(''),
  surveyor: z.string().default(''),
})

export const billingStatsSchema = z.object({
  district: z.string().default(''),
  tehsil: z.string().default(''),
  month: z.string().default(''),
})

export const flaggedPsidsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  reason: z.string().optional(),
  city: z.string().optional(),
  tehsil: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  unresolvedOnly: z.union([z.boolean(), z.string()]).transform(v => v === true || v === 'true').default(true),
  search: z.string().optional(),
  stats: z.union([z.boolean(), z.string()]).transform(v => v === true || v === 'true').default(false),
})

export const dataInsightSchema = z.object({
  district: z.string().default(''),
  tehsil: z.string().default(''),
  uc: z.string().default(''),
  surveyor: z.string().default(''),
  status: z.enum(['active', 'archived', 'duplicates', '']).default(''),
  billMonth: z.string().default(''),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  sortField: z.enum(['survey_id', 'surveyor_name', 'survey_date', 'survey_time']).default('survey_id'),
  sortDirection: z.enum(['asc', 'desc']).default('desc'),
  drill: z.string().optional(),
})

export const surveyQuerySchema = z.object({
  id: z.string().optional(),
  district: z.preprocess(
    (v) => (Array.isArray(v) ? v : v ? [v] : []),
    z.array(z.string()).default([])
  ),
  tehsil: z.preprocess(
    (v) => (Array.isArray(v) ? v : v ? [v] : []),
    z.array(z.string()).default([])
  ),
  uc: z.preprocess(
    (v) => (Array.isArray(v) ? v : v ? [v] : []),
    z.array(z.string()).default([])
  ),
  surveyor: z.string().default(''),
  search: z.string().default(''),
  paymentStatus: z.enum(['all', 'paid', 'unpaid']).default('all'),
  billMonth: z.string().default(''),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50000).default(50),
  sortField: z.enum(['survey_id', 'surveyor_name', 'survey_date', 'survey_time', 'consumer_name']).default('consumer_name'),
  sortDirection: z.enum(['asc', 'desc']).default('desc'),
})

export const assignmentQuerySchema = z.object({
  uc: z.string().optional(),
  staff_id: z.string().optional(),
  totals: z.union([z.boolean(), z.string()]).transform(v => v === true || v === 'true').default(false),
  list: z.union([z.boolean(), z.string()]).transform(v => v === true || v === 'true').default(false),
  district: z.string().default(''),
  tehsil: z.string().default(''),
  route_name: z.string().default(''),
  month: z.string().default(''),
  mode: z.coerce.number().int().min(1).max(4).default(1),
  ids_only: z.union([z.boolean(), z.string()]).transform(v => v === true || v === 'true').default(false),
})
