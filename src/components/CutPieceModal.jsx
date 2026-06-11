import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'

export default function CutPieceModal({ rollId, onClose, onDone }) {
  const [roll, setRoll] = useState(null)
  const [length, setLength] = useState('')
  const [width, setWidth] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    supabase.from('rolls').select('human_id, current_length_m, color_id, location_id').eq('id', rollId).single()
      .then(({ data }) => setRoll(data))
  }, [rollId])

  async function save() {
    if (!length) { setError('Введите длину куска'); return }
    const len = parseFloat(length)
    if (len <= 0 || len > roll.current_length_m) {
      setError(`Длина должна быть от 0.01 до ${roll.current_length_m} м`)
      return
    }
    setSaving(true); setError(null)

    // get next piece human_id
    const { data: lastPiece } = await supabase
      .from('pieces').select('human_id').order('human_id', { ascending: false }).limit(1)
    const nextNum = lastPiece?.length
      ? parseInt(lastPiece[0].human_id.replace('P-', ''), 10) + 1
      : 1
    const human_id = `P-${String(nextNum).padStart(3, '0')}`

    const { error: pieceErr } = await supabase.from('pieces').insert({
      human_id,
      color_id: roll.color_id,
      length_m: len,
      width_m: width ? parseFloat(width) : null,
      location_id: roll.location_id,
      source_roll_id: rollId,
    })
    if (pieceErr) { setSaving(false); setError(pieceErr.message); return }

    const { error: rollErr } = await supabase.from('rolls')
      .update({ current_length_m: roll.current_length_m - len })
      .eq('id', rollId)
    if (rollErr) { setSaving(false); setError(rollErr.message); return }

    setSaving(false)
    onDone()
  }

  if (!roll) return null

  return (
    <div style={overlay}>
      <div style={sheet}>
        <h3 style={{ fontWeight: 700, marginBottom: '0.5rem' }}>Создать кусок из {roll.human_id}</h3>
        <p style={{ color: 'var(--color-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>
          Остаток рулона: {roll.current_length_m} м
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div>
            <label>Длина куска, м</label>
            <input type="number" step="0.01" value={length} onChange={e => setLength(e.target.value)} inputMode="decimal" />
          </div>
          <div>
            <label>Ширина куска, м (необязательно)</label>
            <input type="number" step="0.01" value={width} onChange={e => setWidth(e.target.value)} inputMode="decimal" />
          </div>
          {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.875rem' }}>{error}</p>}
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
          <button className="btn-secondary" style={{ flex: 1 }} onClick={onClose} disabled={saving}>Отмена</button>
          <button className="btn-primary" style={{ flex: 1 }} onClick={save} disabled={saving}>
            {saving ? 'Создаю…' : 'Создать кусок'}
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
