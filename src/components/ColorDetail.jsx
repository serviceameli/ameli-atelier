import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'

export default function ColorDetail({ colorId, colorName, code, fabricType, onBack, onTransfer, onRemeasure, onCutPiece, remeasureModal, cutPieceModal }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('v_stock')
      .select('*')
      .eq('color_id', colorId)
      .order('kind')
      .order('human_id')
      .then(({ data, error }) => {
        if (!error) setItems(data || [])
        setLoading(false)
      })
  }, [colorId])

  return (
    <div>
      {remeasureModal}
      {cutPieceModal}
      <button className="btn-ghost" onClick={onBack} style={{ marginBottom: '0.75rem', padding: '0.25rem 0' }}>
        ← Назад
      </button>
      <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '0.25rem' }}>
        {colorName} {code && <span style={{ fontWeight: 400, color: 'var(--color-muted)', fontSize: '0.9rem' }}>{code}</span>}
      </h2>
      <p style={{ color: 'var(--color-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>{fabricType}</p>

      {loading && <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><div className="spinner" /></div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {items.map(item => (
          <div key={item.id} className="card" style={{ padding: '0.875rem 1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
              <div>
                <span style={{ fontWeight: 600, fontSize: '0.9375rem' }}>
                  {item.kind === 'roll' ? '🪄' : '✂️'} {item.human_id}
                </span>
                <span style={{ marginLeft: '0.5rem', fontSize: '0.8125rem', color: 'var(--color-muted)' }}>
                  {item.location}
                </span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700 }}>
                  {item.length_m != null ? `${fmt(item.length_m)} м` : '? м'}
                </div>
                {item.width_m && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}>
                    ш. {fmt(item.width_m)} м
                  </div>
                )}
              </div>
            </div>

            {(item.reserved_m > 0 || item.needs_remeasure || item.original_note) && (
              <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                {item.reserved_m > 0 && (
                  <div style={{ fontSize: '0.8125rem', color: 'var(--color-muted)' }}>
                    Бронь: {fmt(item.reserved_m)} м · Свободно: {fmt(item.available_m)} м
                  </div>
                )}
                {item.needs_remeasure && (
                  <span className="badge badge-warn">⚠ требует переучёта</span>
                )}
                {item.original_note && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)', fontStyle: 'italic' }}>
                    {item.original_note}
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
              <button
                className="btn-secondary"
                style={{ fontSize: '0.8125rem', padding: '0.4rem 0.75rem' }}
                onClick={() => onTransfer({ kind: item.kind, id: item.id, human_id: item.human_id })}
              >
                Передать
              </button>
              <button
                className="btn-secondary"
                style={{ fontSize: '0.8125rem', padding: '0.4rem 0.75rem' }}
                onClick={() => onRemeasure({ kind: item.kind, id: item.id, human_id: item.human_id, length_m: item.length_m, width_m: item.width_m })}
              >
                Перемерить
              </button>
              {item.kind === 'roll' && (
                <button
                  className="btn-secondary"
                  style={{ fontSize: '0.8125rem', padding: '0.4rem 0.75rem' }}
                  onClick={() => onCutPiece(item.id)}
                >
                  Создать кусок
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function fmt(v) {
  if (v == null) return '?'
  return Number(v) % 1 === 0 ? Number(v).toFixed(0) : Number(v).toFixed(2).replace(/\.?0+$/, '')
}
