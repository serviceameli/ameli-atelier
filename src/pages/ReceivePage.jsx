import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'

export default function ReceivePage({ onDone }) {
  const [colors, setColors] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [locations, setLocations] = useState([])
  const [fabricTypes, setFabricTypes] = useState([])

  const [colorId, setColorId] = useState('')
  const [newColorName, setNewColorName] = useState('')
  const [newColorCode, setNewColorCode] = useState('')
  const [newColorFabricType, setNewColorFabricType] = useState('')
  const [isNewColor, setIsNewColor] = useState(false)

  const [rollCount, setRollCount] = useState(1)
  const [rollLengths, setRollLengths] = useState([''])
  const [supplierId, setSupplierId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [receivedAt, setReceivedAt] = useState(new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.from('colors').select('id, name, code, fabric_type_id, fabric_types(name)').eq('active', true).order('name'),
      supabase.from('suppliers').select('id, name').order('name'),
      supabase.from('locations').select('id, name, kind').order('name'),
      supabase.from('fabric_types').select('id, name').order('name'),
    ]).then(([c, s, l, ft]) => {
      setColors(c.data || [])
      setSuppliers(s.data || [])
      const warehouse = (l.data || []).find(loc => loc.kind === 'warehouse')
      setLocations(l.data || [])
      setLocationId(warehouse?.id || '')
      setFabricTypes(ft.data || [])
    })
  }, [])

  function handleRollCount(n) {
    const cnt = Math.max(1, parseInt(n) || 1)
    setRollCount(cnt)
    setRollLengths(arr => {
      const copy = [...arr]
      while (copy.length < cnt) copy.push('')
      return copy.slice(0, cnt)
    })
  }

  async function save() {
    setError(null)
    if (!isNewColor && !colorId) { setError('Выберите цвет'); return }
    if (isNewColor && !newColorName) { setError('Введите название цвета'); return }
    if (isNewColor && !newColorFabricType) { setError('Выберите тип ткани'); return }
    if (!locationId) { setError('Выберите локацию'); return }
    if (rollLengths.some(l => !l || parseFloat(l) <= 0)) { setError('Введите длину для каждого рулона'); return }

    setSaving(true)
    let finalColorId = colorId

    if (isNewColor) {
      const ft = fabricTypes.find(f => f.id === newColorFabricType)
      const { data, error: ce } = await supabase.from('colors').insert({
        name: newColorName.trim(),
        code: newColorCode.trim() || null,
        fabric_type_id: newColorFabricType,
      }).select('id').single()
      if (ce) { setSaving(false); setError(ce.message); return }
      finalColorId = data.id
    }

    // get next roll human_id
    const { data: lastRoll } = await supabase
      .from('rolls').select('human_id').order('human_id', { ascending: false }).limit(1)
    let nextNum = lastRoll?.length ? parseInt(lastRoll[0].human_id.replace('R-', ''), 10) + 1 : 1

    const rollsToInsert = rollLengths.map(len => ({
      human_id: `R-${String(nextNum++).padStart(3, '0')}`,
      color_id: finalColorId,
      initial_length_m: parseFloat(len),
      current_length_m: parseFloat(len),
      location_id: locationId,
      supplier_id: supplierId || null,
      received_at: receivedAt,
    }))

    const { data: insertedRolls, error: re } = await supabase.from('rolls').insert(rollsToInsert).select('id')
    if (re) { setSaving(false); setError(re.message); return }

    // create movements: from null → warehouse
    const movements = insertedRolls.map(r => ({
      roll_id: r.id,
      from_location_id: null,
      to_location_id: locationId,
      moved_at: receivedAt,
      note: 'Приход от поставщика',
    }))
    const { error: me } = await supabase.from('movements').insert(movements)
    if (me) { setSaving(false); setError(me.message); return }

    setSaving(false)
    setSuccess(true)
    setTimeout(onDone, 1200)
  }

  if (success) {
    return (
      <div className="empty-state">
        <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>✅</div>
        <div style={{ fontWeight: 600 }}>Приход записан</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <h2 style={{ fontWeight: 700, fontSize: '1.125rem' }}>Новый приход ткани</h2>

      <div>
        <label>Цвет</label>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <button
            style={{ flex: 1, padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: '1.5px solid', borderColor: !isNewColor ? 'var(--color-accent)' : 'var(--color-border)', background: !isNewColor ? 'var(--color-accent-light)' : 'var(--color-surface)', color: !isNewColor ? 'var(--color-accent)' : 'var(--color-text)', fontWeight: !isNewColor ? 600 : 400 }}
            onClick={() => setIsNewColor(false)}
          >Из справочника</button>
          <button
            style={{ flex: 1, padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: '1.5px solid', borderColor: isNewColor ? 'var(--color-accent)' : 'var(--color-border)', background: isNewColor ? 'var(--color-accent-light)' : 'var(--color-surface)', color: isNewColor ? 'var(--color-accent)' : 'var(--color-text)', fontWeight: isNewColor ? 600 : 400 }}
            onClick={() => setIsNewColor(true)}
          >Новый цвет</button>
        </div>

        {!isNewColor ? (
          <select value={colorId} onChange={e => setColorId(e.target.value)}>
            <option value="">— выберите цвет —</option>
            {colors.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}{c.code ? ` (${c.code})` : ''} · {c.fabric_types?.name}
              </option>
            ))}
          </select>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <input placeholder="Название цвета" value={newColorName} onChange={e => setNewColorName(e.target.value)} />
            <input placeholder="Код (необязательно)" value={newColorCode} onChange={e => setNewColorCode(e.target.value)} />
            <select value={newColorFabricType} onChange={e => setNewColorFabricType(e.target.value)}>
              <option value="">— тип ткани —</option>
              {fabricTypes.map(ft => <option key={ft.id} value={ft.id}>{ft.name}</option>)}
            </select>
          </div>
        )}
      </div>

      <div>
        <label>Количество рулонов</label>
        <input type="number" min="1" max="20" value={rollCount} onChange={e => handleRollCount(e.target.value)} inputMode="numeric" />
      </div>

      <div>
        <label>Длина каждого рулона, м</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {rollLengths.map((l, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ color: 'var(--color-muted)', minWidth: '1.5rem', fontSize: '0.875rem' }}>#{i + 1}</span>
              <input
                type="number" step="0.1" value={l} inputMode="decimal"
                placeholder="напр. 32"
                onChange={e => setRollLengths(arr => arr.map((x, j) => j === i ? e.target.value : x))}
              />
            </div>
          ))}
        </div>
      </div>

      <div>
        <label>Поставщик (необязательно)</label>
        <select value={supplierId} onChange={e => setSupplierId(e.target.value)}>
          <option value="">— без поставщика —</option>
          {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      <div>
        <label>Локация прихода</label>
        <select value={locationId} onChange={e => setLocationId(e.target.value)}>
          <option value="">— выберите —</option>
          {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </div>

      <div>
        <label>Дата прихода</label>
        <input type="date" value={receivedAt} onChange={e => setReceivedAt(e.target.value)} />
      </div>

      {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.875rem' }}>{error}</p>}

      <button className="btn-primary" style={{ marginTop: '0.25rem' }} onClick={save} disabled={saving}>
        {saving ? 'Записываю…' : 'Записать приход'}
      </button>
    </div>
  )
}
