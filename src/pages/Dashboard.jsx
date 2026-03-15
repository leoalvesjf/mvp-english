import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../components/AuthProvider'
import { TOPICS } from '../constants/curriculum'

const NavIcon = ({ type }) => {
  const props = { width: 20, height: 20, stroke: 'currentColor', strokeWidth: 2, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' }
  switch (type) {
    case 'home':
      return (
        <svg viewBox="0 0 24 24" {...props}>
          <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
      )
    case 'chat':
      return (
        <svg viewBox="0 0 24 24" {...props}>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      )
    case 'review':
      return (
        <svg viewBox="0 0 24 24" {...props}>
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
        </svg>
      )
    case 'settings':
      return (
        <svg viewBox="0 0 24 24" {...props}>
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33 1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82 1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      )
    default: return null
  }
}

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [progress, setProgress] = useState(null)
  const [loading, setLoading] = useState(true)
  const nickname = user?.user_metadata?.nickname || 'Friend'

  useEffect(() => {
    if (user) { loadProgress() }
  }, [user])

  async function loadProgress() {
    try {
      const { data } = await supabase.from('user_progress').select('*').eq('user_id', user.id).single()
      if (data) setProgress(data)
    } catch (err) {
      console.error('Error loading progress:', err)
    } finally {
      setLoading(false)
    }
  }

  const currentTopicIndex = progress?.current_topic_index || 0
  const currentTopic = TOPICS[currentTopicIndex]
  const xp = progress?.xp || 0
  const nextMilestone = (Math.floor(xp / 100) + 1) * 100
  const xpPercentage = (xp % 100)

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  return (
    <div className="dashboard-page">
      <header className="dashboard-header">
        <div className="user-welcome">
          <p>READY TO PRACTICE?</p>
          <h1>{nickname}</h1>
        </div>
        <button className="btn-logout-icon" onClick={() => supabase.auth.signOut()} title="Sair">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        </button>
      </header>

      <main className="dashboard-content">
        <div className="xp-card-premium">
          <div style={{ display: 'flex', alignItems: 'baseline' }}>
            <span className="xp-val">{xp}</span>
            <span className="xp-unit">TOTAL XP</span>
          </div>
          <div className="progress-bar-premium">
            <div className="progress-fill-premium" style={{ width: `${xpPercentage}%` }}></div>
          </div>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px', textAlign: 'right', fontWeight: 'bold' }}>
            {nextMilestone - xp} XP TO NEXT LEVEL
          </p>
        </div>

        <div className="practice-card-premium" onClick={() => navigate('/chat')}>
          <span className="card-label">CURRENT SESSION</span>
          <h2>{currentTopic.title}</h2>
          <p>{currentTopic.goal}</p>
          <button className="btn-premium-start">START NOW →</button>
          <div style={{ position: 'absolute', right: '30px', top: '50%', transform: 'translateY(-50%)', fontSize: '50px', opacity: 0.1, pointerEvents: 'none' }}>🗣️</div>
        </div>

        <section className="modules-section">
          <h3 className="section-title">Your Path</h3>
          <div className="module-list-premium">
            {TOPICS.map((topic, index) => {
              const isLocked = index > currentTopicIndex
              return (
                <div key={index} className={`module-item-premium ${isLocked ? 'locked' : ''}`} onClick={() => !isLocked && navigate('/chat')}>
                  <div className="module-number">{index + 1}</div>
                  <div className="module-content"><h4>{topic.title}</h4></div>
                  <div className="module-status">{isLocked ? '🔒' : '→'}</div>
                </div>
              )
            })}
          </div>
        </section>
      </main>

      <nav className="nav-wrapper-premium">
        <button className="nav-item-premium active">
          <span className="nav-icon"><NavIcon type="home" /></span>
          <span className="nav-label">Home</span>
        </button>
        <button className="nav-item-premium" onClick={() => navigate('/chat')}>
          <span className="nav-icon"><NavIcon type="chat" /></span>
          <span className="nav-label">Chat</span>
        </button>
        <button className="nav-item-premium">
          <span className="nav-icon"><NavIcon type="review" /></span>
          <span className="nav-label">Review</span>
        </button>
        <button className="nav-item-premium">
          <span className="nav-icon"><NavIcon type="settings" /></span>
          <span className="nav-label">Settings</span>
        </button>
      </nav>
    </div>
  )
}
