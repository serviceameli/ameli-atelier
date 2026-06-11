import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase.js'

const CATEGORY_LABEL = {
  'молнии':  'Молнии',
  'потайные молнии на подушку': 'Потайные молнии',
  'бегунки': 'Бегунки',
  'резинки':  'Резинки',
  'липучки':  'Липучки',
  'бахрома':  'Бахрома',
  'лента шторная': 'Лента шторная',
  'нитки швейные': 'Нитки',
  'прочее':   'Прочее',
}

function catLabel(cat) {
  return CATEGORY_LABEL[cat?.toLowerCase()] ?? (cat ? cat[0].toUpperCase() + cat.slice(1) : 'Прочее')
}

export default function ConsumablesPage() {
  const [view, setView] = useState('list') // 'list' | 'detail' | 'receipt'
  const [items, setItems] = useState([])
  const [locations, setLocations] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: consumables }, { data: stock }, { data: locs }] = await Promise.all([
      supabase.from('consumables').select('*').order('category').order('name'),
      supabase.from('consumable_stock').select('*'),
      supabase.from('locations').select('id, name, kind').order('name'),
    ])

    // Агрегируем stock по consumable
    const stockMap = {}
    for (const s of stock || []) {
      if (!stockMap[s.consumable_id]) stockMap[s.consumable_id] = []
      stockMap[s.consumable_id].push(s)
    }

    setItems((consumables || []).map(c => ({
      ...c,
      stock: stockMap[c.id] || [],
      totalQty: (stockMap[c.id] || []).reduce((s, r) => s + Number(r.qty), 0),
    })))
    setLocations(locs || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  if (view === 'receipt') return <ReceiptForm locations={locations} onDone={() => { setView('list'); load() }} onCancel={() => setView('list')} />
  if (view === 'detail' && selected) return <ConsumableDetail item={selected} locations={locations} onBack={() => { setSelected(null); setView('list'); load() }} />

  const filtered = items.filter(i =>
    !search || i.name.toLowerCase().includes(search.toLowerCase())
  )

  // Группируем по категории
  const groups = {}
  for (const item of filtered) {
    const cat = item.category || 'прочее'
    if (!groups[cat]) groups[cat] = []
    groups[cat].push(item)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', paddingBottom: '5rem' }}>
      <input
        placeholder="Поиск по названию…"
        value={search} onChange={e => setSearch(e.target.value)}
      />

      {loading && <div style={{ textAlign: 'center', padding: '2rem' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>}

      {!loading && Object.entries(groups).map(([cat, catItems]) => (
        <div key={cat}>
          <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem', paddingLeft: '0.25rem' }}>
            {catLabel(cat)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
            {catItems.map(item => (
              <div key={item.id} className="card" onClick={() => { setSelected(item); setView('detail') }}
                style={{ padding: '0.75rem 1rem', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: '0.9375rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.name}
                  </div>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--color-muted)', marginTop: '0.125rem' }}>
                    {item.stock.length > 0
                      ? item.stock.map(s => {
                          const loc = locations.find(l => l.id === s.location_id)
                          return `${loc?.name ?? '?'}: ${Number(s.qty)} ${item.unit}`
                        }).join(' · ')
                      : 'Нет на складе'}
                  </div>
                </div>
                <div style={{ fontWeight: 700, fontSize: '1.0625rem', marginLeft: '0.75rem', flexShrink: 0 }}>
                  {item.totalQty} <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--color-muted)' }}>{item.unit}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {!loading && filtered.length === 0 && <div className="empty-state">Ничего не найдено</div>}

      <button className="btn-primary" onClick={() => setView('receipt')}
        style={{ position: 'fixed', bottom: '1.5rem', right: '1rem', width: '56px', height: '56px', borderRadius: '50%', fontSize: '1.75rem', lineHeight: 1, padding: 0, boxShadow: '0 4px 12px rgba(0,0,0,.15)' }}>
        +
      </button>
    </div>
  )
}

// ─── Детальная карточка расходника ─────────────────────────────────────────

function ConsumableDetail({ item, locations, onBack }) {
  const [adjustMode, setAdjustMode] = useState(false)
  const [locId, setLocId] = useState(locations[0]?.id || '')
  const [qty, setQty] = useState('')
  const [saving, setSaving] = useState(false)

  async function saveAdjust() {
    if (!qty || !locId) return
    setSaving(true)
    await supabase.from('consumable_stock').upsert({
      consumable_id: item.id,
      location_id: locId,
      qty: parseFloat(qty),
      updated_at: new Date().toISOString().slice(0, 10),
    })
    setSaving(false)
    onBack()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', paddingBottom: '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <button className="btn-ghost" style={{ padding: '0.25rem 0' }} onClick={onBack}>← Назад</button>
      </div>

      <div className="card" style={{ padding: '1rem' }}>
        <div style={{ fontWeight: 700, fontSize: '1.0625rem', marginBottom: '0.25rem' }}>{item.name}</div>
        <div style={{ fontSize: '0.8125rem', color: 'var(--color-muted)' }}>{catLabel(item.category)} · {item.unit}</div>
      </div>

      {/* Остатки по локациям */}
      <div className="card" style={{ padding: '1rem' }}>
        <div style={{ fontWeight: 600, marginBottom: '0.75rem', fontSize: '0.875rem', color: 'var(--color-muted)' }}>Остатки по локациям</div>
        {item.stock.length === 0 && <p style={{ color: 'var(--color-muted)', fontSize: '0.875rem' }}>Нет данных</p>}
        {item.stock.map(s => {
          const loc = locations.find(l => l.id === s.location_id)
          return (
            <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--color-border)' }}>
              <span style={{ color: 'var(--color-muted)' }}>{loc?.name ?? '?'}</span>
              <span style={{ fontWeight: 600 }}>{Number(s.qty)} {item.unit}</span>
            </div>
          )
        })}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', fontWeight: 700 }}>
          <span>Всего</span>
          <span>{item.totalQty} {item.unit}</span>
        </div>
      </div>

      {/* Корректировка остатка */}
      {!adjustMode ? (
        <button className="btn-secondary" onClick={() => setAdjustMode(true)} style={{ width: '100%' }}>
          Скорректировать остаток
        </button>
      ) : (
        <div className="card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ fontWeight: 600 }}>Новый остаток</div>
          <div>
            <label>Локация</label>
            <select value={locId} onChange={e => setLocId(e.target.value)}>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div>
            <label>Количество ({item.unit})</label>
            <input type="number" min="0" value={qty} onChange={e => setQty(e.target.value)} placeholder="0" />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn-primary" onClick={saveAdjust} disabled={saving || !qty} style={{ flex: 1 }}>
              {saving ? 'Сохраняем…' : 'Сохранить'}
            </button>
            <button className="btn-secondary" onClick={() => setAdjustMode(false)} style={{ flex: 1 }}>Отмена</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Форма нового прихода ───────────────────────────────────────────────────

function ReceiptForm({ locations, onDone, onCancel }) {
  const [consumables, setConsumables] = useState([])
  const [form, setForm] = useState({ consumable_id: '', location_id: locations[0]?.id || '', qty: '', note: '' })
  const [newName, setNewName] = useState('')
  const [newCat, setNewCat] = useState('прочее')
  const [newUnit, setNewUnit] = useState('шт')
  const [mode, setMode] = useState('existing') // 'existing' | 'new'
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    supabase.from('consumables').select('id, name, category, unit').order('category').order('name')
      .then(({ data }) => setConsumables(data || []))
  }, [])

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      let consumableId = form.consumable_id

      if (mode === 'new') {
        if (!newName.trim()) throw new Error('Введите название')
        const { data, error } = await supabase.from('consumables')
          .insert({ name: newName.trim(), category: newCat, unit: newUnit })
          .select('id').single()
        if (error) throw error
        consumableId = data.id
      }

      if (!consumableId) throw new Error('Выберите расходник')
      if (!form.qty) throw new Error('Введите количество')

      const { error: rErr } = await supabase.from('consumable_receipts').insert({
        consumable_id: consumableId,
        location_id: form.location_id,
        qty: parseFloat(form.qty),
        received_at: new Date().toISOString().slice(0, 10),
        note: form.note.trim() || null,
      })
      if (rErr) throw rErr
      onDone()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <button type="button" className="btn-ghost" style={{ padding: '0.25rem 0' }} onClick={onCancel}>← Назад</button>
        <h2 style={{ fontWeight: 700, fontSize: '1.0625rem' }}>Приход фурнитуры</h2>
      </div>

      <div className="card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="button" onClick={() => setMode('existing')}
            style={{ flex: 1, padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: '1.5px solid', borderColor: mode === 'existing' ? 'var(--color-accent)' : 'var(--color-border)', background: mode === 'existing' ? 'var(--color-accent-light)' : 'var(--color-surface)', fontWeight: mode === 'existing' ? 600 : 400 }}>
            Существующий
          </button>
          <button type="button" onClick={() => setMode('new')}
            style={{ flex: 1, padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: '1.5px solid', borderColor: mode === 'new' ? 'var(--color-accent)' : 'var(--color-border)', background: mode === 'new' ? 'var(--color-accent-light)' : 'var(--color-surface)', fontWeight: mode === 'new' ? 600 : 400 }}>
            Новый
          </button>
        </div>

        {mode === 'existing' ? (
          <div>
            <label>Расходник</label>
            <select value={form.consumable_id} onChange={e => setF('consumable_id', e.target.value)} required>
              <option value="">— выбрать —</option>
              {consumables.map(c => <option key={c.id} value={c.id}>{c.name} ({c.unit})</option>)}
            </select>
          </div>
        ) : (
          <>
            <div><label>Название</label><input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Молния рулонная s-226 голубой сапфир" /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label>Категория</label>
                <select value={newCat} onChange={e => setNewCat(e.target.value)}>
                  {['молнии','потайные молнии','бегунки','резинки','липучки','бахрома','лента шторная','нитки','прочее'].map(c =>
                    <option key={c} value={c}>{catLabel(c)}</option>)}
                </select>
              </div>
              <div>
                <label>Единица</label>
                <select value={newUnit} onChange={e => setNewUnit(e.target.value)}>
                  {['шт','м','моток'].map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>
          </>
        )}

        <div>
          <label>Локация</label>
          <select value={form.location_id} onChange={e => setF('location_id', e.target.value)}>
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div>
          <label>Количество</label>
          <input type="number" min="0.1" step="0.1" value={form.qty} onChange={e => setF('qty', e.target.value)} placeholder="0" required />
        </div>
        <div>
          <label>Примечание</label>
          <input value={form.note} onChange={e => setF('note', e.target.value)} placeholder="Необязательно" />
        </div>
      </div>

      {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.875rem' }}>{error}</p>}

      <button type="submit" className="btn-primary" disabled={saving} style={{ width: '100%', padding: '0.875rem' }}>
        {saving ? 'Сохраняем…' : 'Добавить приход'}
      </button>
    </form>
  )
}
