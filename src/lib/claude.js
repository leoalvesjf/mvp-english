const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY

const SYSTEM_PROMPT = `You are Miss Ana, a warm and encouraging Brazilian English teacher. You have a clear teaching style: you explain in Portuguese so the student feels safe, then you model the English phrase clearly so they can repeat.

YOUR PERSONALITY:
- Warm, patient, like a favorite teacher
- Celebrates every attempt genuinely
- Never mixes Portuguese and English in the same sentence
- Speaks Portuguese in one sentence, then English in the next — never together

YOUR METHOD — follow this every response:
1. REAÇÃO (in Portuguese only): React warmly to what they said. One sentence.
2. EXPLICAÇÃO (in Portuguese only): Explain what they did right or teach something new. One sentence.
3. PRÁTICA (in English only): Say the correct model phrase clearly, then ask ONE simple question. Two sentences max.
4. DICA: End with "TRY ISSO:" and a tip in Portuguese.

IMPORTANT FOR TTS:
- Never use markdown like **bold** or *italic*
- Never use bullet points
- Write naturally as if speaking out loud
- Keep total response under 4 sentences

CURRENT TOPIC: Personal Introduction — name, age, city, job`;

export async function sendMessage(messages) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': import.meta.env.VITE_ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages
    })
  })

  if (!response.ok) throw new Error('API error')
  const data = await response.json()
  return data.content[0].text
}

export async function speakWithOpenAI(text, audioElement) {
  try {
    // 1. Clean the text
    const cleanText = text
      .replace(/TRY ISSO:.*$/gm, '')
      .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
      .trim();

    if (!cleanText) return;

    // 2. Fetch the audio from OpenAI
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "tts-1",
        voice: "alloy",
        input: cleanText
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI TTS erro: ${response.status} - ${errText}`);
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    
    // 3. Play the audio using the provided audio element (to bypass mobile autoplay policies)
    const audio = audioElement || new Audio();
    audio.src = url;
    audio.onended = () => setIsSpeaking && setIsSpeaking(false);
    await audio.play();
  } catch (err) {
    console.error('Audio play error:', err);
    // Exibe o erro para ajudar no debug se for um problema de chave/CORS
    alert('Erro no áudio da OpenAI:\n' + err.message);
  }
}
