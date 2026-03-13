import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { sendMessage, speakWithOpenAI } from '../lib/claude'
import { useAuth } from '../components/AuthProvider'

const MAX_MESSAGES = 10 // 10 AI responses per session


export default function Chat() {
  const { user } = useAuth()
  const nickname = user?.user_metadata?.nickname || ''
  
  const WELCOME_MESSAGE = {
    id: 'welcome',
    role: 'assistant',
    text: `Hello ${nickname}! 👋 I'm SpeakUp, your English practice friend!

Every day we'll chat for ${MAX_MESSAGES} messages. This month we're talking about YOU — who you are, what you like, where you work.

Ready to start? Just say "Hi!" or press the 🎤 button to speak!

TRY ISSO: Diga "Hi, my name is ${nickname || '[seu nome]'}"`
  }

  const [messages, setMessages] = useState([WELCOME_MESSAGE])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [aiMessageCount, setAiMessageCount] = useState(0)
  const [sessionActive, setSessionActive] = useState(false)
  const [sessionDone, setSessionDone] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [audioLevel, setAudioLevel] = useState(0)
  const bottomRef = useRef(null)
  const recognitionRef = useRef(null)
  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const animationFrameRef = useRef(null)
  const transcriptRef = useRef('')
  const silenceTimerRef = useRef(null)
  const [voices, setVoices] = useState([])

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
    await supabase.from('sessions').insert({ user_id: user.id, date: today, messages_count: messages.length })
    
    const farewellText = "Parabéns! Você completou sua prática de hoje. Você foi incrível! Volte amanhã para continuar aprendendo. See you tomorrow!"
    
    setMessages(m => [...m, {
      id: Date.now(),
      role: 'assistant',
      text: farewellText
    }])

    setIsSpeaking(true)
    speakWithOpenAI(farewellText, audioElement).then(() => {
      setIsSpeaking(false)
    }).catch(() => {
      setIsSpeaking(false)
    })
  }


  // Cancel TTS when user types
  useEffect(() => {
    if (input.trim() && window.speechSynthesis) {
      window.speechSynthesis.cancel()
      setIsSpeaking(false)
    }
  }, [input])

  async function handleSend(text) {
    const userText = (text || input).trim()
    if (!userText || loading) return
    
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
    setLoading(true)

    try {
      const history = newMessages
        .filter(m => m.id !== 'welcome')
        .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.text }))

      const reply = await sendMessage(history)
      setMessages(m => [...m, { id: Date.now() + 1, role: 'assistant', text: reply }])
      
      const newCount = aiMessageCount + 1
      setAiMessageCount(newCount)

      if (newCount >= MAX_MESSAGES) {
        // Automatically finish session if limit reached
        finishSession(audioPlayer)
      } else {
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
    }
  }

  function toggleVoice() {
    if (isRecording) {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
      if (recognitionRef.current) {
        recognitionRef.current.stop()
        recognitionRef.current = null
      }
      return
    }

    // 1. Check support & Brave specifically
    const isBrave = navigator.brave !== undefined
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      if (isBrave) {
        alert('No Brave Mobile, você precisa ativar "Google Play Services" para reconhecimento de voz ou usar o Chrome.')
      } else {
        alert('Reconhecimento de voz não suportado neste navegador.')
      }
      return
    }

    // 2. State & Mode
    if (window.speechSynthesis) window.speechSynthesis.cancel()
    setIsSpeaking(false)
    if (!sessionActive && !sessionDone) setSessionActive(true)

    // 3. Setup
    const recognition = new SpeechRecognition()
    recognition.lang = 'en-US'
    recognition.continuous = true 
    recognition.interimResults = true
    recognition.maxAlternatives = 1
    recognitionRef.current = recognition
    
    let localFinal = ''
    transcriptRef.current = ''

    recognition.onstart = () => {
      setIsRecording(true)
      // Only init visualizer on desktop to avoid hardware conflicts on mobile
      if (!window.matchMedia('(max-width: 768px)').matches) {
        initVisualizer()
      }
    }

    // Reset silence timer whenever we get a result
    recognition.onresult = (e) => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
      
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; ++i) {
        if (e.results[i].isFinal) localFinal += e.results[i][0].transcript
        else interim += e.results[i][0].transcript
      }
      const full = localFinal + interim
      transcriptRef.current = full
      setInput(full)

      // Stop automatically after 1.5s of silence
      silenceTimerRef.current = setTimeout(() => {
        if (recognitionRef.current) {
          recognitionRef.current.stop()
        }
      }, 1500)
    }

    recognition.onerror = (e) => {
      console.error('STT Error:', e.error)
      if (e.error === 'service-not-allowed' || e.error === 'network') {
        if (isBrave) {
          alert('Brave bloqueou o serviço de voz. Clique no leão (Shield) e desative-o, ou verifique se as "Funcionalidades do Google" estão ativas no seu Android/iOS.')
        } else {
          alert('Erro no serviço de voz: ' + e.error)
        }
      }
      setIsRecording(false)
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    }

    recognition.onend = () => {
      setIsRecording(false)
      setAudioLevel(0)
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
      if (audioContextRef.current) {
        audioContextRef.current.close()
        audioContextRef.current = null
      }
    }

    // CRITICAL: Start immediately to satisfy mobile security
    try {
      recognition.start()
    } catch (err) {
      console.error('Recognition start failed:', err)
      setIsRecording(false)
    }
  }

  async function initVisualizer() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
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
          
          {!sessionDone ? (
            <div style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: '500' }}>
              {aiMessageCount}/{MAX_MESSAGES} Mensagens
            </div>
          ) : (
            <span className="session-done-badge" style={{ fontSize: '0.85rem' }}>✓ Done today</span>
          )}
          
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
            disabled={loading}
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
