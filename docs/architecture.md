# Arquitetura CareCircle

## Decisão e escopo
Next.js App Router, TypeScript estrito, SQLite em disco (Node 24), ferramentas Zod e OpenAI no servidor. Um processo scheduler independente consulta ocorrências vencidas. A aplicação serve somente em 127.0.0.1 por padrão. A demonstração usa três identidades fictícias e cookies opacos HttpOnly persistidos; não constitui autenticação empresarial. Sem Supabase configurado, nenhuma integração Supabase é anunciada como ativa.

## Fronteiras
Navegador → API com sessão autenticada → serviços de domínio → SQLite.
Navegador → Agora RTC (microfone/áudio) + RTM (legendas/estado).
Servidor → agora-agents (start/stop), agora-token (token RTC+RTM com validade curta).
Agora STT → endpoint HTTPS compatível com Chat Completions e token por sessão → OpenAI com ferramentas → texto SSE → Agora TTS → navegador.
Consentimento persistido e confirmação de ação por interface são obrigatórios para compartilhar. A fala do modelo não concede autorização. Propostas de tarefas não notificam familiares; a pessoa revisa e confirma no seu navegador.

## Fonte e mapa de adaptação
Quickstart oficial: https://github.com/AgoraIO-Conversational-AI/agent-quickstart-nextjs
Commit inspecionado: 24374411cdd809701e2a39466f4f97d52e23f173.

| Fonte oficial | CareCircle | Adaptação |
|---|---|---|
| app/api/generate-agora-token/route.ts | lib/voice.ts | token RTC+RTM, UID/canal gerados pelo servidor, 15 minutos |
| app/api/invite-agent/route.ts | lib/voice.ts | Agent/AgoraClient, português, custom LLM por sessão |
| app/api/stop-conversation/route.ts | lib/voice.ts | stop idempotente, propriedade da sessão |
| components/LandingPage.tsx | components/voice-panel.tsx | importação no navegador, RTM login/subscribe, cleanup |
| components/ConversationComponent.tsx | components/voice-panel.tsx | RTC publish/subscribe e toolkit para estados/legendas |
| lib/chat-completions.ts | app/api/voice/llm/[sessionId]/route.ts | SSE compatível, execução de ferramentas no servidor |

OpenAI Realtime não foi escolhido: o caminho exato de ferramentas exigido não foi comprovado nessa integração. O quickstart e o servidor custom LLM oficial documentam STT → LLM → TTS; usamos apenas esse caminho.

## Limites de confiança
IDs de família e ator nunca vêm do modelo. A sessão determina o ator. Eventos e consultas filtram perfil, família, destinatário e consentimento. Sem transcrições integrais em disco; apenas eventos autorizados e propostas mínimas. Não há fatos clínicos derivados. Silêncio nunca vira confirmação.

## Tempo e concorrência
Rotinas únicas ou diárias em America/Sao_Paulo. Índice único por rotina/instante. Transação IMMEDIATE para reservar ocorrência e gravar convite, evento e notificações atomicamente. Horário silencioso 21h–8h, tentativas limitadas com backoff e relógio de demonstração separado, persistido. O worker de produção nunca usa o relógio de demonstração.

## Evolução
migrations/postgres.sql cria a estrutura equivalente com RLS. A migração não liga automaticamente Supabase Auth/Realtime: isso exige adaptador, identidade e testes antes de hospedar com dados reais.

## Evidência de voz
Fonte oficial inspecionada. Sessão Agora e áudio bidirecional ainda NÃO comprovados: faltam credenciais e endpoint HTTPS público. Não tratar compilação ou demo textual como validação de voz.
## Versões efetivamente instaladas
Next.js 16.4.6; React 19.3.1; agora-agents 2.15.0; agora-rtc-sdk-ng 4.24.10; agora-rtm 2.3.0; agora-agent-client-toolkit 2.10.0; agora-token 2.0.7; OpenAI SDK 6.49.0; Zod 4.6.7. Fonte reproduzível: package-lock.json.

## Prova externa versus esta aplicação
Notas de outros integrantes podem descrever sessões em outra stack. Elas não substituem a validação do CareCircle desta entrega. Os campos de runtime desta aplicação continuam: quickstart_repo_cloned=true; agent_join_verified=false; rtc_client_connected=false. A chamada real OpenAI retornou 429/credit_balance_exhausted. O copilot usa consulta direta com aviso quando o provedor falha.