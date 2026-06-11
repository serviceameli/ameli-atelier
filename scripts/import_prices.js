import { createClient } from '@supabase/supabase-js'
import ws from 'ws'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { parse } from 'csv-parse/sync'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const supabase = createClient(
  'https://iiyeorrhknsmnixbhjyy.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlpeWVvcnJoa25zbW5peGJoanl5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTE3ODc1NCwiZXhwIjoyMDk2NzU0NzU0fQ.LeOWPV_dwAYocC_bg_o_RlMq2KuTbEl0UQDfyGywj2Y',
  { realtime: { transport: ws } }
)

// Маппинг названий тканей из CSV → ID в базе
const FABRIC_MAP = {
  'Бархат':       '059dac10-65b4-40ee-afd0-84ce550e0279',
  'Габардин':     '672ecb61-1b7d-45c2-a701-b2f4ba0a655c',
  'Канвас':       '5c7a1305-fcbb-488b-98f3-893c73b4e868',
  'Канвас китай': '5c7a1305-fcbb-488b-98f3-893c73b4e868',
  'Шелк':         '7486e716-a82b-41d6-8e1d-10055f999ae5',
  'Парча':        '6da41603-8da9-448b-b1c4-58dce2ef6094',
  'Лен':          'e27324aa-47dd-445e-afcd-f739dfba1274',
}

async function main() {
  // Загружаем product_types
  const { data: productTypes } = await supabase.from('product_types').select('id, name')
  const ptMap = {}
  for (const p of productTypes) ptMap[p.name.toLowerCase().trim()] = p.id

  const csv = fs.readFileSync(path.join(__dirname, '../data/sewing_prices.csv'), 'utf-8')
  const rows = parse(csv, { columns: true, skip_empty_lines: true })

  // Очищаем старые цены
  await supabase.from('sewing_prices').delete().neq('id', '00000000-0000-0000-0000-000000000000')

  let ok = 0, skip = 0
  for (const row of rows) {
    const fabricId = row.fabric_type ? FABRIC_MAP[row.fabric_type.trim()] : null
    const productName = row.product?.trim().toLowerCase()
    const productId = ptMap[productName] || null
    const price = parseFloat(row.price_rub)

    if (!productId) {
      console.log(`Не найдено изделие: "${row.product}"`)
      skip++
      continue
    }

    const { error } = await supabase.from('sewing_prices').insert({
      fabric_type_id: fabricId || null,
      product_type_id: productId,
      price_rub: price,
      includes_fabric: row.includes_fabric === 'да',
      note: row.note || null,
    })
    if (error) { console.error(error.message); skip++ }
    else ok++
  }

  // Pricing rules
  await supabase.from('pricing_rules').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  const rulesCSV = fs.readFileSync(path.join(__dirname, '../data/pricing_rules.csv'), 'utf-8')
  const rules = parse(rulesCSV, { columns: true, skip_empty_lines: true })
  for (const r of rules) {
    const fabricId = r.fabric_type && r.fabric_type !== '*' ? FABRIC_MAP[r.fabric_type.trim()] : null
    await supabase.from('pricing_rules').insert({
      fabric_type_id: fabricId,
      rule_text: r.rule,
    })
  }

  console.log(`✅ Цены: ${ok} загружено, ${skip} пропущено`)
  console.log(`✅ Правила: ${rules.length} загружено`)
}

main().catch(console.error)
