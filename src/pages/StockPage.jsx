import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase.js'
import ColorDetail from '../components/ColorDetail.jsx'
import RemeasureModal from '../components/RemeasureModal.jsx'
import CutPieceModal from '../components/CutPieceModal.jsx'

export default function StockPage({ onTransfer, onReceive }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [fabricFilter, setFabricFilter] = useState('')
  const [fabricTypes, setFabricTypes] = useState([])
  const [selected, setSelected] = useState(null) // color row for detail
  const [remeasure, setRemeasure] = useState(null) // { kind, id, human_id }
  const [cutPiece, setCutPiece] = useState(null) // roll id

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [stockRes, ftRes] = await Promise.all([
      supabase.from('v_stock_by_color').select('*').order('fabric_type').order('color_name'),
      supabase.from('fabric_types').select('name').order('name'),
    ])
    if (stockRes.error) { setError(stockRes.error.message); setLoading(false); return }
    setRows(stockRes.data || [])
    setFabricTypes((ftRes.data || []).map(r => r.name))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = rows.filter(r => {
    const q = search.toLowerCase()
    const matchSearch = !q || r.color_name?.toLowerCase().includes(q) || r.code?.toLowerCase().includes(q)
    const matchType = !fabricFilter || r.fabric_type === fabricFilter
    return matchSearch && matchType
  })

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><div className="spinner" /></div>
  if (error) return <div style={{ color: 'var(--color-danger)', padding: '1rem' }}>Ошибка: {error}</div>

  if (selected) {
    return (
      <ColorDetail
        colorId={selected.color_id}
        colorName={selected.color_name}
        code={selected.code}
        fabricType={selected.fabric_type}
        onBack={() => setSelected(null)}
        onTransfer={onTransfer}
        onRemeasure={(item) => setRemeasure(item)}
        onCutPiece={(rollId) => setCutPiece(rollId)}
        onRefresh={() => { load(); setSelected(null) }}
        remeasureModal={remeasure && (
          <RemeasureModal item={remeasure} onClose={() => setRemeasure(null)} onDone={() => { setRemeasure(null); load() }} />
        )}
        cutPieceModal={cutPiece && (
          <CutPieceModal rollId={cutPiece} onClose={() => setCutPiece(null)} onDone={() => { setCutPiece(null); load() }} />
        )}
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {onReceive && (
        <button className="btn-primary" onClick={onReceive}
          style={{ width: '100%', padding: '0.75rem', fontWeight: 600 }}>
          + Приход ткани
        </button>
      )}
      <input
        placeholder="Поиск по названию или коду…"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />
      {fabricTypes.length > 0 && (
        <select value={fabricFilter} onChange={e => setFabricFilter(e.target.value)}>
          <option value="">Все типы ткани</option>
          {fabricTypes.map(ft => <option key={ft} value={ft}>{ft}</option>)}
        </select>
      )}

      {filtered.length === 0 && (
        <div className="empty-state">Ничего не найдено</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {filtered.map(row => (
          <button
            key={row.color_id}
            className="card"
            onClick={() => setSelected(row)}
            style={{
              display: 'flex', alignItems: 'flex-start',
              justifyContent: 'space-between', gap: '0.75rem',
              padding: '0.875rem 1rem', textAlign: 'left',
              border: '1px solid var(--color-border)', borderRadius: 'var(--radius)',
              background: 'var(--color-surface)', width: '100%',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: '1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {row.color_name}
                {row.code && <span style={{ fontWeight: 400, color: 'var(--color-muted)', marginLeft: '0.4rem', fontSize: '0.875rem' }}>{row.code}</span>}
              </div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--color-muted)', marginTop: '0.2rem' }}>
                {row.fabric_type}
              </div>
              {row.items_to_remeasure > 0 && (
                <span className="badge badge-warn" style={{ marginTop: '0.35rem' }}>
                  ⚠ Перемерить: {row.items_to_remeasure}
                </span>
              )}
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontWeight: 700, fontSize: '1.0625rem' }}>
                {fmt(row.available_m)} м
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}>
                всего {fmt(row.total_m)}
                {row.reserved_m > 0 && ` · брон. ${fmt(row.reserved_m)}`}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

function fmt(v) {
  if (v == null) return '?'
  return Number(v) % 1 === 0 ? Number(v).toFixed(0) : Number(v).toFixed(1)
}
