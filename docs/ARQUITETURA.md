# Arquitetura — CareCircle (UNMUTE by Agora)

Visão de implantação do sistema como ele roda hoje na demo. **Personas (Helena, Ana,
Pedro) e dados são sintéticos** — cenário único da demo: Helena pede companhia de
Pedro para ir à feira no sábado. Diagramas editáveis (drawio / diagrams.net) em
[`docs/diagramas/`](diagramas/):

- [`arquitetura-geral.drawio`](diagramas/arquitetura-geral.drawio) — sistema completo por fronteira
- [`fluxo-voz-app.drawio`](diagramas/fluxo-voz-app.drawio) — sessão de voz do app: «voz prepara, nunca autoriza»
- [`fluxo-whatsapp.drawio`](diagramas/fluxo-whatsapp.drawio) — Lia por nota de voz no WhatsApp (lia-wa)
- [`fluxo-canais.drawio`](diagramas/fluxo-canais.drawio) — «Canais reais»: WhatsApp e ligação a partir do painel

## Visão geral (ASCII)

```
                         ┌─────────────────────────── internet ───────────────────────────┐
                         │                                                                │
 navegadores ──HTTPS──►  Vercel «proxy»            Meta/WhatsApp ──► Evolution (docker)    │
 /idoso /familia /demo   carecircle.jazz...        ▲                    :8082 · jazz2      │
                         │ rewrite /*                │ webhook             │               │
                         ▼                           │                     ▼               │
                     Tailscale Funnel ───────────────┼──────────►  lia-wa :8645 (FastAPI)  │
                     demo-hermes (Oracle+Tailscale)  │             Groq STT→LLM→Fish TTS   │
                       :8443 → :3900  (app)          │               │                     │
                       :443 /liawa → :8645           │               ├─► Groq  (STT+LLM)    │
                       :443 /ligar-api → :8765       │               ├─► Fish Audio (TTS)   │
                         │                           │               └─► app :3900          │
                         ▼                           │                  /api/snapshot (RO) │
                Next.js CareCircle :3900             │                                    │
                páginas · APIs · SQLite              │   telefone ◄─PSTN── Twilio ◄─┐      │
                    │                                │                (Calls API)   │      │
         loopback   ├──► lia-wa   :8645  /send       │                Media Streams │wss   │
         127.0.0.1  └──► naima-call :8765 /dial ─────┼──────────────────────────────┘      │
                    (X-Call-Key)                     │        fallback: Agora /v2/         │
                    │                                │        outbound-dial (Elastic SIP) │
                    ▼                                └────────────────────────────────────┘
              ┌─── Agora Cloud ───────────────────────────────────────────┐
              │ RTC+RTM edge ◄══ áudio + legendas ══► navegador /idoso     │
              │ Conversational AI (managed):                               │
              │   AresSTT (pt-PT) → gpt-4o-mini → MiniMaxTTS               │
              │   tool: POST /api/voice/tools/{sid}/prepare-request ──► app│
              └────────────────────────────────────────────────────────────┘
```

## Componentes

| Componente | Onde roda | O que faz |
|---|---|---|
| **App Next.js** | `demo-hermes` · `carecircle.service` · :3900 | Páginas `/demo` `/idoso` `/familia`; APIs `/api/voice/*` (start/stop/text + tool callback), `/api/snapshot`, `/api/actions/*`, `/api/proposals`, `/api/copilot`, `/api/outreach`, `/api/demo`. Sessão cookie `carecircle_session`, `checkOrigin` + `CARECIRCLE_ALLOWED_ORIGINS`, throttle, SQLite (node:sqlite, WAL). |
| **Voz do navegador** | browser (`components/voice-panel.tsx`) | `agora-rtc-sdk-ng` publica mic no canal; `agora-rtm` recebe legendas/estado; `agora-agent-client-toolkit` observa o agente. |
| **Agente de voz do app** | **Agora edge (managed)** — criado por `lib/managed-agent.ts` via `agora-agents` (Area US) | Conversational AI: **AresSTT** (idioma pt-PT — o SDK 2.15.0 não aceita pt-BR — + keywords) → **OpenAI gpt-4o-mini gerenciado** (streaming, tool calling) → **MiniMaxTTS** `speech_2_6_turbo` voz `Portuguese_Wiselady`. VAD + SAL speaker-locking + RTM. Idle 30 s, expira 15 min. |
| **Tool `prepareRequest`** | app (`app/api/voice/tools/{sessionId}/prepare-request`) | Chamada REST síncrona da edge com Bearer capability (hash no DB, 15 min, revogada ao encerrar). Valida sessão + consentimentos e cria/revisa **um único rascunho** (`proposals`, pending). **Nunca envia, confirma ou notifica.** |
| **Confirmação** | app (`/api/actions/confirm_proposal` + cartão «Podemos compartilhar?») | Helena revisa na tela e toca «Confirmar e compartilhar» → `tasks` + `notifications` (idempotente, exige mesma revisão). Pedro aceita no `/familia`. |
| **lia-wa** | `demo-hermes` · `lia-wa.service` · FastAPI :8645 | WhatsApp por nota de voz: webhook Evolution → baixa o áudio → **Groq Whisper** (`whisper-large-v3-turbo→v3`) → **Groq LLM** (`gpt-oss-120b→20b`) com snapshot do círculo (`GET /api/snapshot`, read-only) + `memory.jsonl` + meds/contacts → **Fish Audio TTS** (Isabela pt-BR) → `sendWhatsAppAudio`. Comandos admin por texto (`familia` `contato` `onboard` `remedio` `tomei` `avisa` `marca`), `meds_loop` (60 s), marcadores `[AVISA]/[MARCA]/[TOMEI]/[PRINT_*]`. |
| **naima-call** | `demo-hermes` · `naima-call.service` · FastAPI :8765 (**loopback only**) | `POST /dial` com `X-Call-Key`. Ligação real: **Twilio Calls API + Media Streams** (wss de volta via funnel `/ligar-api`); fallback **Agora ConvoAI `/v2/outbound-dial`** (Elastic SIP) quando Twilio não está configurado. Persona `lia`. Experimento do lab, fora do repo. |
| **Evolution API** | `demo-hermes` · docker (`evolution` + `evo-redis` + `evo-postgres`) · :8082 | Bridge WhatsApp (Baileys), instância `jazz2`: `sendWhatsAppAudio`, `sendText`, `sendMedia`, `getBase64FromMediaMessage`, webhook → lia-wa. |
| **Ingress público** | Vercel + Tailscale | Vercel project «proxy» faz rewrite de `carecircle.jazzautomations.com.br/*` → `demo-hermes…:8443`. Funnel: `:8443→:3900` (app inteiro, incl. tool callback), `:443 /liawa→:8645`, `:443 /ligar-api→:8765`. |

## Onde cada pedaço de IA roda — honestamente

| Camada | Quem executa | Modelo/serviço |
|---|---|---|
| STT da sessão do app | **Agora edge (managed)** | AresSTT — idioma configurado `pt-PT` (enum do SDK não tem pt-BR); respostas em pt-BR via prompt |
| LLM da sessão do app | **Agora edge (managed)** | `gpt-4o-mini` via preset gerenciado da Agora — sem chave OpenAI própria para a voz |
| TTS da sessão do app | **Agora edge (managed)** | MiniMax `speech_2_6_turbo` · `Portuguese_Wiselady` |
| Lia no WhatsApp (STT/LLM/TTS) | **Self-hosted + APIs externas** — **NÃO é edge Agora** | Groq Whisper → Groq `gpt-oss` → Fish Audio `speech-1.5` (chaves próprias, por HTTP) |
| Copilot do familiar + teste de texto | App → **OpenAI API** direta | `gpt-4o-mini` (`OPENAI_API_KEY`/`OPENAI_MODEL`); fallback «modo registros» sem IA |
| Ligação «Canais reais» | **naima-call** (self-hosted) + Twilio/Agora | Twilio Calls API + Media Streams (principal); Agora `/v2/outbound-dial` Elastic SIP (fallback) |
| Narração do vídeo de pitch | **Fish Audio TTS** | mesma voz/persona da Lia do WhatsApp (o take por agente Agora `speak` saiu degradado e foi descartado — declarado) |

## Limitações e declarações (verdade operacional)

- **A Lia do WhatsApp não roda na edge Agora.** O arquivo `lia_wa.py` contém uma ponte
  experimental (`LiaSession`/`WABridge` — agora.rtc Python SDK + `agora_agent`, DeepgramSTT
  nova-3 + gpt-4o-mini + Fish/MiniMax TTS + tool `circle_action` em `POST /tool/{token}`)
  **que nunca é invocada pelo webhook** — a edge não disparava turnos de forma confiável
  com áudio «push», conforme declarado em [`SUBMISSAO.md`](SUBMISSAO.md). O caminho ativo
  é Groq Whisper → Groq LLM → Fish TTS. A variável `TTS_VENDOR=minimax` no servidor afeta
  **somente** esse caminho experimental; as respostas reais sempre usam `fish_tts`.
- **Família é notificada no painel, não no WhatsApp.** `confirm_proposal` cria
  notificação in-app (`notifications`, visível em `/familia`). WhatsApp/ligação só saem
  pelo disparo manual de «Canais reais» (`/api/outreach`) ou pelas ações da Lia do
  WhatsApp (`avisa`/`marca`, gated por member/ADMIN_PHONES).
- **Confirmação é visual e explícita**, por botões no cartão («Confirmar e compartilhar» /
  «Não compartilhar») — não é um checkbox do pedido; os checkboxes da tela são os
  consentimentos de privacidade (`checkins`, `family_updates` por destinatário).
- `/api/voice/llm/{sessionId}` retorna **410** (pipeline Realtime aposentado; a edge Agora
  executa ASR/LLM/TTS). Não existe rota `lia-data`.
- Em produção a tool da edge entra pelo próprio funnel `:8443` → app (`CARECIRCLE_VOICE_TOOL_URL`).
  O gateway allowlist `scripts/voice-tool-gateway.ts` (:3002) existe para desenvolvimento
  local, mas não está em execução na demo.
- `/dial` do naima-call responde **401** sem `X-Call-Key` válido; com `say` definido
  (caso do outreach), uma falha do Twilio **não** cai no fallback Agora — o fallback só
  vale quando Twilio não está configurado (ou em chamadas sem `say`).
- Login `/api/demo`, SQLite local e personas fictícias são declaradamente parte da demo —
  autenticação real é próximo passo.
