import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase.js'

// ─── Константы ─────────────────────────────────────────────────────────────

const STATUS_LABEL = {
  draft: 'Черновик',
  pending: 'Согласование',
  approved: 'Одобрен',
  fabric_needed: 'Нет ткани',
  in_progress: 'В работе',
  sewn: 'Пошито',
  done: 'Готово',
  cancelled: 'Отменён',
}

const STATUS_STYLE = {
  draft:         { bg: 'var(--color-border)',        color: 'var(--color-muted)' },
  pending:       { bg: 'var(--color-warn-light)',    color: '#92400e' },
  approved:      { bg: 'var(--color-accent-light)',  color: '#7c5a00' },
  fabric_needed: { bg: 'var(--color-danger-light)',  color: 'var(--color-danger)' },
  in_progress:   { bg: 'var(--color-info-light)',    color: '#0369a1' },
  sewn:          { bg: '#f0fdfa',                    color: '#0f766e' },
  done:          { bg: 'var(--color-success-light)', color: '#14532d' },
  cancelled:     { bg: 'var(--color-danger-light)',  color: 'var(--color-danger)' },
}

const KIND_LABEL = {
  sewing: 'Пошив',
  rework: 'Переделка',
  repair: 'Ремонт',
  purchase: 'Закупка',
}

const NEXT_STATUS = {
  draft: 'pending',
  pending: 'approved',
  approved: 'in_progress',
  in_progress: 'sewn',
  sewn: 'done',
}

const NEXT_ACTION = {
  draft: 'На согласование →',
  pending: 'Одобрить →',
  approved: 'Передать в работу →',
  in_progress: 'Отметить пошитым →',
  sewn: 'Закрыть заказ →',
}

const FILTER_TABS = [
  { id: 'active',    label: 'Активные',  statuses: ['approved','fabric_needed','in_progress'] },
  { id: 'all',       label: 'Все',       statuses: null },
  { id: 'draft',     label: 'Черновики', statuses: ['draft','pending'] },
  { id: 'sewn',      label: 'Пошито',    statuses: ['sewn'] },
  { id: 'done',      label: 'Готово',    statuses: ['done','cancelled'] },
]

// ─── Вспомогательные компоненты ────────────────────────────────────────────

function StatusBadge({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.draft
  return (
    <span className="badge" style={{ background: s.bg, color: s.color }}>
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}

function formatDate(d) {
  if (!d) return null
  const [y, m, day] = d.split('-')
  return `${day}.${m}.${y}`
}

function daysLeft(due) {
  if (!due) return null
  const diff = Math.ceil((new Date(due) - new Date()) / 86400000)
  return diff
}

// ─── Главный компонент ─────────────────────────────────────────────────────

export default function OrdersPage({ profile }) {
  const [view, setView] = useState('list')   // 'list' | 'new' | 'detail'
  const [orders, setOrders] = useState([])
  const [filter, setFilter] = useState('active')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)

  const loadOrders = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('orders')
      .select('*, seamstresses(name), order_items(id, qty, product_types(name))')
      .order('created_at', { ascending: false })
    setOrders(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { loadOrders() }, [loadOrders])

  function openDetail(order) {
    setSelected(order)
    setView('detail')
  }

  function backToList() {
    setSelected(null)
    setView('list')
    loadOrders()
  }

  if (view === 'new') return <NewOrderForm onDone={backToList} onCancel={() => setView('list')} />
  if (view === 'detail') return <OrderDetail order={selected} onBack={backToList} profile={profile} />

  // ─── Список ──────────────────────────────────────────────────────────────
  const tab = FILTER_TABS.find(t => t.id === filter)
  const visible = tab?.statuses
    ? orders.filter(o => tab.statuses.includes(o.status))
    : orders

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Фильтр по статусу */}
      <div style={{ display: 'flex', gap: '0.375rem', overflowX: 'auto', paddingBottom: '2px' }}>
        {FILTER_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setFilter(t.id)}
            style={{
              whiteSpace: 'nowrap', padding: '0.375rem 0.875rem',
              borderRadius: '999px', fontSize: '0.875rem',
              background: filter === t.id ? 'var(--color-accent)' : 'var(--color-surface)',
              color: filter === t.id ? 'var(--color-accent-fg)' : 'var(--color-muted)',
              border: filter === t.id ? 'none' : '1.5px solid var(--color-border)',
              fontWeight: filter === t.id ? 600 : 400,
            }}
          >{t.label}</button>
        ))}
      </div>

      {loading && <div style={{ textAlign: 'center', padding: '2rem' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>}

      {!loading && visible.length === 0 && (
        <div className="empty-state">Заказов нет</div>
      )}

      {visible.map(order => <OrderCard key={order.id} order={order} onClick={() => openDetail(order)} />)}

      {/* FAB — новый заказ */}
      <button
        className="btn-primary"
        onClick={() => setView('new')}
        style={{
          position: 'fixed', bottom: '1.5rem', right: '1rem',
          width: '56px', height: '56px', borderRadius: '50%',
          fontSize: '1.75rem', lineHeight: 1, padding: 0,
          boxShadow: '0 4px 12px rgba(0,0,0,.15)',
        }}
      >+</button>
    </div>
  )
}

// ─── Карточка заказа ───────────────────────────────────────────────────────

function OrderCard({ order, onClick }) {
  const days = daysLeft(order.due_date)
  const overdue = days !== null && days < 0
  const urgent = order.is_urgent

  return (
    <div className="card" onClick={onClick} style={{ padding: '0.875rem 1rem', cursor: 'pointer' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            {urgent && (
              <span style={{
                fontSize: '0.7rem', fontWeight: 700, padding: '1px 6px',
                borderRadius: '999px', background: 'var(--color-danger-light)',
                color: 'var(--color-danger)',
              }}>СРОЧНО</span>
            )}
            <span style={{ fontSize: '0.8125rem', color: 'var(--color-muted)' }}>
              {order.human_id ?? '—'} · {KIND_LABEL[order.kind]}
            </span>
          </div>
          <div style={{ fontWeight: 600, fontSize: '0.9375rem', marginBottom: '0.375rem' }}>
            {order.title}
          </div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--color-muted)', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {order.seamstresses?.name && <span>👩‍🧵 {order.seamstresses.name}</span>}
            {order.due_date && (
              <span style={{ color: overdue ? 'var(--color-danger)' : undefined }}>
                📅 {formatDate(order.due_date)}{days !== null ? ` (${overdue ? 'просрочен' : `${days} дн.`})` : ''}
              </span>
            )}
            {order.order_items?.length > 0 && (
              <span>📦 {order.order_items.reduce((s, i) => s + i.qty, 0)} шт.</span>
            )}
          </div>
        </div>
        <StatusBadge status={order.status} />
      </div>
    </div>
  )
}

// ─── Форма нового заказа ───────────────────────────────────────────────────

function NewOrderForm({ onDone, onCancel }) {
  const [seamstresses, setSeamstresses] = useState([])
  const [productTypes, setProductTypes] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const [form, setForm] = useState({
    title: '', kind: 'sewing', seamstress_id: '', due_date: '',
    is_urgent: false, requires_fabric: true, brief: '',
  })
  const [items, setItems] = useState([{ product_type_id: '', qty: 1, note: '' }])

  useEffect(() => {
    supabase.from('seamstresses').select('id, name').order('name').then(({ data }) => setSeamstresses(data || []))
    supabase.from('product_types').select('id, name').order('name').then(({ data }) => setProductTypes(data || []))
  }, [])

  function setField(k, v) { setForm(f => ({ ...f, [k]: v })) }

  function addItem() { setItems(i => [...i, { product_type_id: '', qty: 1, note: '' }]) }
  function removeItem(idx) { setItems(i => i.filter((_, j) => j !== idx)) }
  function setItem(idx, k, v) { setItems(i => i.map((it, j) => j === idx ? { ...it, [k]: v } : it)) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.title.trim()) return
    setSaving(true)
    setError(null)
    try {
      const { data: order, error: oErr } = await supabase
        .from('orders')
        .insert({
          title: form.title.trim(),
          kind: form.kind,
          seamstress_id: form.seamstress_id || null,
          due_date: form.due_date || null,
          is_urgent: form.is_urgent,
          requires_fabric: form.requires_fabric,
          brief: form.brief.trim() || null,
          status: 'draft',
        })
        .select()
        .single()
      if (oErr) throw oErr

      const validItems = items.filter(i => i.product_type_id)
      if (validItems.length > 0) {
        const { error: iErr } = await supabase.from('order_items').insert(
          validItems.map(i => ({
            order_id: order.id,
            product_type_id: i.product_type_id,
            qty: Number(i.qty) || 1,
            note: i.note.trim() || null,
          }))
        )
        if (iErr) throw iErr
      }
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
        <h2 style={{ fontSize: '1.0625rem', fontWeight: 700 }}>Новый заказ</h2>
      </div>

      {/* Основная информация */}
      <div className="card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div>
          <label>Название заказа *</label>
          <input value={form.title} onChange={e => setField('title', e.target.value)}
            placeholder="Скатерть круглая 330 см — Иванова" required />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div>
            <label>Тип</label>
            <select value={form.kind} onChange={e => setField('kind', e.target.value)}>
              {Object.entries(KIND_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label>Дата сдачи</label>
            <input type="date" value={form.due_date} onChange={e => setField('due_date', e.target.value)} />
          </div>
        </div>

        <div>
          <label>Швея</label>
          <select value={form.seamstress_id} onChange={e => setField('seamstress_id', e.target.value)}>
            <option value="">— не назначена —</option>
            {seamstresses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', gap: '1.5rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.is_urgent}
              onChange={e => setField('is_urgent', e.target.checked)} style={{ width: 'auto' }} />
            <span>Срочно</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.requires_fabric}
              onChange={e => setField('requires_fabric', e.target.checked)} style={{ width: 'auto' }} />
            <span>Нужна ткань</span>
          </label>
        </div>

        <div>
          <label>ТЗ для швеи</label>
          <textarea value={form.brief} onChange={e => setField('brief', e.target.value)}
            placeholder="Описание, размеры, особенности..."
            rows={3} style={{ resize: 'vertical' }} />
        </div>
      </div>

      {/* Позиции */}
      <div className="card" style={{ padding: '1rem' }}>
        <div style={{ fontWeight: 600, marginBottom: '0.75rem', fontSize: '0.9375rem' }}>Позиции заказа</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
          {items.map((item, idx) => (
            <div key={idx} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <select value={item.product_type_id}
                  onChange={e => setItem(idx, 'product_type_id', e.target.value)}>
                  <option value="">— выбрать изделие —</option>
                  {productTypes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <input type="number" min="1" value={item.qty}
                onChange={e => setItem(idx, 'qty', e.target.value)}
                style={{ width: '64px' }} />
              {items.length > 1 && (
                <button type="button" onClick={() => removeItem(idx)}
                  style={{ padding: '0.65rem 0.75rem', background: 'var(--color-danger-light)', color: 'var(--color-danger)', borderRadius: 'var(--radius-sm)' }}>
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
        <button type="button" className="btn-secondary"
          onClick={addItem}
          style={{ marginTop: '0.625rem', width: '100%', fontSize: '0.875rem' }}>
          + Добавить позицию
        </button>
      </div>

      {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.875rem' }}>{error}</p>}

      <button type="submit" className="btn-primary"
        disabled={saving || !form.title.trim()}
        style={{ width: '100%', padding: '0.875rem', fontSize: '1rem' }}>
        {saving ? 'Создаём…' : 'Создать заказ'}
      </button>
    </form>
  )
}

// ─── Детальный просмотр заказа ─────────────────────────────────────────────

function OrderDetail({ order: initialOrder, onBack, profile }) {
  const [order, setOrder] = useState(initialOrder)
  const [items, setItems] = useState([])
  const [saving, setSaving] = useState(false)
  const isOwner = profile?.role === 'owner'

  useEffect(() => {
    supabase
      .from('order_items')
      .select('*, product_types(name), colors(name)')
      .eq('order_id', order.id)
      .then(({ data }) => setItems(data || []))
  }, [order.id])

  async function advanceStatus() {
    const next = NEXT_STATUS[order.status]
    if (!next) return
    setSaving(true)
    const extra = next === 'in_progress' ? { given_at: new Date().toISOString().slice(0, 10) } : {}
    if (next === 'done') extra.returned_at = new Date().toISOString().slice(0, 10)
    const { data, error } = await supabase
      .from('orders')
      .update({ status: next, ...extra })
      .eq('id', order.id)
      .select('*, seamstresses(name)')
      .single()
    if (!error) setOrder(data)
    setSaving(false)
  }

  async function cancelOrder() {
    if (!confirm('Отменить заказ?')) return
    setSaving(true)
    const { data, error } = await supabase
      .from('orders')
      .update({ status: 'cancelled' })
      .eq('id', order.id)
      .select('*, seamstresses(name)')
      .single()
    if (!error) setOrder(data)
    setSaving(false)
  }

  const canAdvance = NEXT_STATUS[order.status] && order.status !== 'cancelled'
  const canCancel = isOwner && !['done', 'cancelled'].includes(order.status)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <button className="btn-ghost" style={{ padding: '0.25rem 0' }} onClick={onBack}>← Заказы</button>
        <span style={{ fontSize: '0.875rem', color: 'var(--color-muted)' }}>{order.human_id}</span>
      </div>

      {/* Шапка */}
      <div className="card" style={{ padding: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
          <h2 style={{ fontWeight: 700, fontSize: '1.0625rem', flex: 1, marginRight: '0.5rem' }}>{order.title}</h2>
          <StatusBadge status={order.status} />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.625rem 1.25rem', fontSize: '0.875rem', color: 'var(--color-muted)' }}>
          <span>📋 {KIND_LABEL[order.kind]}</span>
          {order.seamstresses?.name && <span>👩‍🧵 {order.seamstresses.name}</span>}
          {order.due_date && <span>📅 до {formatDate(order.due_date)}</span>}
          {order.given_at && <span>→ отдано {formatDate(order.given_at)}</span>}
          {order.returned_at && <span>← получено {formatDate(order.returned_at)}</span>}
          {order.is_urgent && <span style={{ color: 'var(--color-danger)', fontWeight: 600 }}>⚡ СРОЧНО</span>}
        </div>
      </div>

      {/* ТЗ */}
      {order.brief && (
        <div className="card" style={{ padding: '1rem' }}>
          <div style={{ fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--color-muted)' }}>ТЗ для швеи</div>
          <p style={{ fontSize: '0.9375rem', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{order.brief}</p>
        </div>
      )}

      {/* Позиции */}
      {items.length > 0 && (
        <div className="card" style={{ padding: '1rem' }}>
          <div style={{ fontWeight: 600, marginBottom: '0.75rem', fontSize: '0.875rem', color: 'var(--color-muted)' }}>
            Позиции ({items.reduce((s, i) => s + i.qty, 0)} шт.)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {items.map(item => (
              <div key={item.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '0.625rem 0.75rem', background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)',
              }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: '0.9375rem' }}>{item.product_types?.name}</div>
                  {item.colors?.name && <div style={{ fontSize: '0.8125rem', color: 'var(--color-muted)' }}>{item.colors.name}</div>}
                  {item.note && <div style={{ fontSize: '0.8125rem', color: 'var(--color-muted)' }}>{item.note}</div>}
                </div>
                <span style={{ fontWeight: 700, fontSize: '1.0625rem' }}>× {item.qty}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Действия */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem', paddingBottom: '2rem' }}>
        {canAdvance && (
          <button className="btn-primary" onClick={advanceStatus} disabled={saving}
            style={{ width: '100%', padding: '0.875rem', fontSize: '1rem' }}>
            {saving ? 'Сохраняем…' : NEXT_ACTION[order.status]}
          </button>
        )}
        {canCancel && (
          <button className="btn-danger" onClick={cancelOrder} disabled={saving}
            style={{ width: '100%' }}>
            Отменить заказ
          </button>
        )}
      </div>
    </div>
  )
}
