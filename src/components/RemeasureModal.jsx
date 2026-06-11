import { useState } from 'react'
import { supabase } from '../lib/supabase.js'

export default function RemeasureModal({ item, onClose, onDone }) {
  const [length, setLength] = useState(item.length_m ?? '')
  const [width, setWidth] = useState(item.width_m ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function save() {
    if (length === '') { setError('Введите длину'); return }
    setSaving(true)
    setError(null)
    const table = item.kind === 'roll' ? 'rolls' : 'pieces'
    const patch = { needs_remeasure: false }
    if (item.kind === 'roll') {
      patch.current_length_m = parseFloat(length)
    } else {
      patch.length_m = parseFloat(length)
      if (width !== '') patch.width_m = parseFloat(width)
    }
    const { error: err } = await supabase.from(table).update(patch).eq('id', item.id)
    setSaving(false)
    if (err) { setError(err.message); return }
    onDone()
  }

  return (
    <div style={overlay}>
      <div style={sheet}>
        <h3 style={{ fontWeight: 700, marginBottom: '1rem' }}>Перемерить {item.human_id}</h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div>
            <label>Фактическая длина, м</label>
            <input type="number" step="0.01" value={length} onChange={e => setLength(e.target.value)} inputMode="decimal" />
          </div>
          {item.kind === 'piece' && (
            <div>
              <label>Ширина, м (если изменилась)</label>
              <input type="number" step="0.01" value={width} onChange={e => setWidth(e.target.value)} inputMode="decimal" />
            </div>
          )}
          {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.875rem' }}>{error}</p>}
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
          <button className="btn-secondary" style={{ flex: 1 }} onClick={onClose} disabled={saving}>Отмена</button>
          <button className="btn-primary" style={{ flex: 1 }} onClick={save} disabled={saving}>
            {saving ? 'Сохраняю…' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  )
}

const overlay = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)',
  display: 'flex', alignItems: 'flex-end', zIndex: 100,
}
const sheet = {
  background: 'var(--color-surface)', borderRadius: '16px 16px 0 0',
  padding: '1.5rem 1rem 2rem', width: '100%', maxWidth: '600px', margin: '0 auto',
}
