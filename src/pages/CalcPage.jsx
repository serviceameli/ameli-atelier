import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'

export default function CalcPage() {
  const [fabricTypes, setFabricTypes] = useState([])
  const [productTypes, setProductTypes] = useState([])
  const [prices, setPrices] = useState([])
  const [rules, setRules] = useState([])
  const [loading, setLoading] = useState(true)

  // Поля калькулятора
  const [fabricId, setFabricId] = useState('')
  const [rows, setRows] = useState([{ productId: '', qty: 1 }])
  const [isUrgent, setIsUrgent] = useState(false)
  const [urgentPct, setUrgentPct] = useState(15)

  useEffect(() => {
    async function load() {
      const [{ data: ft }, { data: pt }, { data: pr }, { data: rl }] = await Promise.all([
        supabase.from('fabric_types').select('id, name').order('name'),
        supabase.from('product_types').select('id, name').order('name'),
        supabase.from('sewing_prices').select('*'),
        supabase.from('pricing_rules').select('*'),
      ])
      setFabricTypes(ft || [])
      setProductTypes(pt || [])
      setPrices(pr || [])
      setRules(rl || [])
      setLoading(false)
    }
    load()
  }, [])

  function addRow() { setRows(r => [...r, { productId: '', qty: 1 }]) }
  function removeRow(i) { setRows(r => r.filter((_, j) => j !== i)) }
  function setRow(i, k, v) { setRows(r => r.map((row, j) => j === i ? { ...row, [k]: v } : row)) }

  // Найти цену для конкретного изделия + ткань
  function findPrice(productId, fId) {
    if (!productId) return null
    // Сначала ищем точное совпадение по ткани
    const exact = prices.find(p =>
      p.product_type_id === productId &&
      p.fabric_type_id === (fId || null) &&
      p.includes_fabric
    )
    if (exact) return exact
    // Потом без ткани (для бантов и т.д.)
    const noFabric = prices.find(p =>
      p.product_type_id === productId &&
      p.fabric_type_id === null &&
      p.includes_fabric
    )
    if (noFabric) return noFabric
    // Потом по любой ткани с includes_fabric
    const byProduct = prices.find(p =>
      p.product_type_id === productId &&
      (fId ? p.fabric_type_id === fId : true) &&
      p.includes_fabric
    )
    return byProduct || null
  }

  // Подсчёт
  const lineItems = rows.map(row => {
    const priceRow = findPrice(row.productId, fabricId)
    const unitPrice = priceRow?.price_rub ?? null
    const total = unitPrice !== null ? unitPrice * (parseInt(row.qty) || 1) : null
    return { ...row, unitPrice, total, note: priceRow?.note }
  })

  const subtotal = lineItems.reduce((s, l) => s + (l.total ?? 0), 0)
  const urgentAdd = isUrgent ? Math.round(subtotal * urgentPct / 100) : 0
  const grandTotal = subtotal + urgentAdd

  const hasUnknown = lineItems.some(l => l.productId && l.unitPrice === null)

  // Правила для выбранной ткани
  const activeRules = rules.filter(r => !r.fabric_type_id || r.fabric_type_id === fabricId)

  if (loading) return <div style={{ textAlign: 'center', padding: '3rem' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', paddingBottom: '2rem' }}>
      <h2 style={{ fontWeight: 700, fontSize: '1.0625rem' }}>Калькулятор пошива</h2>

      {/* Тип ткани */}
      <div className="card" style={{ padding: '1rem' }}>
        <label>Тип ткани</label>
        <select value={fabricId} onChange={e => setFabricId(e.target.value)}>
          <option value="">— не выбрана (банты, без ткани) —</option>
          {fabricTypes.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </div>

      {/* Позиции */}
      <div className="card" style={{ padding: '1rem' }}>
        <div style={{ fontWeight: 600, marginBottom: '0.75rem', fontSize: '0.9375rem' }}>Позиции</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
          {rows.map((row, i) => {
            const line = lineItems[i]
            return (
              <div key={i}>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <select value={row.productId} onChange={e => setRow(i, 'productId', e.target.value)}>
                      <option value="">— изделие —</option>
                      {productTypes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <input
                    type="number" min="1" value={row.qty}
                    onChange={e => setRow(i, 'qty', e.target.value)}
                    style={{ width: '64px' }}
                  />
                  {rows.length > 1 && (
                    <button type="button" onClick={() => removeRow(i)}
                      style={{ padding: '0.65rem 0.75rem', background: 'var(--color-danger-light)', color: 'var(--color-danger)', borderRadius: 'var(--radius-sm)', flexShrink: 0 }}>
                      ✕
                    </button>
                  )}
                </div>
                {row.productId && (
                  <div style={{ marginTop: '0.25rem', fontSize: '0.8125rem', paddingLeft: '0.25rem' }}>
                    {line.unitPrice !== null ? (
                      <span style={{ color: 'var(--color-muted)' }}>
                        {line.unitPrice.toLocaleString('ru')} ₽ × {row.qty} = <strong style={{ color: 'var(--color-text)' }}>{line.total.toLocaleString('ru')} ₽</strong>
                        {line.note && <span style={{ marginLeft: '0.5rem', color: 'var(--color-muted)' }}>({line.note})</span>}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--color-warn)' }}>⚠ Нет цены для этой ткани</span>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <button type="button" className="btn-secondary" onClick={addRow}
          style={{ marginTop: '0.75rem', width: '100%', fontSize: '0.875rem' }}>
          + Добавить изделие
        </button>
      </div>

      {/* Срочность */}
      <div className="card" style={{ padding: '1rem' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: 0, cursor: 'pointer' }}>
          <input type="checkbox" checked={isUrgent} onChange={e => setIsUrgent(e.target.checked)} style={{ width: 'auto' }} />
          <span style={{ fontWeight: 500 }}>Срочный заказ</span>
        </label>
        {isUrgent && (
          <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <label style={{ margin: 0, whiteSpace: 'nowrap' }}>Наценка %</label>
            <input type="number" min="0" max="100" value={urgentPct}
              onChange={e => setUrgentPct(Number(e.target.value))}
              style={{ width: '80px' }} />
          </div>
        )}
      </div>

      {/* Итог */}
      {subtotal > 0 && (
        <div className="card" style={{ padding: '1rem', background: 'var(--color-accent-light)', border: '1.5px solid var(--color-accent)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9375rem' }}>
              <span style={{ color: 'var(--color-muted)' }}>Итого без срочности</span>
              <span>{subtotal.toLocaleString('ru')} ₽</span>
            </div>
            {isUrgent && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9375rem' }}>
                <span style={{ color: 'var(--color-muted)' }}>Срочность +{urgentPct}%</span>
                <span>+{urgentAdd.toLocaleString('ru')} ₽</span>
              </div>
            )}
            <div style={{ height: '1px', background: 'var(--color-accent-dark)', opacity: 0.3 }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '1.25rem' }}>
              <span>К оплате</span>
              <span>{grandTotal.toLocaleString('ru')} ₽</span>
            </div>
          </div>
        </div>
      )}

      {hasUnknown && (
        <p style={{ fontSize: '0.875rem', color: 'var(--color-warn)', padding: '0 0.25rem' }}>
          ⚠ Для некоторых позиций нет цены в прайсе — уточните вручную
        </p>
      )}

      {/* Правила */}
      {activeRules.length > 0 && (
        <div className="card" style={{ padding: '1rem' }}>
          <div style={{ fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--color-muted)' }}>Условия прайса</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
            {activeRules.map((r, i) => (
              <p key={i} style={{ fontSize: '0.8125rem', color: 'var(--color-muted)', lineHeight: 1.5 }}>
                {r.rule_text}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
