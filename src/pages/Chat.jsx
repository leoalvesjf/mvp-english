import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { sendMessage, speakWithOpenAI, transcribeWithOpenAI } from '../lib/claude'
import { useAuth } from '../components/AuthProvider'
import { TOPICS } from '../constants/curriculum'

const MAX_MESSAGES = 10 // 10 AI responses per session


export default function Chat() {
  const { user } = useAuth()
  const nickname = user?.user_metadata?.nickname || ''
  
  const [messages, setMessages] = useState([])
  const [progress, setProgress] = useState(null)
  const [currentTopic, setCurrentTopic] = useState(TOPICS[0])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [aiMessageCount, setAiMessageCount] = useState(0)
  const [sessionActive, setSessionActive] = useState(false)
  const [sessionDone, setSessionDone] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isSilent, setIsSilent] = useState(false)
  const [audioLevel, setAudioLevel] = useState(0)
  const bottomRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const animationFrameRef = useRef(null)
  const [voices, setVoices] = useState([])

  // Check if already practiced today and get progress
  useEffect(() => {
    if (user) {
      loadUserData()
    }
  }, [user])

  async function loadUserData() {
    setLoading(true)
    try {
      // 1. Check today's session
      const today = new Date().toISOString().split('T')[0]
      const { data: sessionData } = await supabase
        .from('sessions')
        .select('id')
        .eq('user_id', user.id)
        .eq('date', today)
        .single()
      
      if (sessionData) setSessionDone(true)

      // 2. Fetch or initialize progress
      const { data: progressData, error: progressError } = await supabase
        .from('user_progress')
        .select('*')
        .eq('user_id', user.id)
        .single()

      if (progressData) {
        setProgress(progressData)
        setCurrentTopic(TOPICS[progressData.current_topic_index] || TOPICS[0])
      }
    } catch (err) {
      console.error('Error loading user data:', err)
    } finally {
      setLoading(false)
    }
  }

  // Dynamic Welcome Message
  useEffect(() => {
    if (currentTopic && messages.length === 0) {
      const welcomeMsg = {
        id: 'welcome',
        role: 'assistant',
        text: `Hello ${nickname}! 👋 I'm Miss Ana, your English teacher!
  
Today's topic: **${currentTopic.title}**
Goal: ${currentTopic.goal}

${currentTopic.welcome}

TRY ISSO: Diga "Hi, Miss Ana!"`
      }
      setMessages([welcomeMsg])
    }
  }, [currentTopic, nickname, messages.length])

  // Fetch voices
  useEffect(() => {
    const updateVoices = () => {
      setVoices(window.speechSynthesis.getVoices())
    }
    window.speechSynthesis.onvoiceschanged = updateVoices
    updateVoices()
  }, [])

  // Scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function finishSession(audioElement) {
    setSessionActive(false)
    setSessionDone(true)
    const today = new Date().toISOString().split('T')[0]
    
    // Save session
    await supabase.from('sessions').insert({ 
      user_id: user.id, 
      date: today, 
      messages_count: messages.length 
    })

    // Update Progress
    const newXP = (progress?.xp || 0) + 50
    const sessionsInCurrentTopic = Math.floor(newXP / 50) // Simplified: progress topic every session for testing? No, let's do every 3.
    // Let's make it increment topic if xp hits a threshold or just for testing let's do +50xp per session.
    
    let nextTopicIndex = progress?.current_topic_index || 0
    // Every 2 sessions (100 XP), move to next topic
    if (newXP > 0 && newXP % 100 === 0) {
      nextTopicIndex = Math.min(nextTopicIndex + 1, TOPICS.length - 1)
    }

    const { data: updatedProgress } = await supabase
      .from('user_progress')
      .update({ 
        xp: newXP, 
        current_topic_index: nextTopicIndex,
        last_practice: today,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', user.id)
      .select()
      .single()

    if (updatedProgress) setProgress(updatedProgress)
    
    const farewellText = `Parabéns! Você completou sua prática de hoje. Você ganhou 50 XP! 🌟 
Hoje falamos sobre ${currentTopic.title}. 
Volte amanhã para continuar aprendendo. See you tomorrow!`
    
    setMessages(m => [...m, {
      id: Date.now(),
      role: 'assistant',
      text: farewellText
    }])

    if (!isSilent) {
      setIsSpeaking(true)
      speakWithOpenAI(farewellText, audioElement).then(() => {
        setIsSpeaking(false)
      }).catch(() => {
        setIsSpeaking(false)
      })
    }
  }


  // Cancel TTS when user types
  useEffect(() => {
    if (input.trim() && window.speechSynthesis) {
      window.speechSynthesis.cancel()
      setIsSpeaking(false)
    }
  }, [input])

  async function handleSend(text) {
    if (loading || isSending) return
    const userText = (text || input).trim()
    if (!userText) return
    
    // Set loading immediately to prevent double-clicks
    setIsSending(true)
    setLoading(true)
    // Start session timer on first message if not active
    if (!sessionActive && !sessionDone) setSessionActive(true)

    // Pre-warm the audio object for mobile browsers on this synchronous click tick
    const audioPlayer = new Audio();
    audioPlayer.play().catch(() => {});

    if (window.speechSynthesis) {
      window.speechSynthesis.cancel()
    }
    setIsSpeaking(false)

    setInput('')
    const userMsg = { id: Date.now(), role: 'user', text: userText }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)

    try {
      const history = newMessages
        .filter(m => m.id !== 'welcome')
        .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.text }))

      const reply = await sendMessage(history, currentTopic, nickname, isSilent)
      setMessages(m => [...m, { id: Date.now() + 1, role: 'assistant', text: reply }])
      
      const newCount = aiMessageCount + 1
      setAiMessageCount(newCount)

      if (newCount >= MAX_MESSAGES) {
        // Automatically finish session if limit reached
        finishSession(audioPlayer)
      } else if (!isSilent) {
        // Auto-read the reply
        setIsSpeaking(true);
        speakWithOpenAI(reply, audioPlayer).then(() => {
          setIsSpeaking(false);
        }).catch(() => {
          setIsSpeaking(false);
        });
      }
    } catch {
      setMessages(m => [...m, { id: Date.now() + 1, role: 'assistant', text: 'Oops! Something went wrong. Try again! 🙏' }])
    } finally {
      setLoading(false)
      setIsSending(false)
    }
  }

  async function toggleVoice() {
    if (isRecording) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop()
      }
      return
    }

    // 1. Check support
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
       alert('Seu navegador não suporta gravação de áudio.')
       return
    }

    // 2. State & Mode
    if (window.speechSynthesis) window.speechSynthesis.cancel()
    setIsSpeaking(false)
    if (!sessionActive && !sessionDone) setSessionActive(true)

    // 3. Setup
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data)
        }
      }

      mediaRecorder.onstart = () => {
        setIsRecording(true)
        if (!window.matchMedia('(max-width: 768px)').matches) {
          initVisualizer(stream) // pass stream to avoid asking permission twice
        }
      }

      mediaRecorder.onstop = async () => {
        setIsRecording(false)
        setAudioLevel(0)
        setLoading(true)

        // Stop all tracks to release microphone
        stream.getTracks().forEach(track => track.stop())
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
        if (audioContextRef.current) {
          audioContextRef.current.close()
          audioContextRef.current = null
        }

        try {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
          const text = await transcribeWithOpenAI(audioBlob)
          if (text) {
             setInput(prev => prev ? prev + ' ' + text : text)
          }
        } catch (err) {
          alert('Erro ao transcrever áudio: ' + err.message)
        } finally {
          setLoading(false)
        }
      }

      mediaRecorder.start()
    } catch (err) {
      console.error('Mic access error:', err)
      alert('Não foi possível acessar seu microfone. Verifique as permissões de gravação.')
      setIsRecording(false)
    }
  }

  async function initVisualizer(streamToUse) {
    try {
      const stream = streamToUse || await navigator.mediaDevices.getUserMedia({ audio: true })
      const audioContext = new (window.AudioContext || window.webkitAudioContext)()
      const analyser = audioContext.createAnalyser()
      const source = audioContext.createMediaStreamSource(stream)
      source.connect(analyser)
      analyser.fftSize = 256
      audioContextRef.current = audioContext
      analyserRef.current = analyser
      
      const dataArray = new Uint8Array(analyser.frequencyBinCount)
      const update = () => {
        if (!analyserRef.current) return
        analyserRef.current.getByteFrequencyData(dataArray)
        const avg = dataArray.reduce((p, c) => p + c, 0) / dataArray.length
        setAudioLevel(Math.min(100, avg * 2.5))
        animationFrameRef.current = requestAnimationFrame(update)
      }
      update()
    } catch (err) {
      console.warn('Visualizer failed:', err)
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  const timerPercent = (aiMessageCount / MAX_MESSAGES) * 100

  return (
    <div className="chat-page">
      {/* Header */}
      <header className="chat-header" style={{ flexDirection: 'column', padding: '12px 16px', gap: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <div className="header-brand">
            <span>🗣️</span>
            <span className="brand-name">SpeakUp</span>
          </div>

          <div className="progress-info" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase' }}>Topic</div>
            <div style={{ fontSize: '0.9rem', color: '#fff', fontWeight: 'bold' }}>{currentTopic?.title}</div>
          </div>
          
          <div className="xp-badge" style={{ backgroundColor: '#1e293b', padding: '4px 10px', borderRadius: '20px', fontSize: '0.8rem', color: '#22d3ee' }}>
            ✨ {progress?.xp || 0} XP
          </div>

          <button 
            className={`btn-mute ${isSilent ? 'active' : ''}`} 
            onClick={() => setIsSilent(!isSilent)}
            title={isSilent ? 'Ativar Som' : 'Modo Silencioso'}
            style={{ 
              background: 'none', 
              border: 'none', 
              fontSize: '1.2rem', 
              cursor: 'pointer',
              opacity: isSilent ? 0.5 : 1,
              transition: 'all 0.2s'
            }}
          >
            {isSilent ? '🔇' : '🔊'}
          </button>

          <button className="btn-logout" onClick={handleLogout} title="Sair" style={{ marginLeft: 0 }}>↩</button>
        </div>
        
        {/* Progress Bar */}
        {!sessionDone && (
          <div style={{ width: '100%', height: '6px', backgroundColor: '#1e293b', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ 
              height: '100%', 
              width: `${timerPercent}%`, 
              backgroundColor: '#22d3ee', 
              transition: 'width 0.4s ease-out' 
            }} />
          </div>
        )}
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
          {isRecording && (
            <div className="recording-status">
              <span className="pulse"></span> 
              {input.trim() ? 'Convertendo voz...' : 'Ouvindo...'}
            </div>
          )}
          <input
            className="text-input"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder="Type in English..."
            disabled={loading || isSending}
          />
          <button
            className={`btn-voice ${isRecording ? 'recording' : ''}`}
            onClick={toggleVoice}
            onContextMenu={(e) => e.preventDefault()}
            title={isRecording ? 'Parar gravação' : 'Começar a falar'}
            style={{ 
              '--level': `${audioLevel}px`,
              boxShadow: isRecording ? `0 0 var(--level) rgba(248,113,113,0.4)` : 'none'
            }}
          >
            {isRecording ? '⏹' : '🎤'}
          </button>
          <button
            className="btn-send"
            onClick={() => handleSend()}
            disabled={loading || isSending || !input.trim()}
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
