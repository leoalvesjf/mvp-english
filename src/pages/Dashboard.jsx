import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../components/AuthProvider'
import { TOPICS } from '../constants/curriculum'

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [progress, setProgress] = useState(null)
  const [loading, setLoading] = useState(true)
  const nickname = user?.user_metadata?.nickname || 'Friend'

  useEffect(() => {
    if (user) {
      loadProgress()
    }
  }, [user])

  async function loadProgress() {
    try {
      const { data, error } = await supabase
        .from('user_progress')
        .select('*')
        .eq('user_id', user.id)
        .single()

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
          <span className="avatar-big">🧑‍🚀</span>
          <div>
            <h1>Hi, {nickname}!</h1>
            <p>Ready for your daily practice?</p>
          </div>
        </div>
        <button className="btn-logout-icon" onClick={() => supabase.auth.signOut()}>↩</button>
      </header>

      <main className="dashboard-content">
        {/* Progress Card */}
        <section className="progress-section">
          <div className="xp-card">
            <div className="xp-info">
              <span className="xp-number">{xp}</span>
              <span className="xp-label">Total XP</span>
            </div>
            <div className="xp-bar-container">
              <div className="xp-bar-fill" style={{ width: `${xpPercentage}%` }}></div>
            </div>
            <p className="xp-next">{nextMilestone - xp} XP to reach next level</p>
          </div>
        </section>

        {/* Main Action */}
        <section className="main-action">
          <div className="practice-card" onClick={() => navigate('/chat')}>
            <div className="card-content">
              <span className="card-tag">LATEST LESSON</span>
              <h2>{currentTopic.title}</h2>
              <p>{currentTopic.goal}</p>
              <button className="btn-start-now">Start Now →</button>
            </div>
            <div className="card-icon">🗣️</div>
          </div>
        </section>

        {/* Modules Grid */}
        <section className="modules-section">
          <h3>Modules</h3>
          <div className="modules-grid">
            {TOPICS.map((topic, index) => {
              const isLocked = index > currentTopicIndex
              return (
                <div 
                  key={index} 
                  className={`module-card ${isLocked ? 'locked' : ''}`}
                  onClick={() => !isLocked && navigate('/chat')}
                >
                  <span className="module-index">{index + 1}</span>
                  <div className="module-info">
                    <h4>{topic.title}</h4>
                    {isLocked && <span className="lock-icon">🔒</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      </main>

      {/* Navigation Bar */}
      <nav className="bottom-nav">
        <button className="nav-item active">
          <span>🏠</span>
          <label>Home</label>
        </button>
        <button className="nav-item" onClick={() => navigate('/chat')}>
          <span>💬</span>
          <label>Chat</label>
        </button>
        <button className="nav-item">
          <span>📚</span>
          <label>Review</label>
        </button>
        <button className="nav-item">
          <span>⚙️</span>
          <label>Settings</label>
        </button>
      </nav>
    </div>
  )
}
