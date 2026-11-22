# Escolher cuidadora virtual — implementação e validação

## Escopo e componentes
Checkout inspecionado antes de editar: main limpa em `a4e3e54`. Preservado o caminho Agora gerenciado ARES/SAL → LLM → MiniMax. Nenhuma dependência, chave, modelo ou configuração OpenAI Realtime foi introduzida.

- `lib/caregivers.ts`: catálogo fixo Lia/Acolhedora, Clara/Direta e Rosa/Paciente. Texto livre e timbre enviados pelo cliente não são aceitos.
- `migrations/sqlite.sql`: tabela aditiva `caregiver_preferences`, chave por `care_profile_id`, autora e horário da alteração; padrão Lia sem reescrever perfis existentes. Reset fictício limpa a preferência.
- `lib/domain.ts`: `select_caregiver` exige familiar, perfil da mesma família e consentimento `family_updates` vigente para esse familiar. Validação de IDs e enum no servidor. Um perfil não altera outro nem os consentimentos.
- `components/caregiver-picker.tsx`: escolha acessível por rádio no painel familiar, perfil ativo e explicação de que a diferença é estilo de fala, com o mesmo timbre.
- Scheduler anuncia o nome escolhido. Troca de preferência atualiza convites ainda pendentes; não encerra ou reconfigura sessão ativa.
- `respond_invitation`: só a pessoa convidada aceita/recusa. Recusa é persistida, encerra a ocorrência e não compartilha resumo ou tarefa. Aceite não equivale a consentimento de compartilhamento.
- `lib/voice.ts` e `lib/managed-agent.ts`: a próxima sessão captura o perfil e injeta nome/estilo em instruções, saudação e nome reconhecido por ARES. Credenciais, RTC/RTM, SAL, ferramentas e MiniMax existentes mantidos. Timbre invariável `Portuguese_Wiselady`.
- `components/voice-panel.tsx`: nome da sessão fica fixo mesmo se o familiar mudar a preferência. Nenhum seletor para a pessoa idosa. O aceite do convite precede a solicitação do microfone; Agora não não importa/inicia o SDK de áudio.
- Gateway continua restrito à ferramenta. Propostas, revisão, confirmação explícita e permissões de compartilhamento permanecem no fluxo anterior.

## Comandos e resultados observados
- `npm run check`: tipos, lint, **63 testes unitários** e build aprovados.
- `npm run test:e2e`: **6 aprovados** no banco separado `.agent-local/caregiver-feature-qa.sqlite`; **69 testes ao todo** na última bateria observada.
- Testes unitários novos: padrão, persistência após reabrir SQLite, bloqueios de papel/família/consentimento revogado, isolamento por pessoa, validação de parâmetros, convites, recusa, ausência de compartilhamento e sessão ativa preservada. Configuração serializada dos três perfis mantém o mesmo TTS e verifica as instruções pacientes da Rosa.
- O teste da sessão ativa substitui somente o ciclo do agente por mock. Confirma o perfil passado à fábrica e a ausência de alteração na sessão; não comprova áudio ou comportamento do modelo.
- E2E: Ana escolhe Rosa, recarrega, vê Rosa ativa; o convite da Helena anuncia Rosa. A pessoa idosa não vê rádio/seletor de perfil. Solicitação de microfone acontece somente após resposta positiva do servidor ao aceite. O teste recusa o microfone deliberadamente e não cria sessão cloud. Isso não representa chamada real.
- E2E de Agora não: zero solicitações de microfone, zero sessão, nenhum novo relato/tarefa para o familiar. Os quatro E2E anteriores de agenda, revisão, cancelamento, cartão único e aceite persistido continuam passando.
- Na primeira execução, os dois novos E2E falharam porque o preparo tentou reset sem autenticar. O helper foi corrigido para autenticar antes do reset; a execução completa seguinte aprovou os seis.
- Interface inspecionada no navegador: Rosa permanece marcada após recarga; cartão legível em desktop e 390 px, sem overflow horizontal.

## O que foi testado com a Agora real
Banco e pessoas fictícios; processo de teste sem chave OpenAI própria. Agendamento e disparo reais no banco de QA, convite anunciado como Rosa, aceite HTTP 200 e início real do agente Agora HTTP 200 com o perfil retornado **Rosa · Paciente**. O microfone não foi aberto nesse teste de servidor. A primeira tentativa de encerrar retornou 502; nova tentativa retornou 200 e a consulta confirmou zero sessões abertas.

**Conversa humana com Rosa e seu estilo paciente ainda não validada em chamada.** Não foram observados áudio bidirecional, ritmo audível, interrupção por fala ou compreensão humana nesta funcionalidade. Início HTTP 200 e testes com mocks não provam esses resultados. Não há benchmark de latência.

A migração PostgreSQL complementar, com RLS e sem escrita direta de cliente, foi fornecida e não executada. O adaptador ativo é SQLite. Não houve push ou deploy desta funcionalidade.

## Repetir o aceite manual
1. Rodar `npm start` e manter gateway/túnel da porta 3002 abertos. Usar dois perfis de navegador, com identidades fictícias separadas.
2. Ana abre `/familia`, escolhe Rosa · Paciente e recarrega. Verificar Rosa ativa. Alteração exige autorização já existente de Helena para Ana; não criar consentimentos automaticamente.
3. Agendar uma conversa próxima e disparar pelo controle demo. Helena abre `/idoso`: deve ler Rosa e ver Conversar/Agora não. Não há seletor.
4. Antes de clicar, verificar microfone desligado. Clicar Conversar, permitir microfone e falar com Rosa; conferir apresentação e estilo paciente em áudio real.
5. Se criar pedido, conferir que permanece rascunho privado até a confirmação visual. Aceitar o convite não compartilha resumo.
6. Durante a sessão, Ana pode escolher Clara. A conversa atual deve continuar com Rosa; depois de encerrar, a próxima começa com Clara. O timbre permanece o mesmo.
7. Testar outra pessoa acompanhada: sua preferência e consentimentos não devem mudar. Em um novo convite, testar Agora não e verificar que não há captura nem resumo/tarefa.
8. Encerrar e conferir liberação do microfone e confirmação do servidor; repetir encerramento se houver falha transitória.
