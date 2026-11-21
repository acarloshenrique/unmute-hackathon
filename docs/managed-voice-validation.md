# Validação — voz gerenciada pela Agora

## Alteração
A pedido do usuário, substituído o OpenAI Realtime pelo pipeline gerenciado oficial Agora: Deepgram Nova-3 pt-BR, GPT-4o-mini e MiniMax Speech 2.6 Turbo com voz Portuguese_Wiselady. Sem chave própria de provedor. `prepareRequest` passa de `mllm.tools` para `llm.tools`; endpoint, consentimento, revisão, confirmação visual e persistência são preservados. Não houve migração de banco, push ou deploy.

Arquivos: `lib/managed-agent.ts` (substitui `lib/realtime-agent.ts`), `lib/voice.ts`, `lib/voice-feedback.ts`, `tests/realtime.test.ts`, `.env.example`, README e documentação de arquitetura/demo/validação. O nome histórico `realtime-request` não indica uma segunda stack.

## Resultado observado em 21/11/2026
- Typecheck/lint e 52 testes unitários passaram antes da validação de servidor. O teste de SDK verifica ASR pt-BR, ausência de chaves próprias, ausência de MLLM, ferramenta REST e VAD.
- O SDK não aceita pt-BR em turnDetection.language; essa opção não é enviada. pt-BR permanece em DeepgramSTT e o VAD usa os parâmetros do quickstart.
- Áudio bidirecional e interrupção ainda não observados. Testes com fixtures não comprovam voz.

## Comandos e evidências
- `npm run check`: tipos, lint, 52 testes unitários e build aprovados.
- `npm run test:e2e`: 4 aprovados com banco isolado `.agent-local/managed-voice-e2e.sqlite`. Rascunho, correção, revisão antiga, cartão único, aceite persistido e cancelamento continuam passando. Sessões de ferramenta no E2E são fictícias.
- Processo do servidor de teste iniciou com `OPENAI_API_KEY` vazia. POST início real da voz retornou 200; encerramento retornou 200/disconnected. Confirma que não depende da chave própria OpenAI, não comprova conversa.
- Gateway público: login fictício 404; ferramenta sem autorização 401.
- Teste no navegador sem injetar fala ou áudio: uma track de microfone live, enabled e sem mute; dispositivo não identificado como fake/mock; medidor com sinal maior que zero (uma amostra de aproximadamente 0,45, sem alegação de desempenho). Publicação na Agora concluída.
- Recebidos estados reais do agente “falando” e “ouvindo” e uma legenda. Não foi inspecionado ou persistido conteúdo de fala privada. Esses eventos não comprovam que uma pessoa ouviu áudio ou que o pedido completo foi compreendido.
- Ao encerrar pelo botão, a track passou para ended e a UI indicou microfone desligado. Não houve áudio simulado. A permissão concedida ao navegador de teste não configura automaticamente outros navegadores/perfis do usuário.
- Nenhuma medição de latência ou interrupção com fala real. Ainda falta conversa humana completa: pedir companhia, corrigir 10h, confirmar na tela e Pedro aceitar. Não anunciar o caminho de áudio bidirecional como validado antes desse teste.

## Repetir a demo
Manter `npm start`, `npm run voice:gateway` e o túnel da porta 3002 abertos. Entrar como Helena em `/demo`, abrir `/idoso`, autorizar convites e Pedro, clicar Conversar com Lia e permitir o microfone. Ver roteiro em `demo-script.md`. A voz usa somente credenciais/contratação Agora. O copilot textual opcional continua separado.

## Integração dos commits remotos antes da publicação
Os seis commits já publicados foram preservados. Os ajustes de reconhecimento ARES e SAL locking foram transportados de `lib/voice.ts` para `lib/managed-agent.ts`, mantendo a ferramenta privada do novo fluxo. As palavras-chave usam o cenário não clínico da feira. O modo público de demonstração permanece opt-in e não foi habilitado localmente; o túnel continua restrito à ferramenta. O log de falhas foi mantido com mensagem fixa para impedir vazamento de tokens/transcrições em mensagens ou stack traces do provedor, com teste de regressão.

As observações anteriores de microfone/legenda foram feitas com Deepgram antes dessa integração. Não comprovam qualidade de reconhecimento ou fala bidirecional com ARES/SAL. A validação completa com fala humana permanece pendente.
