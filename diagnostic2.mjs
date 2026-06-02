import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://qrxbsoqepfaryolwcedk.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFyeGJzb3FlcGZhcnlvbHdjZWRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTQ1MjY5NiwiZXhwIjoyMDk1MDI4Njk2fQ.OkqasUEd0yIcPIgAB1Udj0MhE7h5Y9hBrDvbX-_Je_A'
)

async function run() {
  // Check the exact uc_name from hierarchy
  const { data: hierData } = await supabase
    .from('hierarchy')
    .select('uc_name, city_district, tehsil')
    .ilike('uc_name', '%MC-1%')

  console.log('=== All hierarchy rows containing MC-1 ===')
  hierData?.forEach(r => console.log(`  "${r.uc_name}" (${r.city_district}/${r.tehsil})`))

  if (!hierData) { console.log('No hierarchy data'); return }

  // For each hierarchy UC name, get the count in survey_units
  for (const h of hierData) {
    const { count } = await supabase
      .from('survey_units')
      .select('*', { count: 'exact', head: true })
      .eq('uc_name', h.uc_name)
      .eq('status', 'ACTIVE')

    console.log(`  "${h.uc_name}" → ${count} ACTIVE records`)
  }

  // What about the exact MC-1 entry the user would see?
  const mc1Name = hierData.find(r => r.uc_name.startsWith('MC-1,'))?.uc_name
  if (mc1Name) {
    console.log(`\n=== Exact MC-1 hierarchy name: "${mc1Name}" ===`)
    
    const { count: totalActive } = await supabase
      .from('survey_units')
      .select('*', { count: 'exact', head: true })
      .eq('uc_name', mc1Name)
      .eq('status', 'ACTIVE')

    const { count: totalAll } = await supabase
      .from('survey_units')
      .select('*', { count: 'exact', head: true })
      .eq('uc_name', mc1Name)

    console.log(`  Total ACTIVE: ${totalActive}`)
    console.log(`  Total (all statuses): ${totalAll}`)
  }
}

run().catch(console.error)
