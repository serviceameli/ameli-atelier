#!/usr/bin/env node
/**
 * Импорт CSV-справочников и остатков в Supabase.
 * Запуск: node scripts/import.js
 * Требует .env с VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY
 * (или SUPABASE_SERVICE_KEY для обхода RLS без политик)
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { parse } from 'csv-parse/sync'

const __dir = dirname(fileURLToPath(import.meta.url))
const root = join(__dir, '..')

// загружаем .env вручную (без dotenv)
const envFile = readFileSync(join(root, '.env'), 'utf8')
const env = Object.fromEntries(
  envFile.split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()] })
)

const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL
const key = env.SUPABASE_SERVICE_KEY || env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  console.error('❌ Нет VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY в .env')
  process.exit(1)
}

const db = createClient(url, key)

function csv(name) {
  return parse(readFileSync(join(root, 'data', name), 'utf8'), {
    columns: true, skip_empty_lines: true, trim: true, bom: true,
  })
}

// ─── утилиты ──────────────────────────────────────────────────────────────────

async function upsertAll(table, rows, conflictCol) {
  if (!rows.length) return []
  const { data, error } = await db.from(table).upsert(rows, { onConflict: conflictCol, ignoreDuplicates: false }).select()
  if (error) { console.error(`❌ ${table}:`, error.message); process.exit(1) }
  return data
}

async function insertIgnore(table, rows, conflictCol) {
  if (!rows.length) return []
  const { data, error } = await db.from(table).upsert(rows, { onConflict: conflictCol, ignoreDuplicates: true }).select()
  if (error) { console.error(`❌ ${table}:`, error.message); process.exit(1) }
  return data
}

// ─── 1. suppliers ──────────────────────────────────────────────────────────────
console.log('\n📦 Импорт suppliers…')
const suppliersRaw = csv('suppliers.csv')
await upsertAll('suppliers', suppliersRaw.map(r => ({ name: r.name })), 'name')
const { data: suppliersDB } = await db.from('suppliers').select('id, name')
const supplierByName = Object.fromEntries(suppliersDB.map(s => [s.name.toLowerCase(), s.id]))
console.log(`   ✓ suppliers: ${suppliersDB.length}`)

// ─── 2. fabric_types ───────────────────────────────────────────────────────────
console.log('\n🧵 Импорт fabric_types…')
const ftRaw = csv('fabric_types.csv')
await upsertAll('fabric_types', ftRaw.map(r => ({
  name: r.name,
  site_alias: r.site_alias || null,
  default_width_m: parseFloat(r.default_width_m) || 3.0,
  default_roll_length_m: parseFloat(r.default_roll_length_m) || 32,
  needs_verification: r.needs_verification === 'true',
})), 'name')

// добавляем все типы из инвентаря, которых нет в справочнике
const allInventoryFabricTypes = new Set([
  ...csv('inventory_rolls_draft.csv').map(r => r.fabric_type),
  ...csv('inventory_pieces_draft.csv').map(r => r.fabric_type),
].filter(Boolean))

for (const ftName of allInventoryFabricTypes) {
  await db.from('fabric_types').upsert({
    name: ftName, default_width_m: 3.0, default_roll_length_m: 32
  }, { onConflict: 'name', ignoreDuplicates: true })
}

const { data: ftDB } = await db.from('fabric_types').select('id, name')
const ftByName = Object.fromEntries(ftDB.map(f => [f.name.toLowerCase(), f.id]))
console.log(`   ✓ fabric_types: ${ftDB.length}`)

// ─── 3. colors ─────────────────────────────────────────────────────────────────
console.log('\n🎨 Импорт colors…')
const colorsRaw = csv('colors.csv')
const colorSupplierPairs = [] // { color_name, supplier_names[] }

for (const r of colorsRaw) {
  const ftId = ftByName[r.fabric_type?.toLowerCase()]
  if (!ftId) { console.warn(`   ⚠ fabric_type не найден: "${r.fabric_type}", цвет "${r.name}" пропущен`); continue }
  await db.from('colors').upsert({
    name: r.name,
    code: r.code || null,
    fabric_type_id: ftId,
    comment: [r.code_comment, r.comment].filter(Boolean).join('; ') || null,
    active: true,
  }, { onConflict: 'name,code,fabric_type_id', ignoreDuplicates: true })
  if (r.suppliers) {
    colorSupplierPairs.push({ name: r.name, code: r.code || null, fabric_type: r.fabric_type, suppliers: r.suppliers.split(',').map(s => s.trim()) })
  }
}

const { data: colorsDB } = await db.from('colors').select('id, name, code, fabric_type_id')
console.log(`   ✓ colors: ${colorsDB.length}`)

// color_suppliers
for (const pair of colorSupplierPairs) {
  const ftId = ftByName[pair.fabric_type?.toLowerCase()]
  const color = colorsDB.find(c =>
    c.name === pair.name && c.code === (pair.code || null) && c.fabric_type_id === ftId
  )
  if (!color) continue
  for (const sName of pair.suppliers) {
    const sid = supplierByName[sName.toLowerCase()]
    if (!sid) continue
    await db.from('color_suppliers').upsert({ color_id: color.id, supplier_id: sid }, { onConflict: 'color_id,supplier_id', ignoreDuplicates: true })
  }
}

// ─── 4. seamstresses ───────────────────────────────────────────────────────────
console.log('\n👩‍🎨 Импорт seamstresses…')
const seamRaw = csv('seamstresses.csv')
await upsertAll('seamstresses', seamRaw.map(r => ({
  name: r.name,
  active: r.active !== 'false',
  comment: r.comment || null,
})), 'name')

// добавляем швей из инвентаря, которых нет в справочнике
const allLocNames = new Set([
  ...csv('inventory_rolls_draft.csv').map(r => r.location),
  ...csv('inventory_pieces_draft.csv').map(r => r.location),
].filter(l => l && l !== 'Склад' && l.toLowerCase() !== 'я'))

for (const sName of allLocNames) {
  await db.from('seamstresses').upsert({ name: sName, active: true }, { onConflict: 'name', ignoreDuplicates: true })
}

const { data: seamDB } = await db.from('seamstresses').select('id, name')
const seamByName = Object.fromEntries(seamDB.map(s => [s.name.toLowerCase(), s.id]))
console.log(`   ✓ seamstresses: ${seamDB.length}`)

// ─── 5. locations ──────────────────────────────────────────────────────────────
console.log('\n📍 Импорт locations…')
// Склад
await db.from('locations').upsert({ name: 'Склад', kind: 'warehouse' }, { onConflict: 'name', ignoreDuplicates: true })
// Я (owner)
await db.from('locations').upsert({ name: 'Я', kind: 'owner' }, { onConflict: 'name', ignoreDuplicates: true })

// швеи
for (const s of seamDB) {
  await db.from('locations').upsert({
    name: s.name, kind: 'seamstress', seamstress_id: s.id
  }, { onConflict: 'name', ignoreDuplicates: true })
}

const { data: locsDB } = await db.from('locations').select('id, name')
const locByName = Object.fromEntries(locsDB.map(l => [l.name.toLowerCase(), l.id]))
// нормализация «я» → location id
locByName['я'] = locByName['я'] || locsDB.find(l => l.name === 'Я')?.id
console.log(`   ✓ locations: ${locsDB.length}`)

// ─── 6. product_types ──────────────────────────────────────────────────────────
console.log('\n👕 Импорт product_types…')
const ptRaw = csv('product_types.csv')
await upsertAll('product_types', ptRaw.map(r => ({
  name: r.name,
  fabric_per_unit_m: r.fabric_per_unit_m ? parseFloat(r.fabric_per_unit_m) : null,
  note: r.note || null,
})), 'name')
const { data: ptDB } = await db.from('product_types').select('id, name')
const ptByName = Object.fromEntries(ptDB.map(p => [p.name.toLowerCase(), p.id]))
console.log(`   ✓ product_types: ${ptDB.length}`)

// ─── 7. sewing_prices ──────────────────────────────────────────────────────────
console.log('\n💰 Импорт sewing_prices…')
const spRaw = csv('sewing_prices.csv')
for (const r of spRaw) {
  const ftId = ftByName[r.fabric_type?.toLowerCase()]
  const ptId = ptByName[r.product?.toLowerCase()]
  if (!ptId) { console.warn(`   ⚠ product_type не найден: "${r.product}"`); continue }
  await db.from('sewing_prices').upsert({
    fabric_type_id: ftId || null,
    product_type_id: ptId,
    price_rub: parseFloat(r.price_rub),
    includes_fabric: r.includes_fabric === 'да' || r.includes_fabric === 'true',
    note: r.note || null,
  }, { onConflict: 'product_type_id,fabric_type_id', ignoreDuplicates: true })
}
const { data: spDB } = await db.from('sewing_prices').select('id')
console.log(`   ✓ sewing_prices: ${spDB.length}`)

// ─── 8. pricing_rules ─────────────────────────────────────────────────────────
console.log('\n📋 Импорт pricing_rules…')
const prRaw = csv('pricing_rules.csv')
for (const r of prRaw) {
  const ftId = r.fabric_type ? ftByName[r.fabric_type.toLowerCase()] : null
  await db.from('pricing_rules').insert({
    fabric_type_id: ftId || null,
    rule_text: r.rule,
  })
}
const { data: prDB } = await db.from('pricing_rules').select('id')
console.log(`   ✓ pricing_rules: ${prDB.length}`)

// ─── 9. МАТЧИНГ ЦВЕТОВ ────────────────────────────────────────────────────────
console.log('\n🔍 Матчинг цветов для инвентаря…')

// Обновлённый список цветов после всех вставок
const { data: allColors } = await db.from('colors').select('id, name, code, fabric_type_id')

// Строим индексы для быстрого поиска
const colorByCodeAndFt = {}    // "код|ftId" → color
const colorByNameAndFt = {}    // "название|ftId" → color[]
for (const c of allColors) {
  if (c.code) {
    const key = `${c.code.toLowerCase()}|${c.fabric_type_id}`
    colorByCodeAndFt[key] = c
  }
  const nkey = `${c.name.toLowerCase()}|${c.fabric_type_id}`
  if (!colorByNameAndFt[nkey]) colorByNameAndFt[nkey] = []
  colorByNameAndFt[nkey].push(c)
}

const createdColors = [] // список новых цветов созданных при импорте

async function resolveColor(rawName, rawFabricType) {
  const ftId = ftByName[rawFabricType?.toLowerCase()]
  if (!ftId) {
    console.warn(`   ⚠ Тип ткани не найден: "${rawFabricType}"`)
    return null
  }

  // Парсим «Название код» или «Название (код)» или «Название 312-125»
  // Стратегия: ищем числа с дефисом в конце строки, либо скобки
  let searchName = rawName.trim()
  let searchCode = null

  // Паттерн: «Название (код)»
  const bracketMatch = searchName.match(/^(.+?)\s*\(([^)]+)\)\s*$/)
  if (bracketMatch) {
    searchName = bracketMatch[1].trim()
    searchCode = bracketMatch[2].trim()
  } else {
    // Паттерн: «Название 312-125» или «Название 999-100» — код в конце
    const codeAtEnd = searchName.match(/^(.+?)\s+([\d]{3,4}-[\w]+)$/)
    if (codeAtEnd) {
      searchName = codeAtEnd[1].trim()
      searchCode = codeAtEnd[2].trim()
    }
  }

  // 1. Матч по коду
  if (searchCode) {
    const byCode = colorByCodeAndFt[`${searchCode.toLowerCase()}|${ftId}`]
    if (byCode) return byCode.id
    // Матч по коду без учёта типа ткани
    const byCodeAny = allColors.find(c => c.code?.toLowerCase() === searchCode.toLowerCase())
    if (byCodeAny) return byCodeAny.id
  }

  // 2. Матч по имени (с кодом)
  const byNameCode = colorByNameAndFt[`${searchName.toLowerCase()}|${ftId}`]
  if (byNameCode?.length === 1) return byNameCode[0].id
  if (byNameCode?.length > 1 && searchCode) {
    const exact = byNameCode.find(c => c.code?.toLowerCase() === searchCode.toLowerCase())
    if (exact) return exact.id
  }

  // 3. Матч по полному rawName как имени
  const byRawName = colorByNameAndFt[`${rawName.toLowerCase()}|${ftId}`]
  if (byRawName?.length >= 1) return byRawName[0].id

  // 4. Не нашли — создаём новый цвет
  const newColor = {
    name: searchName,
    code: searchCode || null,
    fabric_type_id: ftId,
    comment: 'создан при импорте, проверить',
    active: true,
  }
  const { data: created, error } = await db.from('colors').insert(newColor).select('id, name, code').single()
  if (error) {
    // Возможно уже есть с таким именем/кодом
    const { data: existing } = await db.from('colors')
      .select('id').eq('name', searchName).eq('fabric_type_id', ftId).limit(1).single()
    if (existing) return existing.id
    console.error(`   ❌ Не удалось создать цвет "${rawName}":`, error.message)
    return null
  }
  createdColors.push({ ...created, raw: rawName })
  // обновляем индексы
  if (created.code) colorByCodeAndFt[`${created.code.toLowerCase()}|${ftId}`] = created
  const nkey = `${created.name.toLowerCase()}|${ftId}`
  if (!colorByNameAndFt[nkey]) colorByNameAndFt[nkey] = []
  colorByNameAndFt[nkey].push(created)
  return created.id
}

// ─── 10. rolls ─────────────────────────────────────────────────────────────────
console.log('\n🪄 Импорт rolls…')
const rollsRaw = csv('inventory_rolls_draft.csv')
const warehouseId = locByName['склад']

for (const r of rollsRaw) {
  const colorId = await resolveColor(r.color, r.fabric_type)
  if (!colorId) { console.warn(`   ⚠ Пропускаю ${r.id}: цвет не определён`); continue }

  const locName = r.location.toLowerCase() === 'я' ? 'я' : r.location.toLowerCase()
  const locationId = locByName[locName]
  if (!locationId) { console.warn(`   ⚠ Локация не найдена: "${r.location}" для ${r.id}`); continue }

  const length = r.est_length_m ? parseFloat(r.est_length_m) : null
  if (!length) {
    // рулон без длины — ставим 0 и needs_remeasure
    console.warn(`   ⚠ ${r.id}: длина не указана, будет 0 (needs_remeasure=true)`)
  }

  const { error } = await db.from('rolls').upsert({
    human_id: r.id,
    color_id: colorId,
    initial_length_m: length || 0,
    current_length_m: length || 0,
    location_id: locationId,
    status: 'active',
    needs_remeasure: r.needs_remeasure === 'true',
    original_note: r.original_note || null,
    received_at: null,
  }, { onConflict: 'human_id', ignoreDuplicates: false })
  if (error) console.error(`   ❌ ${r.id}:`, error.message)
}

// Вставляем movements для всех рулонов (приход на склад / к швее)
const { data: allRolls } = await db.from('rolls').select('id, human_id, location_id')
const existingMovements = await db.from('movements').select('roll_id').not('roll_id', 'is', null)
const rolledSet = new Set((existingMovements.data || []).map(m => m.roll_id))

const movementsToInsert = allRolls
  .filter(r => !rolledSet.has(r.id))
  .map(r => ({
    roll_id: r.id,
    from_location_id: null,
    to_location_id: r.location_id,
    moved_at: '2025-08-30',
    note: 'начальный остаток',
  }))

if (movementsToInsert.length) {
  const { error } = await db.from('movements').insert(movementsToInsert)
  if (error) console.error('   ❌ movements для рулонов:', error.message)
}

const { data: rollsDB } = await db.from('rolls').select('id')
console.log(`   ✓ rolls: ${rollsDB.length}`)

// ─── 11. pieces ────────────────────────────────────────────────────────────────
console.log('\n✂️  Импорт pieces…')
const piecesRaw = csv('inventory_pieces_draft.csv')

for (const p of piecesRaw) {
  const colorId = await resolveColor(p.color, p.fabric_type)
  if (!colorId) { console.warn(`   ⚠ Пропускаю ${p.id}: цвет не определён`); continue }

  const locName = p.location.toLowerCase() === 'я' ? 'я' : p.location.toLowerCase()
  const locationId = locByName[locName]
  if (!locationId) { console.warn(`   ⚠ Локация не найдена: "${p.location}" для ${p.id}`); continue }

  const { error } = await db.from('pieces').upsert({
    human_id: p.id,
    color_id: colorId,
    length_m: p.length_m ? parseFloat(p.length_m) : null,
    width_m: p.width_m ? parseFloat(p.width_m) : null,
    location_id: locationId,
    status: 'active',
    needs_remeasure: p.needs_remeasure === 'true',
    original_note: p.original_note || null,
  }, { onConflict: 'human_id', ignoreDuplicates: false })
  if (error) console.error(`   ❌ ${p.id}:`, error.message)
}

// movements для кусков
const { data: allPieces } = await db.from('pieces').select('id, human_id, location_id')
const existingPieceMov = await db.from('movements').select('piece_id').not('piece_id', 'is', null)
const piecedSet = new Set((existingPieceMov.data || []).map(m => m.piece_id))

const pieceMov = allPieces
  .filter(p => !piecedSet.has(p.id))
  .map(p => ({
    piece_id: p.id,
    from_location_id: null,
    to_location_id: p.location_id,
    moved_at: '2025-08-30',
    note: 'начальный остаток',
  }))

if (pieceMov.length) {
  const { error } = await db.from('movements').insert(pieceMov)
  if (error) console.error('   ❌ movements для кусков:', error.message)
}

const { data: piecesDB } = await db.from('pieces').select('id')
console.log(`   ✓ pieces: ${piecesDB.length}`)

// ─── Итоги ────────────────────────────────────────────────────────────────────
console.log('\n✅ Импорт завершён. Сводка:')
const tables = ['suppliers','fabric_types','colors','color_suppliers','seamstresses','locations',
                 'product_types','sewing_prices','pricing_rules','rolls','pieces','movements']
for (const t of tables) {
  const { count } = await db.from(t).select('*', { count: 'exact', head: true })
  console.log(`   ${t}: ${count}`)
}

if (createdColors.length) {
  console.log(`\n⚠️  Созданы новые цвета при импорте (${createdColors.length} шт.) — проверить:`)
  for (const c of createdColors) {
    console.log(`   • "${c.name}"${c.code ? ` (${c.code})` : ''} ← из "${c.raw}"`)
  }
} else {
  console.log('\n🎉 Все цвета успешно сматчены, новых при импорте не создано')
}
