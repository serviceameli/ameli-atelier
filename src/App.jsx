import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase.js'
import { getProfile, signOut } from './lib/auth.js'
import LoginPage from './pages/LoginPage.jsx'
import StockPage from './pages/StockPage.jsx'
import ReceivePage from './pages/ReceivePage.jsx'
import TransferPage from './pages/TransferPage.jsx'
import OrdersPage from './pages/OrdersPage.jsx'
import CalcPage from './pages/CalcPage.jsx'
import ConsumablesPage from './pages/ConsumablesPage.jsx'

const TABS = [
  {
    id: 'orders', label: 'Заказы',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
        <rect x="9" y="3" width="6" height="4" rx="1"/>
        <line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/>
      </svg>
    ),
  },
  {
    id: 'stock', label: 'Склад',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z"/>
        <path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
      </svg>
    ),
  },
  {
    id: 'consumables', label: 'Фурнитура',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>
      </svg>
    ),
  },
  {
    id: 'calc', label: 'Расчёт',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="2" width="16" height="20" rx="2"/>
        <line x1="8" y1="6" x2="16" y2="6"/>
        <line x1="8" y1="10" x2="16" y2="10"/>
        <line x1="8" y1="14" x2="11" y2="14"/>
        <line x1="8" y1="18" x2="11" y2="18"/>
        <line x1="14" y1="14" x2="16" y2="14"/>
        <line x1="14" y1="18" x2="16" y2="18"/>
      </svg>
    ),
  },
]

const TAB_TITLE = {
  orders: 'Заказы',
  stock: 'Склад ткани',
  consumables: 'Фурнитура',
  calc: 'Калькулятор',
}

export default function App() {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)
  const [tab, setTab] = useState('orders')
  const [stockView, setStockView] = useState('list') // 'list' | 'receive' | 'transfer'
  const [selectedItem, setSelectedItem] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) loadProfile(session.user.id)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) loadProfile(session.user.id)
      else setProfile(null)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function loadProfile(userId) {
    const p = await getProfile(userId)
    setProfile(p)
  }

  if (session === undefined) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100dvh' }}>
        <div className="spinner" />
      </div>
    )
  }

  if (!session) return <LoginPage onLogin={() => {}} />

  const isOwner = profile?.role === 'owner'

  // Заголовок шапки
  const headerTitle = stockView !== 'list'
    ? (stockView === 'receive' ? 'Приход ткани' : 'Передать ткань')
    : TAB_TITLE[tab]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      {/* Шапка */}
      <header style={{
        background: 'var(--color-surface)',
        borderBottom: '1px solid var(--color-border)',
        padding: '0.75rem 1rem',
        position: 'sticky', top: 0, zIndex: 10,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ fontWeight: 700, fontSize: '1.0625rem' }}>
          {headerTitle}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {profile && (
            <span style={{ fontSize: '0.8125rem', color: 'var(--color-muted)' }}>
              {profile.name || ''}
              {isOwner && (
                <span style={{
                  marginLeft: '0.375rem', fontSize: '0.6875rem', fontWeight: 700,
                  background: 'var(--color-accent)', color: 'var(--color-accent-fg)',
                  padding: '1px 6px', borderRadius: '999px',
                }}>owner</span>
              )}
            </span>
          )}
          <button
            className="btn-ghost"
            style={{ fontSize: '0.8125rem', padding: '0.25rem 0.5rem', color: 'var(--color-muted)' }}
            onClick={signOut}
          >Выйти</button>
        </div>
      </header>

      {/* Контент */}
      <main style={{ flex: 1, padding: '1rem', overflow: 'auto', paddingBottom: '5rem' }}>
        {tab === 'orders' && <OrdersPage profile={profile} />}
        {tab === 'consumables' && <ConsumablesPage />}
        {tab === 'calc' && <CalcPage />}
        {tab === 'stock' && stockView === 'list' && (
          <StockPage
            onTransfer={(item) => { setSelectedItem(item); setStockView('transfer') }}
            onReceive={() => setStockView('receive')}
          />
        )}
        {tab === 'stock' && stockView === 'receive' && (
          <ReceivePage onDone={() => setStockView('list')} onCancel={() => setStockView('list')} />
        )}
        {tab === 'stock' && stockView === 'transfer' && (
          <TransferPage
            initialItem={selectedItem}
            onDone={() => { setSelectedItem(null); setStockView('list') }}
            onCancel={() => { setSelectedItem(null); setStockView('list') }}
          />
        )}
      </main>

      {/* Нижняя навигация */}
      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'var(--color-surface)',
        borderTop: '1px solid var(--color-border)',
        display: 'flex',
        maxWidth: '600px', margin: '0 auto',
        paddingBottom: 'env(safe-area-inset-bottom)',
        zIndex: 20,
      }}>
        {TABS.map(t => {
          const active = tab === t.id && (t.id !== 'stock' || stockView === 'list')
          return (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); if (t.id === 'stock') setStockView('list') }}
              style={{
                flex: 1, background: 'none', border: 'none', borderRadius: 0,
                padding: '0.5rem 0 0.375rem',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem',
                color: active ? 'var(--color-accent-dark)' : 'var(--color-muted)',
              }}
            >
              {t.icon}
              <span style={{ fontSize: '0.6875rem', fontWeight: active ? 700 : 400 }}>{t.label}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
