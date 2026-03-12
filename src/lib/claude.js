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
      'x-api-key': ANTHROPIC_API_KEY,
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
