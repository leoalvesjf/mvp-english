// supabase/functions/speakup-proxy/index.ts
// ─────────────────────────────────────────────────────────────
// Proxy seguro para Anthropic (Claude Haiku) + OpenAI (TTS + Whisper).
// Também loga o uso por usuário na tabela `api_usage` do Supabase.
// Deploy: supabase functions deploy speakup-proxy
// ─────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY')!
const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    ?? Deno.env.get('SERVICE_ROLE_KEY')!

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

CURRENT TOPIC: Personal Introduction — name, age, city, job`

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type, authorization, x-proxy-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// ── helper: loga uso na tabela api_usage ─────────────────────
async function logUsage(
    supabase: ReturnType<typeof createClient>,
    userId: string | null,
    type: string,
    tokensOrChars: number
) {
    try {
        await supabase.from('api_usage').insert({
            user_id: userId,
            call_type: type,           // 'chat' | 'tts' | 'stt'
            units: tokensOrChars,  // tokens para chat, chars para tts, segundos para stt
            created_at: new Date().toISOString(),
        })
    } catch {
        // log opcional — não quebra o fluxo principal
    }
}

// ── helper: extrai user_id do JWT do Supabase (opcional) ──────
function getUserId(req: Request): string | null {
    try {
        const auth = req.headers.get('Authorization') ?? ''
        const token = auth.replace('Bearer ', '')
        if (!token) return null
        const payload = JSON.parse(atob(token.split('.')[1]))
        return payload.sub ?? null
    } catch {
        return null
    }
}

// ─────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: CORS })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
    const userId = getUserId(req)
    const proxyType = req.headers.get('x-proxy-type')

    // ── STT (Whisper) — recebe FormData ──────────────────────────
    if (proxyType === 'stt') {
        const formData = await req.formData()
        const file = formData.get('file') as File

        const oaiForm = new FormData()
        oaiForm.append('file', file, 'audio.webm')
        oaiForm.append('model', 'whisper-1')
        oaiForm.append('language', 'en')
        oaiForm.append('prompt', 'Hello SpeakUp! This is a typical English practice phrase with Brazilian accent.')

        const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${OPENAI_KEY}` },
            body: oaiForm,
        })

        const data = await res.json()

        // loga duração estimada (1 char ≈ 0.01s — apenas referência)
        await logUsage(supabase, userId, 'stt', file.size)

        return new Response(JSON.stringify({ text: data.text }), {
            headers: { ...CORS, 'Content-Type': 'application/json' }
        })
    }

    // ── JSON body (chat ou tts) ───────────────────────────────────
    const body = await req.json()
    const type = body.type as 'chat' | 'tts'

    // ── CHAT (Claude Haiku) ───────────────────────────────────────
    if (type === 'chat') {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': ANTHROPIC_KEY,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001', // ← string correta
                max_tokens: 300,
                system: SYSTEM_PROMPT,
                messages: body.messages,
            }),
        })

        const data = await res.json()
        const text = data.content?.[0]?.text ?? ''
        const tokens = (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0)

        await logUsage(supabase, userId, 'chat', tokens)

        return new Response(JSON.stringify({ text }), {
            headers: { ...CORS, 'Content-Type': 'application/json' }
        })
    }

    // ── TTS (OpenAI) ──────────────────────────────────────────────
    if (type === 'tts') {
        const cleanText = body.text as string
        const res = await fetch('https://api.openai.com/v1/audio/speech', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENAI_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'tts-1',
                voice: 'nova',
                input: cleanText,
            }),
        })

        const audioBuffer = await res.arrayBuffer()
        await logUsage(supabase, userId, 'tts', cleanText.length)

        return new Response(audioBuffer, {
            headers: { ...CORS, 'Content-Type': 'audio/mpeg' }
        })
    }

    return new Response(JSON.stringify({ error: 'type inválido' }), {
        status: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' }
    })
})