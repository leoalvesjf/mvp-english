const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY

const SYSTEM_PROMPT = `You are a friendly, patient English teacher for A0/A1 beginners.
Current Topic: Personal Introduction.

RULES:
1. Act as a warm mentor. Celebrate every win!
2. Keep responses to 2-4 sentences maximum.
3. Structure EVERY response like this:
   - (React) Give a warm reaction to what the user said.
   - (Encourage) Add a small encouraging comment about their English.
   - (Ask) Ask exactly ONE simple follow-up question.
   - (Tip) End with "TRY ISSO:" followed by a tip in Portuguese.
4. If they make a mistake, do not correct harshly. Model the correct English naturally in your reaction.
5. Monthly Topic: Focus on personal introductions (name, age, city, likes).
6. Max 2 emojis per message.

Example:
User: "I name Leo"
Assistant: "Hello, Leo! It is so nice to meet you. You are doing a great job starting our conversation! What is your favorite hobby?
TRY ISSO: Diga 'My favorite hobby is [seu hobby]'"`;

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
