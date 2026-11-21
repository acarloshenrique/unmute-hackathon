> Histórico: OpenAI Realtime foi substituído pelo modo gerenciado da Agora. Estado atual em [managed-voice-validation.md](managed-voice-validation.md).

# Migração Realtime — evidências locais

**Realtime implementado, não validado em chamada.**

## Checkout e escopo
Inspeção antes de editar: `git status --short --branch` limpo; último commit `61299a110f50edcb52274d992285d6a489e01340`; README e tipos de `agora-agents@2.15.0` lidos. Sem push, deploy, atualização de dependências ou migração de banco.

Mudança restrita à voz da Lia e ao único pedido fictício de companhia de Pedro para ir à feira no sábado. Propostas, consentimentos, tarefas e aceite existentes reaproveitados.

## Contratos conferidos
- SDK instalado: `OpenAIRealtimeOptions`, `BaseMllmOptions.tools`, `LlmTool`, `LlmToolServer`, `MllmTurnDetection` e `Agent.toProperties()`.
- [Guia MLLM oficial](https://github.com/AgoraIO/agora-agents-ts/blob/main/docs/guides/mllm-flow.md): withMllm omite asr/llm/tts, aceita ferramentas REST e server_vad.
- [Ferramentas oficiais](https://docs.agora.io/en/ai/platform/build/tools/custom-tools.md): mllm.tools, withTools(true), POST síncrono, headers constantes e placeholders integrais args/tool_call_id.
- Sem VAD de topo do pipeline anterior. RTM e data_channel=rtm mantidos; testes conferem a configuração serializada, não eventos cloud.
- Interrupção real não testada. Não foi inventada uma configuração adicional de interrupção.

## Arquivos alterados
| Arquivo | Motivo |
|---|---|
| lib/voice.ts | Iniciar somente agente MLLM, modelo e configuração separados |
| lib/realtime-agent.ts | OpenAIRealtime gpt-realtime, server_vad e uma ferramenta |
| lib/realtime-request.ts | Rascunho único, correção e controle de revisão |
| app/api/voice/tools/[sessionId]/prepare-request/route.ts | Capacidade curta de sessão e validação HTTP |
| app/api/voice/llm/[sessionId]/route.ts | Callback antigo desativado com 410 |
| lib/domain.ts | Rejeitar confirmação visual antiga sem mudar schema |
| lib/client.ts | Tipo da revisão privada |
| components/care-app.tsx | Enviar revisão exibida, indicar correção e cenário feira |
| scripts/voice-tool-gateway.ts | Proxy local restrito ao único endpoint POST |
| package.json | Comando voice:gateway, sem novas dependências |
| .env.example | OPENAI_REALTIME_MODEL e CARECIRCLE_VOICE_TOOL_URL |
| tests/realtime.test.ts | Autorização, revisão, idempotência e configuração SDK |
| tests/e2e/realtime.spec.ts | Helena/Pedro em contextos separados, sem áudio |
| README.md | Caminho atual, configuração e limites |
| docs/demo-script.md | Roteiro único feira/sábado/10h |
| docs/architecture.md | Aviso de arquitetura anterior substituída |
| docs/realtime-validation.md | Este registro |

## Ajustes de diagnóstico do microfone
- `components/voice-panel.tsx`: nível local, captura/publicação distintas e liberação em falha/saída do agente.
- `lib/voice-feedback.ts` e `tests/voice-feedback.test.ts`: mensagens por etapa e proteção contra vazamento do payload em erros.
- `tests/e2e/demo.spec.ts`: a jornada escrita verifica microfone desligado; não presume credenciais ausentes.

## Resultado automatizado observado
- `npm run check`: typegen/typecheck, lint, **52 unitários aprovados**, build aprovado.
- `npm run test:e2e`: **4 aprovados** (os 2 existentes + 2 novos).
- Total: **56 testes aprovados, 0 falhas na última execução observada**.
- Três testes adicionais cobrem saldo, permissão/dispositivo e mensagens seguras; nenhum comprova áudio físico.
- Os 13 novos unitários incluem autorização ausente/errada/de outra sessão, expiração, encerramento/revogação, destinatário sem consentimento, IDs extras recusados, revisão fora de ordem, replay, confirmação antiga/sem revisão, clique repetido, cancelamento e serialização do SDK.
- A primeira tentativa dos novos E2E falhou ao usar check() num controle de consentimento assíncrono. O teste passou a aguardar a resposta de gravação e o estado persistido; as duas jornadas passaram depois.
- Na primeira execução com credenciais configuradas, um E2E legado falhou por presumir botão de voz desabilitado. A expectativa foi corrigida; a nova execução completa aprovou os 4 testes. Banco de E2E separado do banco local da demo.
- Testes E2E criam sessões de voz **fictícias** diretamente no banco de teste. Não acionam microfone, OpenAI ou Agora. Não são prova de áudio.
- Testes legados de limpeza de recursos continuam aprovados; isso não comprova a liberação de um microfone físico após Realtime.

## Interface e banco observados no E2E
Primeira proposta → correção para 10:00 no mesmo ID → Pedro vê zero tarefas → confirmação antiga retorna 409 → confirmação atual e clique duplo criam um único cartão e uma única notificação → Pedro aceita → recarga preserva Aceita. Segundo teste: cancelar e repetir a ferramenta continua sem cartão ou notificação.

## Gateway e bloqueio real observados
- Credenciais Agora e origem HTTPS do gateway presentes localmente (valores não impressos).
- POST `/api/voice/start`: 200; POST `/api/voice/stop`: 200/disconnected. Este teste não ingressou no RTC nem abriu microfone.
- Túnel público restrito à porta 3002: `/api/demo` e `/familia` retornaram 404; ferramenta sem autorização retornou 401.
- Diagnóstico de 21/11/2026: conexão direta ao WebSocket oficial `wss://api.openai.com/v1/realtime`, modelo `gpt-realtime`, com a chave existente, retornou **`credit_balance_exhausted` / `insufficient_quota`**. A criação da sessão foi recusada. A chave não foi alterada e nenhum valor de credencial foi exibido.
- Navegador de teste em origem local segura reconheceu uma entrada de áudio e permissão de microfone pendente (`prompt`). Isso não comprova que o navegador do usuário capturou sua fala.
- Acrescentados medidor local e estados de captura/publicação; tratamento de erro por etapa e desligamento em falha do agente. Mensagens não reproduzem chaves, tokens, payloads ou transcrições.
- Sessão cloud que ficou ativa: encerramento pendente na primeira tentativa; nova tentativa confirmou desligamento e revogação da capacidade.
- **Realtime implementado, não validado em chamada.** Não houve áudio bidirecional observado, medição de latência ou interrupção real. É necessário regularizar o saldo da organização OpenAI e repetir a jornada real.

## Rodar a demo após configurar
`npm run check` → `npm start`; em outro terminal `npm run voice:gateway`. Expor via HTTPS somente 127.0.0.1:3002 e configurar sua origem no app. Nunca expor 3000/login fictício pelo túnel. Manter a chave no servidor.

Helena autoriza Pedro no app; Pedro abre tarefas em outro perfil do navegador. Iniciar voz e fazer as duas falas, revisar 10:00, confirmar, aceitar e recarregar. Depois testar cancelamento em sessão limpa. Encerrar e observar microfone físico e estado do servidor. Se interrupção não for estável, a gravação não deve depender dela.
