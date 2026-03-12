import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../components/AuthProvider'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [mobile, setMobile] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  
  const { user } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (user) {
      console.log('Login: User detected, redirecting to /chat...')
      navigate('/chat', { replace: true })
    }
  }, [user, navigate])

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')

    try {
      if (isSignUp) {
        if (!nickname || !mobile) {
          throw new Error('Nickname e Celular são obrigatórios.')
        }
        console.log('Login: Attempting sign up...')
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              nickname,
              mobile
            }
          }
        })
        console.log('Login: Sign up result:', data, error)
        if (error) throw error
        setMessage('Conta criada! Verifique seu email para confirmar.')
      } else {
        console.log('Login: Attempting sign in...')
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        console.log('Login: Sign in result:', data, error)
        if (error) throw error
      }
    } catch (err) {
      setError(err.message === 'Invalid login credentials'
        ? 'Email ou senha incorretos.'
        : err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <span className="brand-icon">🗣️</span>
          <h1>SpeakUp</h1>
          <p>Your daily English practice</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
           <div className="field">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="seu@email.com"
              required
            />
          </div>

          {isSignUp && (
            <>
              <div className="field">
                <label>Nickname (Apelido)</label>
                <input
                  type="text"
                  value={nickname}
                  onChange={e => setNickname(e.target.value)}
                  placeholder="Seu apelido"
                  required
                />
              </div>
              <div className="field">
                <label>Mobile (Celular)</label>
                <input
                  type="tel"
                  value={mobile}
                  onChange={e => setMobile(e.target.value)}
                  placeholder="(00) 00000-0000"
                  required
                />
              </div>
            </>
          )}
          <div className="field">
            <label>Senha</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
            />
          </div>

          {error && <p className="msg-error">{error}</p>}
          {message && <p className="msg-success">{message}</p>}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Aguarde...' : isSignUp ? 'Criar conta' : 'Entrar'}
          </button>
        </form>

        <button className="btn-toggle" onClick={() => { setIsSignUp(!isSignUp); setError(''); setMessage('') }}>
          {isSignUp ? 'Já tenho conta — Entrar' : 'Não tenho conta — Criar'}
        </button>

        <span className="version-tag">Versão Beta : 1.1</span>
      </div>
    </div>
  )
}
