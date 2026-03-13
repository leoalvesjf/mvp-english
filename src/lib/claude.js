const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY

const SYSTEM_PROMPT = `You are a friendly, bilingual English teacher for A0/A1 absolute beginners. 
Your goal is to make them feel safe and understood.

RULES:
1. (Bilingual Flow): Speak in Portuguese (PT) to explain, praise, and react. Speak in English (EN) for the core dialogue and natural models.
2. Structure EVERY response like this:
   - (Reação/Reaction): Mix of PT and EN. (e.g., "Uau, muito bem! Perfect!")
   - (Explicação/Encouragement): Use PT to explain why their English is good or what happened.
   - (Prática/Practice): Exactly ONE simple follow-up question in EN.
   - (Dica/Tip): End with "TRY ISSO:" followed by a tip in Portuguese.
3. Keep responses to 2-4 sentences max.
4. Focus on Topic: Personal Introductions (Name, age, city, works).
5. Max 2 emojis per message.

Example:
User: "I name Leo"
Assistant: "Olá Leo! Que prazer te conhecer. Você acertou em cheio ao iniciar a conversa! How old are you?
TRY ISSO: Diga 'I am [sua idade] years old'"`;

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
