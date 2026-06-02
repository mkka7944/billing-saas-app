import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://qrxbsoqepfaryolwcedk.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFyeGJzb3FlcGZhcnlvbHdjZWRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTQ1MjY5NiwiZXhwIjoyMDk1MDI4Njk2fQ.OkqasUEd0yIcPIgAB1Udj0MhE7h5Y9hBrDvbX-_Je_A'
)

// Note: supabase-js cannot do raw SQL. 
// Querying both tables separately and comparing client-side.

async function run() {
  const [hierRes, suRes] = await Promise.all([
    supabase.from('hierarchy').select('uc_name').ilike('uc_name', '%MC-1%'),
    supabase.from('survey_units')
      .select('uc_name', { count: 'exact', head: false })
      .ilike('uc_name', '%MC-1%')
      .eq('status', 'ACTIVE'),
  ])

  if (hierRes.error) { console.error('Hierarchy error:', hierRes.error); return }
  if (suRes.error) { console.error('Survey units error:', suRes.error); return }

  const hierUCs = [...new Set((hierRes.data || []).map(r => r.uc_name))]
  const suUCs = [...new Set((suRes.data || []).map(r => r.uc_name))]

  console.log('=== Hierarchy UC names containing MC-1 ===')
  hierUCs.forEach(u => console.log(`  "${u}"`))

  console.log('\n=== Survey Units UC names containing MC-1 (ACTIVE) ===')
  suUCs.forEach(u => console.log(`  "${u}"`))

  console.log('\n=== Comparison ===')
  
  // Check for exact match
  const matching = hierUCs.filter(h => suUCs.includes(h))
  const hierOnly = hierUCs.filter(h => !suUCs.includes(h))
  const suOnly = suUCs.filter(s => !hierUCs.includes(s))

  console.log(`Matching: ${matching.length}`)
  if (matching.length) console.log(matching.map(u => `  ✓ "${u}"`).join('\n'))

  if (hierOnly.length) {
    console.log(`\nIn hierarchy but NOT in survey_units: ${hierOnly.length}`)
    hierOnly.forEach(u => console.log(`  ✗ "${u}"`))
  }
  
  if (suOnly.length) {
    console.log(`\nIn survey_units but NOT in hierarchy: ${suOnly.length}`)
    suOnly.forEach(u => console.log(`  ✗ "${u}"`))
  }

  // Check lowercase comparison
  const lowerHier = hierUCs.map(u => u.toLowerCase())
  const lowerSu = suUCs.map(u => u.toLowerCase())
  const caseMismatch = hierUCs.filter(h => lowerSu.includes(h.toLowerCase()) && !suUCs.includes(h))
  if (caseMismatch.length) {
    console.log('\n=== CASE MISMATCH DETECTED ===')
    caseMismatch.forEach(h => {
      const match = suUCs.find(s => s.toLowerCase() === h.toLowerCase() && s !== h)
      console.log(`  hierarchy: "${h}"`)
      console.log(`  survey:    "${match}"`)
    })
  } else {
    console.log('\n✓ No case mismatch detected')
  }

  console.log(`\n=== Total ACTIVE records with MC-1: ${suRes.count} ===`)
}

run().catch(console.error)
