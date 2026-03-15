import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { sendMessage, speakWithOpenAI, transcribeWithOpenAI } from '../lib/claude'
import { useAuth } from '../components/AuthProvider'
import { TOPICS } from '../constants/curriculum'

const MAX_MESSAGES = 10 // 10 AI responses per session


export default function Chat() {
  const { user } = useAuth()
  const nickname = user?.user_metadata?.nickname || ''
  const navigate = useNavigate()
  
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
  const [isVoiceMode, setIsVoiceMode] = useState(true)
  const shouldAutoSendRef = useRef(false)
  const bottomRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const animationFrameRef = useRef(null)
  const recordingStartTimeRef = useRef(0)
  const activeAudioRef = useRef(null) // SINGLETON AUDIO MANAGER
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
      if (activeAudioRef.current) activeAudioRef.current.pause()
      setIsSpeaking(true)
      const audioUrl = await speakWithOpenAI(farewellText, activeAudioRef.current)
      if (audioUrl) {
        setMessages(m => m.map(msg => msg.text === farewellText ? { ...msg, audioUrl } : msg))
      }
      setIsSpeaking(false)
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

    // Initialize the singleton audio for mobile autoplay
    if (!activeAudioRef.current) {
      activeAudioRef.current = new Audio()
    } else {
      activeAudioRef.current.pause()
    }
    activeAudioRef.current.play().catch(() => {})

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
        .slice(-6) // Only send last 6 messages to save tokens
        .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.text }))

      const reply = await sendMessage(history, currentTopic, nickname, isSilent)
      const assistantMsg = { id: Date.now() + 1, role: 'assistant', text: reply }
      setMessages(m => [...m, assistantMsg])
      
      const newCount = aiMessageCount + 1
      setAiMessageCount(newCount)

      if (newCount >= MAX_MESSAGES) {
        finishSession(activeAudioRef.current)
      } else if (!isSilent) {
        setIsSpeaking(true);
        const audioUrl = await speakWithOpenAI(reply, activeAudioRef.current)
        if (audioUrl) {
          setMessages(m => m.map(msg => msg.id === assistantMsg.id ? { ...msg, audioUrl } : msg))
        }
        setIsSpeaking(false);
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
        recordingStartTimeRef.current = Date.now()
        if (!window.matchMedia('(max-width: 768px)').matches) {
          initVisualizer(stream)
        }
      }

      mediaRecorder.onstop = async () => {
        setIsRecording(false)
        setAudioLevel(0)
        
        const duration = Date.now() - recordingStartTimeRef.current
        if (duration < 500) {
          console.log('Recording too short, ignoring.')
          setLoading(false)
          shouldAutoSendRef.current = false
          stream.getTracks().forEach(track => track.stop())
          return
        }

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
             if (shouldAutoSendRef.current) {
               handleSend(text)
             } else {
               setInput(prev => prev ? prev + ' ' + text : text)
             }
          }
        } catch (err) {
          console.error('Transcription error:', err)
          setMessages(m => [...m, { 
            id: Date.now(), 
            role: 'assistant', 
            text: 'I had a bit of trouble hearing that. Could you try saying it again? 🙏' 
          }])
        } finally {
          setLoading(false)
          shouldAutoSendRef.current = false
        }
      }

      mediaRecorder.start()
    } catch (err) {
      console.error('Mic access error:', err)
      setMessages(m => [...m, { 
        id: Date.now(), 
        role: 'assistant', 
        text: 'I can\'t seem to access your microphone. Please check your browser permissions! 🎙️' 
      }])
      setIsRecording(false)
    }
  }

  const startHolding = (e) => {
    if (loading || isSending) return
    e.target.setPointerCapture(e.pointerId)
    shouldAutoSendRef.current = true
    toggleVoice()
  }

  const stopHolding = () => {
    if (isRecording) {
      toggleVoice()
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
      <header className="chat-header">
        <button className="btn-logout-icon" onClick={() => navigate('/dashboard')} title="Back to Dashboard">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div className="header-brand">
          <span>SpeakUp</span>
          <span className="xp-badge">✨ {progress?.xp || 0} XP</span>
        </div>
        <button 
          className="btn-logout-icon" 
          onClick={() => setIsSilent(!isSilent)}
          title={isSilent ? 'Ativar Som' : 'Modo Silencioso'}
        >
          {isSilent ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
          )}
        </button>
      </header>

      {/* Messages */}
      <div className="messages-area">
        {messages.map(msg => (
          <div key={msg.id} className={`bubble-wrap ${msg.role}`}>
            <div className={`bubble ${msg.role}`}>
              {msg.text.split('\n').map((line, i) => (
                <span key={i}>
                  {line.startsWith('TRY ISSO:') ? (
                    <span className="try-hint">{line}</span>
                  ) : line}
                  {i < msg.text.split('\n').length - 1 && <br />}
                </span>
              ))}
              {msg.role === 'assistant' && msg.audioUrl && (
                <button 
                  className="btn-replay" 
                  onClick={() => {
                    if (activeAudioRef.current) {
                      activeAudioRef.current.pause();
                      activeAudioRef.current.src = msg.audioUrl;
                      activeAudioRef.current.play();
                    } else {
                      activeAudioRef.current = new Audio(msg.audioUrl);
                      activeAudioRef.current.play();
                    }
                  }}
                  title="Ouvir novamente"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                  <span>REPLAY</span>
                </button>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="bubble-wrap assistant">
            <div className="bubble assistant">...</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="input-container">
        {!sessionDone ? (
          <div className={`input-area-new ${isVoiceMode ? 'voice-mode' : 'text-mode'}`}>
            <button 
              className="btn-mode-toggle" 
              onClick={() => setIsVoiceMode(!isVoiceMode)}
              title={isVoiceMode ? "Mudar para Texto" : "Mudar para Voz"}
            >
              {isVoiceMode ? (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" ry="2"/><line x1="7" y1="15" x2="17" y2="15"/></svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
              )}
            </button>

            {isVoiceMode ? (
              <div className="voice-container">
                <div className="pulse-rings">
                  <div className="ring" style={{ width: `${120 + audioLevel}px`, height: `${120 + audioLevel}px`, opacity: isRecording ? 0.3 : 0 }} />
                  <div className="ring" style={{ width: `${120 + audioLevel * 2}px`, height: `${120 + audioLevel * 2}px`, opacity: isRecording ? 0.1 : 0 }} />
                </div>
                <button
                  className={`btn-hold-to-talk ${isRecording ? 'recording' : ''}`}
                  onPointerDown={startHolding}
                  onPointerUp={stopHolding}
                  onPointerLeave={stopHolding}
                  style={{ touchAction: 'none' }}
                >
                  {isRecording ? (
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
                  ) : (
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                  )}
                </button>
                <p className="voice-hint">
                  {isRecording ? 'Release to send' : 'Hold to talk'}
                </p>
              </div>
            ) : (
              <>
                <input
                  className="text-input"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSend()}
                  placeholder="Type in English..."
                  disabled={loading || isSending}
                  autoFocus
                />
                <button
                  className="btn-send"
                  onClick={() => handleSend()}
                  disabled={loading || isSending || !input.trim()}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="done-bar" style={{ padding: '30px', textAlign: 'center', fontWeight: 'bold' }}>
            🌟 See you tomorrow! Keep it up!
          </div>
        )}
      </div>
    </div>
  )
}
