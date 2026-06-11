import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'

export default function TransferPage({ initialItem, onDone }) {
  const [rolls, setRolls] = useState([])
  const [pieces, setPieces] = useState([])
  const [locations, setLocations] = useState([])
  const [selectedKind, setSelectedKind] = useState(initialItem?.kind || 'roll')
  const [selectedId, setSelectedId] = useState(initialItem?.id || '')
  const [toLocationId, setToLocationId] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.from('v_stock').select('id, human_id, color_name, code, location, kind').eq('kind', 'roll').order('human_id'),
      supabase.from('v_stock').select('id, human_id, color_name, code, location, kind').eq('kind', 'piece').order('human_id'),
      supabase.from('locations').select('id, name').order('name'),
    ]).then(([r, p, l]) => {
      setRolls(r.data || [])
      setPieces(p.data || [])
      setLocations(l.data || [])
    })
  }, [])

  const items = selectedKind === 'roll' ? rolls : pieces

  async function save() {
    setError(null)
    if (!selectedId) { setError('Выберите рулон или кусок'); return }
    if (!toLocationId) { setError('Выберите кому передать'); return }

    setSaving(true)
    const table = selectedKind === 'roll' ? 'rolls' : 'pieces'

    // get current location
    const { data: item } = await supabase.from(table).select('location_id').eq('id', selectedId).single()

    const movement = {
      from_location_id: item.location_id,
      to_location_id: toLocationId,
      moved_at: new Date().toISOString().slice(0, 10),
      note: note || null,
    }
    if (selectedKind === 'roll') movement.roll_id = selectedId
    else movement.piece_id = selectedId

    const { error: me } = await supabase.from('movements').insert(movement)
    if (me) { setSaving(false); setError(me.message); return }

    const { error: ue } = await supabase.from(table).update({ location_id: toLocationId }).eq('id', selectedId)
    if (ue) { setSaving(false); setError(ue.message); return }

    setSaving(false)
    setSuccess(true)
    setTimeout(onDone, 1200)
  }

  if (success) {
    return (
      <div className="empty-state">
        <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>✅</div>
        <div style={{ fontWeight: 600 }}>Передача записана</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <h2 style={{ fontWeight: 700, fontSize: '1.125rem' }}>Передать ткань</h2>

      <div>
        <label>Тип</label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {[['roll', 'Рулон'], ['piece', 'Кусок']].map(([k, label]) => (
            <button
              key={k}
              style={{ flex: 1, padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: '1.5px solid', borderColor: selectedKind === k ? 'var(--color-accent)' : 'var(--color-border)', background: selectedKind === k ? 'var(--color-accent-light)' : 'var(--color-surface)', color: selectedKind === k ? 'var(--color-accent)' : 'var(--color-text)', fontWeight: selectedKind === k ? 600 : 400 }}
              onClick={() => { setSelectedKind(k); setSelectedId('') }}
            >{label}</button>
          ))}
        </div>
      </div>

      <div>
        <label>Выберите {selectedKind === 'roll' ? 'рулон' : 'кусок'}</label>
        <select value={selectedId} onChange={e => setSelectedId(e.target.value)}>
          <option value="">— выберите —</option>
          {items.map(i => (
            <option key={i.id} value={i.id}>
              {i.human_id} · {i.color_name}{i.code ? ` (${i.code})` : ''} · {i.location}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label>Кому передать</label>
        <select value={toLocationId} onChange={e => setToLocationId(e.target.value)}>
          <option value="">— выберите —</option>
          {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </div>

      <div>
        <label>Заметка (необязательно)</label>
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="напр. для заказа Z-001" />
      </div>

      {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.875rem' }}>{error}</p>}

      <button className="btn-primary" onClick={save} disabled={saving}>
        {saving ? 'Записываю…' : 'Передать'}
      </button>
    </div>
  )
}
