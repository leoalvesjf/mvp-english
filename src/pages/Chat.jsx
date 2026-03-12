import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { sendMessage } from '../lib/claude'
import { useAuth } from '../components/AuthProvider'

const SESSION_SECONDS = 180 // 3 minutes

const WELCOME_MESSAGE = {
  id: 'welcome',
  role: 'assistant',
  text: `Hello! 👋 I'm SpeakUp, your English practice friend!

Every day we'll chat for 3 minutes. This month we're talking about YOU — who you are, what you like, where you work.

Ready to start? Just say "Hi!" or press the 🎤 button to speak!

TRY ISSO: Diga "Hi, my name is [seu nome]"`
}

export default function Chat() {
  const { user } = useAuth()
  const [messages, setMessages] = useState([WELCOME_MESSAGE])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [timeLeft, setTimeLeft] = useState(SESSION_SECONDS)
  const [sessionActive, setSessionActive] = useState(false)
  const [sessionDone, setSessionDone] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const bottomRef = useRef(null)
  const recognitionRef = useRef(null)

  // Check if already practiced today
  useEffect(() => {
    checkTodaySession()
  }, [])

  async function checkTodaySession() {
    const today = new Date().toISOString().split('T')[0]
    const { data } = await supabase
      .from('sessions')
      .select('id')
      .eq('user_id', user.id)
      .eq('date', today)
      .single()
    if (data) setSessionDone(true)
  }

  // Timer
  useEffect(() => {
    if (!sessionActive || sessionDone) return
    if (timeLeft <= 0) {
      finishSession()
      return
    }
    const t = setTimeout(() => setTimeLeft(t => t - 1), 1000)
    return () => clearTimeout(t)
  }, [sessionActive, timeLeft, sessionDone])

  // Scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function formatTime(s) {
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  }

  async function finishSession() {
    setSessionActive(false)
    setSessionDone(true)
    const today = new Date().toISOString().split('T')[0]
    await supabase.from('sessions').insert({ user_id: user.id, date: today, messages_count: messages.length })
    setMessages(m => [...m, {
      id: Date.now(),
      role: 'assistant',
      text: `Great session today! 🎉 You practiced for 3 minutes. Come back tomorrow to keep improving! See you! 👋`
    }])
  }

  function speak(text) {
    if (!window.speechSynthesis) return

    // Cancel any ongoing speech
    window.speechSynthesis.cancel()

    // Sanitize text: remove emojis and "TRY ISSO:" lines
    const cleanText = text
      .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
      .split('\n')
      .filter(line => !line.trim().startsWith('TRY ISSO:'))
      .join(' ')

    const utterance = new SpeechSynthesisUtterance(cleanText)
    utterance.lang = 'en-US'
    utterance.rate = 0.88
    utterance.pitch = 1.05

    // Try to find a female English voice
    const voices = window.speechSynthesis.getVoices()
    const femaleVoice = voices.find(v => 
      v.lang.startsWith('en') && 
      /samantha|zira|karen|moira|victoria/i.test(v.name)
    )
    if (femaleVoice) utterance.voice = femaleVoice

    window.speechSynthesis.speak(utterance)
  }

  // Cancel TTS when user types
  useEffect(() => {
    if (input.trim() && window.speechSynthesis) {
      window.speechSynthesis.cancel()
    }
  }, [input])

  async function handleSend(text) {
    const userText = (text || input).trim()
    if (!userText || loading) return
    if (!sessionActive) setSessionActive(true)

    // Cancel TTS when sending/recording starts
    if (window.speechSynthesis) window.speechSynthesis.cancel()

    setInput('')
    const userMsg = { id: Date.now(), role: 'user', text: userText }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setLoading(true)

    try {
      const history = newMessages
        .filter(m => m.id !== 'welcome')
        .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.text }))

      const reply = await sendMessage(history)
      setMessages(m => [...m, { id: Date.now() + 1, role: 'assistant', text: reply }])
      
      // Auto-read the reply
      speak(reply)
    } catch {
      setMessages(m => [...m, { id: Date.now() + 1, role: 'assistant', text: 'Oops! Something went wrong. Try again! 🙏' }])
    } finally {
      setLoading(false)
    }
  }

  function startVoice() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert('Seu navegador não suporta voz. Tente Chrome.')
      return
    }

    // Cancel TTS when mic is pressed
    if (window.speechSynthesis) window.speechSynthesis.cancel()

    const recognition = new SpeechRecognition()
    recognition.lang = 'en-US'
    recognition.interimResults = true
    recognition.maxAlternatives = 3

    let finalTranscript = ''

    recognition.onstart = () => setIsRecording(true)
    recognition.onend = () => {
      setIsRecording(false)
      if (finalTranscript.trim()) {
        handleSend(finalTranscript)
      }
    }
    recognition.onerror = () => setIsRecording(false)
    recognition.onresult = (e) => {
      let interimTranscript = ''
      for (let i = e.resultIndex; i < e.results.length; ++i) {
        if (e.results[i].isFinal) {
          finalTranscript += e.results[i][0].transcript
        } else {
          interimTranscript += e.results[i][0].transcript
        }
      }
      // Update input with interim results for visual feedback
      setInput(finalTranscript + interimTranscript)
    }

    recognitionRef.current = recognition
    recognition.start()
  }

  function stopVoice() {
    recognitionRef.current?.stop()
  }

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  const timerPercent = (timeLeft / SESSION_SECONDS) * 100
  const timerColor = timeLeft > 60 ? '#22d3ee' : timeLeft > 30 ? '#fbbf24' : '#f87171'

  return (
    <div className="chat-page">
      {/* Header */}
      <header className="chat-header">
        <div className="header-brand">
          <span>🗣️</span>
          <span className="brand-name">SpeakUp</span>
        </div>
        <div className="header-center">
          {sessionActive && !sessionDone && (
            <div className="timer-wrap">
              <svg viewBox="0 0 36 36" className="timer-ring">
                <circle cx="18" cy="18" r="15" fill="none" stroke="#1e293b" strokeWidth="3" />
                <circle
                  cx="18" cy="18" r="15" fill="none"
                  stroke={timerColor} strokeWidth="3"
                  strokeDasharray={`${timerPercent * 0.942} 94.2`}
                  strokeLinecap="round"
                  transform="rotate(-90 18 18)"
                  style={{ transition: 'stroke-dasharray 1s linear, stroke 0.3s' }}
                />
              </svg>
              <span className="timer-text" style={{ color: timerColor }}>{formatTime(timeLeft)}</span>
            </div>
          )}
          {!sessionActive && !sessionDone && (
            <span className="session-hint">3 min · personal intro</span>
          )}
          {sessionDone && <span className="session-done-badge">✓ Done today</span>}
        </div>
        <button className="btn-logout" onClick={handleLogout} title="Sair">↩</button>
      </header>

      {/* Messages */}
      <div className="messages-area">
        {messages.map(msg => (
          <div key={msg.id} className={`bubble-wrap ${msg.role}`}>
            {msg.role === 'assistant' && <span className="avatar">🗣️</span>}
            <div className={`bubble ${msg.role}`}>
              {msg.text.split('\n').map((line, i) => (
                <span key={i}>
                  {line.startsWith('TRY ISSO:') ? (
                    <span className="try-hint">{line}</span>
                  ) : line}
                  {i < msg.text.split('\n').length - 1 && <br />}
                </span>
              ))}
            </div>
          </div>
        ))}
        {loading && (
          <div className="bubble-wrap assistant">
            <span className="avatar">🗣️</span>
            <div className="bubble assistant typing">
              <span /><span /><span />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      {!sessionDone && (
        <div className="input-area">
          <input
            className="text-input"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder="Type in English..."
            disabled={loading}
          />
          <button
            className={`btn-voice ${isRecording ? 'recording' : ''}`}
            onMouseDown={startVoice}
            onMouseUp={stopVoice}
            onTouchStart={startVoice}
            onTouchEnd={stopVoice}
            title="Hold to speak"
          >
            {isRecording ? '⏹' : '🎤'}
          </button>
          <button
            className="btn-send"
            onClick={() => handleSend()}
            disabled={loading || !input.trim()}
          >
            ➤
          </button>
        </div>
      )}

      {sessionDone && (
        <div className="done-bar">
          🌟 See you tomorrow! Keep it up!
        </div>
      )}
    </div>
  )
}
