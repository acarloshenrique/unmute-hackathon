# Arquitetura CareCircle — Agora gerenciada

## Decisão atual
Uma única arquitetura de voz, adaptada do quickstart oficial Agora já inspecionado: Agora RTC/RTM + Conversational AI, com Agora ARES, GPT-4o-mini e MiniMax Speech 2.6 Turbo fornecidos em modo gerenciado pela Agora. Sem chaves próprias dos provedores e sem OpenAI Realtime. O GPT usado pela Agora é um modelo de terceiro; conta, credenciais e contratação da voz ficam na Agora.

## Fronteiras
- `components/voice-panel.tsx`: permissão, captura, medidor local, RTC/RTM, reprodução, estado e liberação do microfone. Não grava áudio ou histórico de legendas.
- `lib/voice.ts`: autenticação do idoso, consentimento, sessão persistida, credencial RTC/RTM curta, criação/encerramento do agente e limpeza de sessões pendentes.
- `lib/managed-agent.ts`: único pipeline de voz, baseado no quickstart. Reconhecimento por ARES, prompt do perfil escolhido em pt-BR, voz portuguesa, VAD compatível, RTM e ferramenta REST em `llm.tools`. Não lê chave OpenAI.
- Agora: ARES → LLM com ferramenta → TTS; transporta áudio pelo RTC. `AgentSession` infere os presets gerenciados dos modelos suportados.
- `scripts/voice-tool-gateway.ts`: somente POST da ferramenta na porta 3002. Outros caminhos, métodos e queries recebem 404. Não encaminha cookies.
- `lib/realtime-request.ts`: nome histórico do módulo de proposta, reaproveitado sem nova stack. Valida sessão, pessoa, consentimento e destinatário; prepara/revisa um único rascunho privado.
- `lib/domain.ts`: confirmação visual com revisão, transação, chave idempotente e tarefa/notificação únicas. Aceite e autorização por família permanecem no domínio.
- SQLite: persistência existente e tabela aditiva de preferências por pessoa. Autorizações sempre derivadas da sessão do servidor.
- Copilot textual: integração OpenAI opcional preexistente, com resposta a partir dos registros quando indisponível. Não participa da voz.

## Fluxo e autorização
Helena liga microfone → sessão com UID e canal restritos → conversa em português via Agora → ferramenta prepara rascunho → tela atualiza a revisão → Helena confirma visualmente → domínio persiste uma tarefa e notificação → Pedro aceita.

Modelo não autoriza compartilhamento. IDs de família e usuário enviados pelo modelo são recusados. A capacidade da ferramenta é curta, armazenada somente como hash e revogada ao encerrar ou revogar consentimento. Correção atrasada não pode substituir a revisão atual e confirmação antiga não compartilha texto antigo. Cancelamento não cria cartão.

## Operação e evidência
Servidor Next em 127.0.0.1:3000; gateway em 127.0.0.1:3002; túnel apenas no gateway. Scheduler persistido cria convites e não liga áudio sem interação. Pessoas e fixtures são fictícias e identificadas na UI. Não há áudio bruto ou transcrição completa persistidos.

Início HTTP, RUNNING ou conexão RTC são evidências de etapas, não de conversa completa. Consulte `managed-voice-validation.md` para verificações observadas. Não anunciar voz bidirecional, interrupção ou latência até medir em chamada. A escolha de estilo fica no painel familiar existente, com tabela aditiva de preferências e sem novas integrações externas.

## Fontes
- Quickstart inspecionado localmente em `.agent-local/agora-quickstart`, commit `24374411cdd809701e2a39466f4f97d52e23f173`.
- [Modo gerenciado](https://docs.agora.io/en/ai/build/managed-mode).
- [Ferramentas REST](https://docs.agora.io/en/ai/platform/build/tools/custom-tools).
- Tipos e implementação de `agora-agents@2.15.0` instalados, incluindo inferência de presets por `AgentSession`.

## Perfis de cuidadora virtual
Preferência persistida por pessoa em `caregiver_preferences`, padrão Lia. Mutação autenticada somente por familiar autorizado para aquele perfil; sem mudança de consentimentos. Scheduler e convites usam o nome atual; a próxima sessão captura nome/estilo e preserva o mesmo TTS. Sessão ativa não é alterada pela seleção. A pessoa idosa aceita Conversar ou recusa Agora não; solicitação de microfone ocorre após o aceite. Evidências e limites em [caregiver-profiles.md](caregiver-profiles.md).

## Idioma do reconhecimento e conversa
O ARES herda `turnDetection.language`: agora `pt-PT`, português disponível no SDK 2.15.0; o padrão anterior era en-US. Saída orientada por prompt em pt-BR, sem afirmar reconhecimento brasileiro nativo. Mesmo modelo e timbre, respostas em streaming e pausas ajustadas por estilo. Ver [validação de conversa](voice-conversation-quality.md), que separa modelo com texto, transporte RTC e testes humanos pendentes.
