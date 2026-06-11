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
  { id: 'orders', label: 'Заказы' },
  { id: 'stock', label: 'Склад' },
  { id: 'consumables', label: 'Фурнитура' },
  { id: 'calc', label: 'Калькулятор' },
  { id: 'receive', label: 'Приход' },
  { id: 'transfer', label: 'Передать' },
]

export default function App() {
  const [session, setSession] = useState(undefined) // undefined = loading
  const [profile, setProfile] = useState(null)
  const [tab, setTab] = useState('orders')
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

  // Загрузка
  if (session === undefined) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100dvh' }}>
        <div className="spinner" />
      </div>
    )
  }

  // Не авторизован
  if (!session) {
    return <LoginPage onLogin={() => {}} />
  }

  const isOwner = profile?.role === 'owner'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      <header style={{
        background: 'var(--color-surface)',
        borderBottom: '1px solid var(--color-border)',
        padding: '0.875rem 1rem 0',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <div style={{ fontWeight: 700, fontSize: '1.0625rem' }}>
            Амели · Склад ткани
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            {profile && (
              <span style={{ fontSize: '0.8125rem', color: 'var(--color-muted)' }}>
                {profile.name || session.user.email}
                {isOwner && (
                  <span style={{
                    marginLeft: '0.375rem', fontSize: '0.7rem', fontWeight: 600,
                    background: 'var(--color-accent-light)', color: 'var(--color-accent)',
                    padding: '1px 6px', borderRadius: '999px',
                  }}>owner</span>
                )}
              </span>
            )}
            <button
              className="btn-ghost"
              style={{ fontSize: '0.8125rem', padding: '0.25rem 0.5rem' }}
              onClick={signOut}
            >Выйти</button>
          </div>
        </div>
        <nav style={{ display: 'flex' }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                flex: 1, background: 'none', border: 'none',
                borderBottom: tab === t.id ? '2px solid var(--color-accent)' : '2px solid transparent',
                color: tab === t.id ? 'var(--color-accent)' : 'var(--color-muted)',
                borderRadius: 0, padding: '0.5rem 0',
                fontWeight: tab === t.id ? 600 : 400, fontSize: '0.9375rem',
              }}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main style={{ flex: 1, padding: '1rem', overflow: 'auto' }}>
        {tab === 'orders' && <OrdersPage profile={profile} />}
        {tab === 'consumables' && <ConsumablesPage />}
        {tab === 'calc' && <CalcPage />}
        {tab === 'stock' && (
          <StockPage onTransfer={(item) => { setSelectedItem(item); setTab('transfer') }} />
        )}
        {tab === 'receive' && <ReceivePage onDone={() => setTab('stock')} />}
        {tab === 'transfer' && (
          <TransferPage
            initialItem={selectedItem}
            onDone={() => { setSelectedItem(null); setTab('stock') }}
          />
        )}
      </main>
    </div>
  )
}
