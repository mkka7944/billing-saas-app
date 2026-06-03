import { NextResponse } from 'next/server'
import { z } from 'zod'

type ZodSchema = z.ZodTypeAny

export function validateQuery<T extends ZodSchema>(
  request: Request,
  schema: T
): z.infer<T> | NextResponse {
  const sp = new URL(request.url).searchParams
  const raw: Record<string, unknown> = {}

  // Collect unique keys, preserving multi-value params as arrays
  for (const key of [...new Set(sp.keys())]) {
    const values = sp.getAll(key)
    raw[key] = values.length > 1 ? values : values[0]
  }

  const result = schema.safeParse(raw)
  if (!result.success) {
    const errors = result.error.flatten().fieldErrors
    return NextResponse.json({ error: 'Invalid parameters', details: errors }, { status: 400 })
  }

  return result.data
}
