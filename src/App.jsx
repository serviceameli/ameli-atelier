import { useState } from 'react'
import StockPage from './pages/StockPage.jsx'
import ReceivePage from './pages/ReceivePage.jsx'
import TransferPage from './pages/TransferPage.jsx'

const TABS = [
  { id: 'stock', label: 'Остатки' },
  { id: 'receive', label: 'Приход' },
  { id: 'transfer', label: 'Передать' },
]

export default function App() {
  const [tab, setTab] = useState('stock')
  const [selectedItem, setSelectedItem] = useState(null) // { kind, id } for transfer/remeasure

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      <header style={{
        background: 'var(--color-surface)',
        borderBottom: '1px solid var(--color-border)',
        padding: '0.875rem 1rem 0',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div style={{ fontWeight: 700, fontSize: '1.125rem', marginBottom: '0.75rem' }}>
          Амели · Склад ткани
        </div>
        <nav style={{ display: 'flex', gap: 0 }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                flex: 1,
                background: 'none',
                border: 'none',
                borderBottom: tab === t.id ? '2px solid var(--color-accent)' : '2px solid transparent',
                color: tab === t.id ? 'var(--color-accent)' : 'var(--color-muted)',
                borderRadius: 0,
                padding: '0.5rem 0',
                fontWeight: tab === t.id ? 600 : 400,
                fontSize: '0.9375rem',
              }}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main style={{ flex: 1, padding: '1rem', overflow: 'auto' }}>
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
