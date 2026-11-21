# Achados técnicos — Agora ConvoAI (estudo OpenAPI + testes ao vivo)

> Levantado 21/11 à noite da spec oficial `conversational-ai-api-v2.x.yaml` + testes reais
> no projeto "Hackathon" (RTC + ConvoAI + custom LLM + telefonia provados).
> Serve de mapa: o que a plataforma já dá de graça vs. o que precisamos construir.

## Arsenal nativo que resolve critério da rubrica

| Feature | Onde (join payload) | Por que importa |
|---|---|---|
| **Filler words** | `filler_words.enable` + `trigger.fixed_time_config.response_wait_ms` + `content.static_config.phrases[]` | Latência percebida (voice exp 25%). A agente diz "deixa eu ver aqui…" enquanto o LLM pensa. Nativo — não precisamos inventar. |
| **SAL — Selective Attention Locking** | `sal.sal_mode: "locking"` (ou `recognition` + `sample_urls`) | Trava na voz do usuário e **bloqueia 95% de voz/ruído ambiente**. CRÍTICO pra demo ao vivo no venue barulhento. Speaker-lock seamless: usuário fala claro no início → agente reconhece e trava. |
| **EoS semântico + pausa** | `turn_detection.config.end_of_speech.mode: "semantic"` + `semantic_config.pause_state_enabled` | Idoso pausa no meio da frase ("peraí…", "deixa eu pensar") SEM o agente cortar. É literalmente o caso de uso do nosso produto. `max_wait_ms` limita a espera. |
| **Interrupção por keywords** | `interruption.mode: "keywords"` + `keywords_config.trigger_keywords[]` | Agente só para quando ouve palavra-chave ("Rosa, para"). Tosse/ruído do idoso não interrompe — naturalidade sem falso barge-in. |
| **Silence config** | `parameters.silence_config.timeout_ms` + `action: "speak"` + `content` | Se o idoso ficar calado, a agente puxa conversa ("tô aqui se quiser conversar"). Versão mini do nosso check-in de 12h — demonstra a ideia em 30s. |
| **Greeting + failure message** | `greeting_message` / `greeting_configs` / `failure_message` | Saudação ao entrar + fala de fallback se o LLM falhar = "failure recovery" da rubrica de graça. |
| **Template variables** | `llm.template_variables` (`{{nome}}` no prompt/greeting) | Personaliza nome do idoso/família sem rebuild. |
| **skip_patterns** | `tts.skip_patterns: [3,4,5]` | TTS pula `()`, `[]`, `{}` — LLM não lê markdown em voz alta. |
| **opt_out** | `parameters.opt_out: true` | Desliga retenção de dados da sessão — argumento LGPD/privacidade pro pitch (idosos = dado sensível). |
| **RTM data channel** | `advanced_features.enable_rtm: true` + `parameters.data_channel: "rtm"` + `enable_metrics` | Transcrição e eventos ao vivo no cliente → segunda tela (TV) e legenda na demo. Sem os dois flags os eventos não chegam. |
| **audio_scenario** | `parameters.audio_scenario: "aiserver"` | Perfil de áudio otimizado pra conversa com agente. |
| **`/speak` e `/interrupt`** | REST `POST /agents/{id}/speak` + `/interrupt` | Servidor injeta fala no agente (proatividade: "chegou mensagem da neta") e corta a fala dele — base dos comandos proativos do produto. |
| **farewell_config** | `parameters.farewell_config.graceful_enabled` | Desligar esperando o agente ir a IDLE — despedida limpa. |

## MLLM — voz-a-voz end-to-end (alternativa ao pipeline ASR→LLM→TTS)

`mllm.enable: true` + `vendor`: **openai** (Realtime API), **gemini** (Live), **vertexai**, **xai** (Grok).
Substitui ASR+LLM+TTS por um único modelo de áudio nativo — latência ~0,5s, interrupção fluida.
Turn detection do MLLM: `agora_vad` · `server_vad` (OpenAI+Gemini) · `semantic_vad` (só OpenAI).
Custo: precisa de key da vendor (não sai dos minutos managed) e o cérebro vira o modelo, não nosso LLM custom.
**Avaliação pra nós: pipeline managed já funciona; MLLM é upgrade de fluidez SE sobrar tempo e key.**

## Avatares (track "avatars that connect")

`avatar.enable` + `vendor`: **akool**, **liveavatar**, **anam**, **generic** (todos Beta).
Vídeo do avatar no canal RTC. Diferencial forte pro produto de idosos (rosto presente), mas é +1 integração inteira — só se a voz estiver redonda.

## Vendors disponíveis (managed = sai dos nossos 285min grátis)

- **ASR**: `ares` (default, engine da Agora — já validada pt-BR), `deepgram`, `microsoft`, `google`, `openai`, `speechmatics`, `assemblyai`, `amazon`, `sarvam`, `xai`
- **TTS**: `microsoft`, `elevenlabs`, `minimax` (voz pt-BR boa — validada), `deepgram`, `murf`, `cartesia`, `openai`, `humeai`, `rime`, `fishaudio`, `google`, `amazon`, `sarvam`, `xai`
- `asr.params` / `tts.params` = passthrough pro vendor (Deepgram aceita `keywords`/`keyterm` como hotword boost)

## Config recomendada pro companion (join payload — núcleo)

```json
{
  "turn_detection": { "config": {
    "end_of_speech": { "mode": "semantic",
      "semantic_config": { "silence_duration_ms": 480, "max_wait_ms": 3000, "pause_state_enabled": true } }
  }},
  "sal": { "sal_mode": "locking" },
  "filler_words": { "enable": true,
    "trigger": { "mode": "fixed_time", "fixed_time_config": { "response_wait_ms": 1400 } },
    "content": { "mode": "static", "static_config": {
      "phrases": ["deixa eu ver aqui", "um instante", "hmm, boa pergunta", "só um segundinho"],
      "selection_rule": "shuffle" } } },
  "parameters": {
    "data_channel": "rtm", "enable_metrics": true, "enable_error_message": true,
    "audio_scenario": "aiserver", "opt_out": true,
    "silence_config": { "timeout_ms": 30000, "action": "speak",
      "content": "Tô aqui se quiser continuar conversando." }
  },
  "advanced_features": { "enable_rtm": true },
  "tts": { "vendor": "minimax", "params": { "…": "voice pt-BR" }, "skip_patterns": [3,4,5] },
  "asr": { "vendor": "ares", "language": "pt-BR" },
  "llm": { "url": "<custom LLM do time>", "greeting_message": "Oi! Tô aqui com você.",
           "failure_message": "Tive uma dificuldade aqui, pode repetir?",
           "template_variables": { "nome_idoso": "Rosa" } }
}
```

Ajuste fino no venue: se a sala estiver MUITO ruidosa, subir `speech_threshold` ou trocar SoS pra `keywords`.

## Bugs da Agora encontrados (report — pedido do Darpa)

| # | Bug | Evidência |
|---|---|---|
| 1 | **`/outbound-dial` aceita e retorna `sip_call_id` mas nunca emite INVITE ao SIP trunk** — a chamada morre sem sair. | Trunk Twilio verificado do zero (IP ACL probe 403→407 com digest, credencial válida, transporte UDP, número ativo, saldo US$20). Agora retorna só `NO_ANSWER`. call `38b0acac…`, sip `01a1fefa…`, req `a6cec5d0…` |
| 2 | **Resposta do dial volta `status: null` e `agent_id: null`** — impossível saber o estado real da chamada. | Mesmas respostas das 4 tentativas. |
| 3 | **Query da chamada: `hangup_reason_code: NO_ANSWER` com `hangup_reason: null`** — falha interna é indistinguível de "não atendeu". | Todas as queries. |
| 4 | **Custom LLM recebe a MESMA fala duas vezes em requests paralelas** (primeira ainda aberta). | Log do nosso endpoint, 2× POST `15:47:45`+`15:47:47`… |
| 5 | **Custom LLM recebe request SEM nenhuma utterance** (lista de mensagens vazia de usuário). | Log do endpoint. |
| 6 | **Console → Phone numbers → Associate Agent: dropdown não lista agente criado pela API** (só os do Studio). | Agent `naima-phone` criado por API existe (GET ok) mas não aparece no dropdown de binding. |
| 7 | **Console Agent Studio: builder não aceita custom LLM** — só vendors managed. Limitação UI vs. o que a API aceita (`llm.url`). | Dropdown de vendor do builder sem opção custom. |

## O que já está PROVADO no nosso stack (não é especulação)

- Canal RTC + token007 mintando do nosso backend ✔
- ConvoAI **custom_llm** → endpoint OpenAI-compatible falando com agente real (Hermes ACP) — streaming, ferramentas, memória por sessão ✔
- ARES ASR `pt-BR` + keywords (nomes do time) ✔
- MiniMax TTS pt-BR (voz natural) + edge-tts local como alternativa ✔
- RTM data channel com transcript ao vivo (baseline quickstart) ✔
- **PSTN real: ligação telefônica funcionando** via Twilio Calls API + Media Streams (a rota Agora SIP está quebrada — bug #1 — então bypass direto Twilio) ✔
- Evolution API própria servindo WhatsApp (pareada hoje, instância `jazz` open) ✔

## Lacunas que a demo precisa decidir

- [ ] Segunda tela/TV (RTM → Chrome pareado mostrando foto) — viável, 1 evento
- [ ] Memory capsule (gravar trecho com permissão → arquivo) — usar Cloud Recording ou gravar local?
- [ ] Check-in/12h rule com "test clock" rotulado (o spec pede relógio de teste claramente identificado)
- [ ] Avatar (beta) — só se voz estiver estabilizada
- [ ] MLLM Gemini/OpenAI — só com key e se latência managed incomodar
