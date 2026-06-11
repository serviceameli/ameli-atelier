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

const LOCATION_ID = {
  'Склад':    '223b1669-e723-4700-b479-545b85aef63e',
  'Елена':    '4ffc4a4c-5980-4429-9f64-3650f0443920',
  'Людмила':  'cf146591-0db0-413f-8cfd-61720062e11f',
  'Кристина': 'f8073611-69f3-4885-bce5-66e72b3d762c',
}

// Парсим кол-во из строки типа "200м", "4,5м", "35шт", "1 моток", "~40м"
function parseQty(str) {
  if (!str || !str.toString().trim()) return null
  const s = str.toString().replace(',', '.').replace('~', '').trim()
  const m = s.match(/[\d.]+/)
  return m ? parseFloat(m[0]) : null
}

// Определяем единицу измерения
function detectUnit(str) {
  if (!str) return 'шт'
  const s = str.toString().toLowerCase()
  if (s.includes('м') && !s.includes('мот')) return 'м'
  if (s.includes('мот')) return 'моток'
  return 'шт'
}

async function main() {
  const csvPath = path.join(__dirname, '../data/Пошив и закупки/Журнал передвижения текстиля - Журнал расходн.для пошива.csv')
  const raw = fs.readFileSync(csvPath, 'utf-8')
  const rows = parse(raw, { relax_column_count: true, skip_empty_lines: false })

  // Заголовок: строка 0 = [_, Склад, _, Елена, _, Людмила, _, Кристина, _]
  // строка 1 = [Наименование, Кол-во, Дата, Кол-во, Дата, Кол-во, Дата, Кол-во, Дата]
  const locationCols = [
    { name: 'Склад',    col: 1, dateCol: 2 },
    { name: 'Елена',    col: 3, dateCol: 4 },
    { name: 'Людмила',  col: 5, dateCol: 6 },
    { name: 'Кристина', col: 7, dateCol: 8 },
  ]

  let currentCategory = 'прочее'
  let imported = 0

  for (let i = 2; i < rows.length; i++) {
    const row = rows[i]
    const name = row[0]?.trim()

    if (!name) continue

    // Категория (строки типа "Молнии:", "Бегунки :", "Резинки:")
    if (name.match(/^[А-ЯЁ][а-яё\s]+:?\s*$/) && !row[1]?.trim() && !row[3]?.trim()) {
      currentCategory = name.replace(':', '').trim().toLowerCase()
      continue
    }

    // Есть ли хоть одно ненулевое кол-во?
    const hasQty = locationCols.some(lc => parseQty(row[lc.col]) !== null)
    if (!hasQty) continue

    // Определяем единицу из первого ненулевого значения
    const firstQtyStr = locationCols.map(lc => row[lc.col]).find(v => v?.trim())
    const unit = detectUnit(firstQtyStr)

    // Создаём расходник
    const { data: consumable, error: cErr } = await supabase
      .from('consumables')
      .insert({ name, category: currentCategory, unit })
      .select('id')
      .single()

    if (cErr) { console.error(`Ошибка "${name}": ${cErr.message}`); continue }

    // Создаём stock записи для каждой локации
    for (const lc of locationCols) {
      const qty = parseQty(row[lc.col])
      if (qty === null) continue
      const locId = LOCATION_ID[lc.name]
      const dateStr = row[lc.dateCol]?.trim() || null

      await supabase.from('consumable_stock').upsert({
        consumable_id: consumable.id,
        location_id: locId,
        qty,
        updated_at: null, // дата в формате "6 мая" — пропускаем
      })
    }

    imported++
  }

  console.log(`✅ Расходников импортировано: ${imported}`)
}

main().catch(console.error)
