/**
 * Restore image_urls to survey_units from scraped CSV data.
 *
 * Step 1: Run the SQL migration via Supabase Dashboard:
 *   ALTER TABLE public.survey_units ADD COLUMN IF NOT EXISTS image_urls text[] DEFAULT '{}'::text[];
 *
 * Step 2: Run this script with .env.local loaded:
 *   npx dotenv -e .env.local -- node scripts/restore-image-urls.mjs
 *
 * CSV columns: Survey ID, Image URL 1, Image URL 2, Image URL 3, Image URL 4
 * Files: SARGODHA_SARGODHA_SURVEY_DATA.csv, SARGODHA_BHALWAL_SURVEY_DATA.csv,
 *        KHUSHAB_KHUSHAB_SURVEY_DATA.csv
 */

import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CSV_DIR = resolve(__dirname, 'data', 'scraped_data')

const CSV_FILES = [
  'SARGODHA_SARGODHA_SURVEY_DATA.csv',
  'SARGODHA_BHALWAL_SURVEY_DATA.csv',
  'KHUSHAB_KHUSHAB_SURVEY_DATA.csv',
]

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE env vars — load .env.local first')
  console.error('  npx dotenv -e .env.local -- node scripts/restore-image-urls.mjs')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

/** Parse CSV without external deps — handles quoted fields with commas */
function parseCSV(path) {
  const raw = readFileSync(path, 'utf-8')
  const lines = raw.split('\n').filter(l => l.trim().length > 0)
  if (lines.length < 2) return { header: [], rows: [] }

  const header = parseLine(lines[0])
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const vals = parseLine(lines[i])
    const row = {}
    for (let j = 0; j < header.length; j++) {
      row[header[j]] = (vals[j] || '').trim()
    }
    rows.push(row)
  }
  return { header, rows }
}

/** Parse a single CSV line respecting quoted fields */
function parseLine(line) {
  const fields = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') { inQuotes = !inQuotes; continue }
    if (ch === ',' && !inQuotes) { fields.push(current); current = ''; continue }
    current += ch
  }
  fields.push(current)
  return fields
}

/** Extract image URLs from a row */
function extractImages(row) {
  const urls = []
  for (let k = 1; k <= 4; k++) {
    const url = row[`Image URL ${k}`]
    if (url && url.startsWith('http')) urls.push(url)
  }
  return urls
}

async function main() {
  // Phase 1: Try ALTER TABLE (may fail if run through REST — that's OK, run manually)
  console.log('Attempting ALTER TABLE (may fail via REST, run manually if so)...')
  try {
    const { error: alterErr } = await supabase.rpc('exec_sql', {
      sql: `ALTER TABLE public.survey_units ADD COLUMN IF NOT EXISTS image_urls text[] DEFAULT '{}'::text[]`
    })
    if (alterErr) throw alterErr
    console.log('  Column added successfully via RPC')
  } catch {
    console.log('  NOTE: Could not run DDL via REST.')
    console.log('  Run manually in Supabase Dashboard SQL editor:')
    console.log("  ALTER TABLE public.survey_units ADD COLUMN IF NOT EXISTS image_urls text[] DEFAULT '{}'::text[];")
  }

  // Phase 2: Parse CSVs and collect image URL data
  const allUpdates = []

  for (const file of CSV_FILES) {
    const fp = resolve(CSV_DIR, file)
    if (!existsSync(fp)) { console.log(`Skipping ${file} — not found`); continue }
    console.log(`\nReading ${file}...`)
    const { header, rows } = parseCSV(fp)
    console.log(`  ${rows.length} rows, ${header.length} columns`)

    let found = 0
    for (const row of rows) {
      const surveyId = row['Survey ID']
      if (!surveyId) continue
      const urls = extractImages(row)
      if (urls.length > 0) {
        allUpdates.push({ survey_id: surveyId, image_urls: urls })
        found++
      }
    }
    console.log(`  ${found} rows with image URLs`)
  }

  console.log(`\nTotal survey entries with images: ${allUpdates.length}`)

  // Phase 3: Batch-update in chunks
  if (allUpdates.length === 0) {
    console.log('No updates to perform.')
    return
  }

  const CHUNK = 500
  let updated = 0
  let errors = 0

  for (let i = 0; i < allUpdates.length; i += CHUNK) {
    const chunk = allUpdates.slice(i, i + CHUNK)
    await Promise.all(chunk.map(({ survey_id, image_urls }) =>
      supabase
        .from('survey_units')
        .update({ image_urls })
        .eq('survey_id', survey_id)
        .then(({ error }) => {
          if (error) { errors++; console.error(`  FAIL survey ${survey_id}: ${error.message}`) }
          else updated++
        })
    ))
    process.stdout.write(`\r  Progress: ${updated + errors}/${allUpdates.length} (${updated} OK, ${errors} errors)`)
  }

  console.log(`\n\nDone! Updated ${updated} rows, ${errors} errors`)
}

main().catch(console.error)
