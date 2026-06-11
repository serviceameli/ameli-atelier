import { useState } from 'react'
import { signIn } from '../lib/auth.js'

export default function LoginPage({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await signIn(email, password)
      onLogin()
    } catch (err) {
      setError(err.message === 'Invalid login credentials'
        ? 'Неверный email или пароль'
        : err.message)
    } finally {
      setLoading(false)
    }
  }

  async function quickLogin() {
    setError(null)
    setLoading(true)
    try {
      await signIn('service.ameli.aniri@gmail.com', 'Ameli2025!')
      onLogin()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: '1.5rem', background: 'var(--color-bg)',
    }}>
      <div style={{ width: '100%', maxWidth: '360px' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🧵</div>
          <h1 style={{ fontWeight: 700, fontSize: '1.375rem' }}>Амели · Учёт ткани</h1>
          <p style={{ color: 'var(--color-muted)', marginTop: '0.25rem', fontSize: '0.9375rem' }}>
            Войдите в систему
          </p>
        </div>

        {/* Быстрый вход для тестирования */}
        <button
          className="btn-primary"
          style={{ width: '100%', marginBottom: '1.25rem', fontSize: '1rem', padding: '0.875rem' }}
          onClick={quickLogin}
          disabled={loading}
        >
          {loading ? 'Входим…' : '⚡ Войти как Амели (тест)'}
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <div style={{ flex: 1, height: '1px', background: 'var(--color-border)' }} />
          <span style={{ fontSize: '0.8125rem', color: 'var(--color-muted)' }}>или войти вручную</span>
          <div style={{ flex: 1, height: '1px', background: 'var(--color-border)' }} />
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          <div>
            <label>Email</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="example@mail.ru" autoComplete="email" inputMode="email"
            />
          </div>
          <div>
            <label>Пароль</label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" autoComplete="current-password"
            />
          </div>

          {error && (
            <p style={{ color: 'var(--color-danger)', fontSize: '0.875rem', margin: 0 }}>{error}</p>
          )}

          <button
            type="submit" className="btn-secondary"
            style={{ width: '100%' }}
            disabled={loading || !email || !password}
          >
            {loading ? 'Входим…' : 'Войти'}
          </button>
        </form>
      </div>
    </div>
  )
}
