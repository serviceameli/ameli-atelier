import { createClient } from '@supabase/supabase-js'
import ws from 'ws'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const SUPABASE_URL = 'https://iiyeorrhknsmnixbhjyy.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlpeWVvcnJoa25zbW5peGJoanl5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTE3ODc1NCwiZXhwIjoyMDk2NzU0NzU0fQ.LeOWPV_dwAYocC_bg_o_RlMq2KuTbEl0UQDfyGywj2Y'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  realtime: { transport: ws }
})

// ─── Маппинги ───────────────────────────────────────────────────────────────

const STATUS_MAP = {
  'Отшито':       'sewn',
  'Изготовление': 'in_progress',
  'Шьется':       'in_progress',
  'В доставке':   'done',
  'Куплено':      'done',
  'Not started':  'draft',
  'Не заказано':  'draft',
}

const KIND_MAP = {
  'Пошив':           'sewing',
  'Покупка мебели':  'purchase',
  'Покупка посуды':  'purchase',
  'Покупка ткани':   'purchase',
  'Покупка декора':  'purchase',
}

// ─── Парсинг .md файла ──────────────────────────────────────────────────────

function parseOrderFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8')
  const lines = content.split('\n')

  const title = lines[0]?.replace(/^#\s*/, '').trim()
  const fields = {}
  for (const line of lines.slice(1)) {
    const m = line.match(/^([^:]+):\s*(.+)$/)
    if (m) fields[m[1].trim()] = m[2].trim()
  }

  return { title, fields }
}

function parseDate(str) {
  if (!str) return null
  // "May 30, 2025" or "June 1, 2025"
  try {
    const d = new Date(str)
    if (isNaN(d)) return null
    return d.toISOString().slice(0, 10)
  } catch { return null }
}

// ─── Загружаем справочники ──────────────────────────────────────────────────

async function loadRefData() {
  const [{ data: seamstresses }, { data: productTypes }] = await Promise.all([
    supabase.from('seamstresses').select('id, name'),
    supabase.from('product_types').select('id, name'),
  ])

  const seamstressMap = {}
  for (const s of seamstresses || []) seamstressMap[s.name.toLowerCase()] = s.id

  const productTypeMap = {}
  for (const p of productTypes || []) productTypeMap[p.name.toLowerCase()] = p.id

  return { seamstressMap, productTypeMap }
}

// ─── Матчинг изделий ────────────────────────────────────────────────────────

function matchProductType(name, productTypeMap) {
  const n = name.trim().toLowerCase()
  // точное совпадение
  if (productTypeMap[n]) return productTypeMap[n]
  // частичное совпадение
  for (const [key, id] of Object.entries(productTypeMap)) {
    if (key.includes(n) || n.includes(key)) return id
  }
  return null
}

// ─── Главный импорт ─────────────────────────────────────────────────────────

async function main() {
  const ordersDir = path.join(__dirname, '../data/Пошив и закупки/Untitled')
  const files = fs.readdirSync(ordersDir).filter(f => f.endsWith('.md'))

  console.log(`Найдено файлов: ${files.length}`)

  const { seamstressMap, productTypeMap } = await loadRefData()
  console.log(`Швей: ${Object.keys(seamstressMap).length}, изделий: ${Object.keys(productTypeMap).length}`)

  let imported = 0
  let errors = 0
  const unknownProductTypes = new Set()

  for (const file of files) {
    const filePath = path.join(ordersDir, file)
    const { title, fields } = parseOrderFile(filePath)

    if (!title) continue

    const status = STATUS_MAP[fields['Статус']] || 'draft'
    const kind = KIND_MAP[fields['Тип']] || 'sewing'
    const seamstressName = fields['Швея']?.toLowerCase()
    const seamstress_id = seamstressName ? (seamstressMap[seamstressName] || null) : null
    const due_date = parseDate(fields['Дата заказа AR'])
    const created_date = parseDate(fields['Дата'])
    const isUrgent = fields['Заказ'] === 'Срочный заказ'
    const colorNote = fields['Цвет'] || null

    // Формируем brief из цвета
    const brief = colorNote ? `Цвет: ${colorNote}` : null

    // Вставляем заказ
    const { data: order, error: oErr } = await supabase
      .from('orders')
      .insert({
        title,
        kind,
        status,
        seamstress_id,
        due_date,
        is_urgent: isUrgent,
        requires_fabric: kind === 'sewing',
        brief,
        created_at: created_date ? `${created_date}T00:00:00Z` : undefined,
      })
      .select('id')
      .single()

    if (oErr) {
      console.error(`Ошибка "${title}": ${oErr.message}`)
      errors++
      continue
    }

    // Вставляем позиции заказа
    const vidIzdeliya = fields['Вид изделия']
    if (vidIzdeliya) {
      const items = vidIzdeliya.split(',').map(s => s.trim()).filter(Boolean)
      const orderItems = []
      for (const item of items) {
        const ptId = matchProductType(item, productTypeMap)
        if (ptId) {
          orderItems.push({ order_id: order.id, product_type_id: ptId, qty: 1 })
        } else {
          unknownProductTypes.add(item)
        }
      }
      if (orderItems.length > 0) {
        await supabase.from('order_items').insert(orderItems)
      }
    }

    imported++
    if (imported % 50 === 0) console.log(`  импортировано ${imported}...`)
  }

  console.log(`\n✅ Импортировано: ${imported}, ошибок: ${errors}`)
  if (unknownProductTypes.size > 0) {
    console.log(`\nНе найдены типы изделий (${unknownProductTypes.size}):`)
    for (const u of [...unknownProductTypes].sort()) console.log(`  - ${u}`)
  }
}

main().catch(console.error)
