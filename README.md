# SpeakUp — English Practice PWA

PWA para prática de inglês com IA. Chat diário de 3 minutos, suporte a voz, funciona no iOS e Android via browser.

## Stack
- React + Vite
- Supabase Auth + Database
- Claude Haiku (IA)
- Vercel (deploy)
- PWA (sem App Store)

## Setup Local

```bash
npm install
cp .env.example .env
# preencha as variáveis no .env
npm run dev
```

## Supabase — Tabela necessária

Execute no SQL Editor do Supabase:

```sql
create table sessions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  date date not null,
  messages_count int default 0,
  created_at timestamp with time zone default now()
);

-- RLS
alter table sessions enable row level security;

create policy "Users can manage own sessions"
  on sessions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

## Deploy Vercel

1. Push para GitHub
2. Conectar repo no Vercel
3. Adicionar variáveis de ambiente no painel do Vercel:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_ANTHROPIC_API_KEY`

## Funcionalidades MVP

- [x] Login/cadastro com email e senha
- [x] Chat com Claude Haiku (professor de inglês)
- [x] Botão de voz (Web Speech API — Chrome/Safari)
- [x] Timer de 3 minutos por sessão
- [x] 1 sessão por dia (bloqueia após completar)
- [x] Histórico da sessão salvo no Supabase
- [x] PWA instalável (iOS e Android)

## Próximas features (pós-MVP)
- [ ] Novo tópico a cada mês
- [ ] Histórico de dias praticados (streak)
- [ ] Notificação por email (lembrete diário)
- [ ] Pronunciação com feedback de acerto
