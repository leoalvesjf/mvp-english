export function generateSystemPrompt(topic, nickname, isSilent = false) {
  const modeInstruction = isSilent 
    ? "O aluno está no MODO TEXTO. Não envie áudio. Foque em exercícios escritos como 'complete a frase' ou 'traduza o termo'. Use mais pontuação visual."
    : "O aluno está no MODO VOZ. Foque em pronúncia e repetição.";

  return `Você é a Miss Ana, uma professora de inglês brasileira super acolhedora e paciente. 
Seu público são brasileiros que NÃO sabem nada de inglês (Total Beginners). Por isso, sua comunicação deve ser 90% em PORTUGUÊS para que eles se sintam seguros.

${modeInstruction}

REGRAS CRÍTICAS DE IDIOMA:
- Use PORTUGUÊS para reagir, incentivar e explicar.
- Use INGLÊS APENAS para a frase que o aluno deve praticar ou repetir.
- NUNCA misture os dois idiomas na mesma frase.
- Seja breve: no máximo 3 ou 4 frases curtas por resposta.

SEU MÉTODO DE RESPOSTA (Siga sempre esta ordem):
1. FEEDBACK (Em Português): Reaja ao que o aluno disse com muito carinho.
2. EXPLICAÇÃO (Em Português): Ensine algo simples sobre o tópico de hoje.
3. PRÁTICA (Em Inglês): 
   ${isSilent ? "- Peça para o aluno completar uma frase ou traduzir uma palavra." : "- Fale a frase correta em inglês para o aluno repetir."}
4. DICA (Em Português): Termine sempre com "TRY ISSO:" seguido de uma dica rápida.

TÓPICO ATUAL: ${topic.title} — ${topic.goal}
FOCO DO ENSINO: ${topic.prompt}`;
}

export async function sendMessage(messages, topic, nickname, isSilent = false) {
  const systemPrompt = generateSystemPrompt(topic, nickname, isSilent);
  
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': import.meta.env.VITE_ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: systemPrompt,
      messages
    })
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error('API Error details:', errorData);
    throw new Error(`API error: ${response.status}`);
  }
  const data = await response.json()
  return data.content[0].text
}

export async function speakWithOpenAI(text, audioElement) {
  try {
    const cleanText = text
      .replace(/TRY ISSO:.*$/gm, '')
      .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
      .trim();

    if (!cleanText) return null;

    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "tts-1",
        voice: "shimmer",
        input: cleanText
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI TTS erro: ${response.status} - ${errText}`);
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    
    if (audioElement) {
      audioElement.src = url;
      await audioElement.play();
    }
    
    return url;
  } catch (err) {
    console.error('Audio play error:', err);
    return null;
  }
}

export async function transcribeWithOpenAI(audioBlob) {
  try {
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.webm'); // WebM is common on web MediaRecorder, wait, let's just use audio.webm
    formData.append('model', 'whisper-1');
    formData.append('language', 'en'); // optimize for English since it's an English practice app
    
    // Add prompt to give context to Whisper
    formData.append('prompt', 'SpeakUp English practice, clear pronunciation.');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`
        // Content-Type is deliberately missing so browser sets boundaries for FormData
      },
      body: formData
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Whisper STT Error:', response.status, errText);
      throw new Error(`OpenAI Whisper erro: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    return data.text;
  } catch (err) {
    console.error('Transcription error:', err);
    throw err;
  }
}
