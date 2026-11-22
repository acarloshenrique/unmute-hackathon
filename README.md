# CareCircle — voz gerenciada pela Agora

**Versão entregue (submissão UNMUTE): commit `9844109` em `main`.** Conversa de áudio real validada em 22/11 (sessão gravada: pedido → confirmação por voz → correção → confirmação visual → tarefa aceita). Ver `docs/TESTES-VOZ.md` para o que foi e o que não foi testado. Demo pública: https://carecircle.jazzautomations.com.br/demo.

CareCircle transforma conversas autorizadas em coordenação familiar. Helena, Ana e Pedro são pessoas fictícias. Cenário de ação da sessão de voz no navegador: Helena pede companhia de Pedro para ir à feira no sábado, corrige para 10h, revisa na tela e confirma. Somente então Pedro recebe um cartão e pode tocar **Posso ajudar**.

## Experimentar a Lia em `/demo`

O visitante escolhe companhia para a feira, lembrete de remédio, companhia na consulta ou conversa sobre o almoço. Cada cartão mostra a fala que a Lia usará. Por padrão, ligação, áudio e texto são simulados na tela, sem pedir telefone nem contatar ninguém.

Para testes autorizados, habilite `CARECIRCLE_OUTREACH_ENABLED=true` e defina `CARECIRCLE_OUTREACH_TEST_NUMBERS` com números consentidos, separados por vírgula e com `+DDI`, apenas no servidor. Sem ambas as configurações válidas, o endpoint não faz envios. A mesma lista protege ligação, áudio e texto na demo e o envio do painel. Ligação e áudio reutilizam as pontes de `/api/outreach` do painel. O texto usa a instância Evolution v2 do time. Configure no servidor `CARECIRCLE_EVOLUTION_TEXT_URL` com a URL completa de `/message/sendText/{instancia}` e `CARECIRCLE_EVOLUTION_API_KEY` com a chave da instância. A tela avisa quando o texto está indisponível. A confirmação na tela indica que o serviço aceitou o pedido. O recebimento no telefone depende do canal.

**Painel da família** abre `/familia` com o perfil fictício de Ana. **Controles da apresentação** leva à sala de testes em `/demo/controle`. Os quatro exemplos de contato usam falas fictícias e o envio de um exemplo não cria tarefas nem registros de saúde.

## Prontuário familiar

Entre como **Ana** na demonstração e abra **Prontuário familiar** no menu ou em `/familia/prontuario`. Helena fictícia autorizou Ana a consultar e atualizar a ficha. Em `/idoso#privacidade`, Helena pode conceder ou revogar esse acesso por familiar.

- **Resumo e histórico** reúnem a ficha, a fonte das informações, relatos compartilhados e registros com data e autoria.
- **Plano e cotidiano** dá destaque ao objetivo nas palavras da pessoa, ao que foi combinado, a quem ajuda e à data de revisão. O painel lembra a família quando chega o dia da revisão. Os relatos opcionais guardam o assunto, a data da observação, a origem e quem registrou. Incluem memória, mobilidade, vitalidade e alimentação, visão, audição, bem-estar emocional, apoio social, apoio a quem cuida e continência urinária.
- **Medicamentos** aceita planos diários com um ou mais horários. Uma tomada relatada desconta a quantidade registrada para aquele horário. Uma correção ajusta o saldo e preserva o relato original no histórico. O familiar pode lançar reposições, copiar uma orientação médica atualizada ou encerrar a prescrição. A revisão passa a valer ao salvar.
- **Agenda e preparo** reúne consultas, exames e procedimentos. Cada etapa transcrita da orientação do serviço tem horário e confirmação próprios. Os lembretes aparecem no painel aberto. O arquivo de calendário do atendimento inclui alarmes para o compromisso e os preparos pendentes. A importação e as notificações dependem do calendário escolhido. Em **Resumo para a consulta**, o familiar pode abrir o objetivo atual, os medicamentos vigentes com suas fontes e as três observações mais recentes.
- **Care Copilot** consulta os registros autorizados de estoque, tomadas e agenda. A chave opcional do provedor permite interpretar perguntas por ferramentas. Na ausência do provedor, a consulta direta identifica o modo usado. Os lançamentos e as alterações de prescrição dependem da ação do familiar.
- O prontuário usa o SQLite da aplicação e é independente da lista de medicamentos da ponte de WhatsApp. A demonstração utiliza exclusivamente dados fictícios.

O manual ICOPE, 2ª edição, fundamenta as escolhas sobre objetivos e seguimento (capítulo 3), revisão de medicamentos com a equipe (seção 4.2.4), capacidades no cotidiano (capítulos 5 a 10), apoio social, apoio ao cuidador e continência (capítulos 11 a 13). As telas organizam conversas e registros familiares. A avaliação clínica cabe à equipe de saúde. [Manual da OMS](https://www.who.int/publications/i/item/9789240103726).

Validação local feita com Node 24 e SQLite. O comando `npm run check` passou com 77 testes unitários e de domínio. Os 9 cenários Playwright passaram em Chromium na aplicação compilada, incluindo objetivo, relato do cotidiano, lembrete de revisão, resumo para a consulta e exportação do calendário. Uma cópia da base anterior também recebeu o plano e manteve os medicamentos cadastrados. A consulta direta aos registros foi testada sem credencial do provedor de IA.

## Escolher cuidadora virtual

No painel `/familia`, o familiar autorizado escolhe **Lia · Acolhedora** (padrão), **Clara · Direta** ou **Rosa · Paciente** para a pessoa acompanhada. A escolha é salva no servidor e persiste após recarregar. Requer vínculo com a família e autorização `family_updates` vigente daquela pessoa; a preferência nunca concede ou modifica consentimentos.

Todos usam o **mesmo timbre MiniMax já configurado**. Só mudam nome e instruções de estilo na próxima sessão Agora. Sessões ativas mantêm o nome e o estilo com que começaram. Convites pendentes refletem a escolha atual.

Na tela `/idoso` não há seletor: o convite informa o nome e oferece **Conversar** ou **Agora não**. O microfone só é solicitado depois do aceite; recusar não liga áudio. Aceitar conversar não autoriza compartilhar resumo ou tarefa: a revisão e a confirmação explícita continuam obrigatórias.

SQLite cria a tabela aditiva `caregiver_preferences` no primeiro acesso após reiniciar, preservando os dados existentes; ausência de escolha significa Lia. Para a migração futura PostgreSQL, aplicar `migrations/postgres-caregiver-preferences.sql` após a base existente (não executado neste ambiente).

[Validação e roteiro desta funcionalidade](docs/caregiver-profiles.md). Nenhuma dependência, chave ou configuração OpenAI Realtime foi acrescentada.

## Canais reais (extensão)

No painel `/familia`, o cartão **Canais reais** envia a mensagem digitada por dois caminhos reais, fora do fluxo de voz Agora do app:

- **WhatsApp**: a mensagem chega como nota de voz da Lia via ponte local do canal (Evolution API + TTS), serviço externo a este repositório (`/api/outreach` → ponte no servidor).
- **Ligar**: dispara uma ligação telefônica real pela ponte Twilio do lab (`/opt/naima-call`, fora deste repo), que fala a mensagem ao vivo com a persona Lia.

O mesmo painel traz os cartões **Remédios** e **Agenda do círculo**: leem via `/api/lia-data` a lista de remédios (com próximo horário e estoque quando informados), os contatos do círculo agrupados por papel (médico, exame, farmácia, úteis) e os membros da família na ponte da Lia — números saem mascarados na API e o botão **Tomei** registra a dose nessa ponte.

São extensões com componentes externos declarados (ver `docs/SUBMISSAO.md`); dependem das pontes rodando no servidor e não alteram o consentimento do fluxo principal: voz continua sem autorizar compartilhamento.

## Caminho de voz atual

Microfone → Agora RTC → **Conversational AI gerenciado: Agora ARES → GPT-4o-mini → MiniMax Speech 2.6 Turbo** → Agora RTC → áudio da Lia.

Usa o mesmo pipeline do [quickstart oficial](https://github.com/AgoraIO-Conversational-AI/agent-quickstart-nextjs), adaptado ao app, e `agora-agents@2.15.0`. ARES é fornecido pela Agora; LLM e TTS usam credenciais gerenciadas pela Agora: **não é necessário saldo nem chave próprios da OpenAI ou MiniMax para a voz**. LLM e TTS são modelos de terceiros disponibilizados pela Agora. O projeto Agora precisa ter acesso e saldo/cota para esses serviços; não há promessa de gratuidade. Consulte [modo gerenciado](https://docs.agora.io/en/ai/build/managed-mode).

Há apenas um caminho ativo de voz. OpenAI Realtime foi substituído; `OPENAI_REALTIME_MODEL` não é usado. Não há callback de Chat Completions no CareCircle para a conversa: a Agora executa ASR, LLM e TTS. O endpoint antigo `/api/voice/llm/{sessionId}` continua desativado (410).

Reconhecimento por ARES com palavras-chave do cenário, prompt em pt-BR e voz `Portuguese_Wiselady` do catálogo MiniMax. O VAD usa a configuração do quickstart compatível com o SDK instalado. RTM entrega estado, legendas e erros quando emitidos. Microfone só liga após ação explícita; a tela mostra nível local e separa captura de publicação na Agora. Encerrar ou receber falha do agente libera os recursos locais e solicita encerramento no servidor.

O copilot **textual** existente pode continuar usando `OPENAI_API_KEY`/`OPENAI_MODEL`; sem API disponível, consulta os registros e identifica o modo sem IA. Essa chave não participa da voz.

### Ajuste de conversa e idioma
O ARES agora recebe idioma português explícito. No SDK instalado, omitir o idioma enviava `en-US`; o enum aceita `pt-PT`, não `pt-BR`. As respostas seguem instruções em português brasileiro. Reconhecimento do sotaque brasileiro e ritmo em chamada humana ainda precisam de validação. A saudação não força a feira, as respostas são curtas e em streaming, e a janela de interrupção evita disparos tão curtos quanto antes. Modelos e timbre foram mantidos.

[Resultados e limites do ajuste de conversa](docs/voice-conversation-quality.md): 65 unitários, 6 E2E e três respostas reais a textos fictícios pelo agente Agora. Isso não equivale a validar áudio humano.

## Ferramenta, consentimento e persistência

`prepareRequest` fica em `llm.tools`, habilitada por `withTools(true)`. A Agora chama apenas POST `/api/voice/tools/{sessionId}/prepare-request`.

- Bearer aleatório vinculado à sessão, validade curta, hash em SQLite e revogação no encerramento.
- Identidade e destinatário derivados no servidor; o modelo não escolhe IDs de família ou usuário.
- Um rascunho privado por sessão. Correção altera a revisão; confirmação antiga recebe 409.
- A ferramenta não envia, notifica, confirma ou cria tarefa final. Helena confirma visualmente a revisão atual.
- Confirmação e tarefa são idempotentes; repetição ou clique duplo não duplicam cartão ou notificação.
- Cancelar não compartilha. Pedro só aceita tarefas do círculo autorizado.

SQLite persistente, regras de autorização e tabelas existentes foram mantidos. A funcionalidade de estilos acrescenta somente a tabela de preferências por pessoa; as tabelas e regras de compartilhamento existentes são preservadas. Não persistimos áudio bruto ou transcrições integrais. CareCircle não diagnostica, não monitora clinicamente e não interpreta silêncio como bem-estar ou autorização.

## Execução local

Requer Node.js 24+ e npm. Preserve seu `.env.local` e configure os campos necessários, sem colocar segredos no Git:

```powershell
npm ci
npm run check
npm start
```

Abra **http://127.0.0.1:3000/demo**. Em outro terminal: `npm run voice:gateway`. O gateway escuta somente **127.0.0.1:3002** e permite apenas o POST da ferramenta. Exponha via HTTPS **somente a porta 3002**, nunca a porta 3000 ou o login fictício. A origem HTTPS fica em `CARECIRCLE_VOICE_TOOL_URL`.

Scheduler opcional: `npm run scheduler`. Ele cria convites persistidos; não abre microfone em segundo plano.

## Variáveis de ambiente

| Variável | Uso |
|---|---|
| `NEXT_PUBLIC_AGORA_APP_ID` | Identificador público do projeto Agora |
| `NEXT_AGORA_APP_CERTIFICATE` | Certificado Agora, somente servidor |
| `CARECIRCLE_VOICE_TOOL_URL` | Origem HTTPS do gateway restrito, sem caminho/query |
| `CARECIRCLE_DEMO` | Pessoas fictícias locais |
| `CARECIRCLE_DB_PATH` | SQLite persistente |
| `OPENAI_API_KEY` | Opcional, somente copilot textual; nunca voz |
| `OPENAI_MODEL` | Opcional, modelo do copilot textual |
| `CARECIRCLE_ALLOWED_ORIGINS` | Hosts extras aceitos como origem (separados por vírgula), usado pelo proxy do domínio da demo |

Nenhuma chave foi criada ou trocada. `OPENAI_REALTIME_MODEL`, `CARECIRCLE_PUBLIC_URL` e `AGORA_TTS_VOICE` não controlam a voz atual.

## Avatar da conversa

Na tela `/idoso`, a sessão mostra um **avatar 3D da assistente** renderizado no cliente (modelo em `public/avatars/lia.glb`), que acompanha o nível do áudio remoto do agente Agora — a boca abre enquanto a Lia fala. Há fallback com poses pré-renderizadas quando WebGL falha ou quando o usuário prefere movimento reduzido. É um recurso visual local; não é track de avatar de vendor Agora.

## Demo Helena → Pedro

Use perfis separados de navegador para não compartilhar o cookie de identidade.

1. Como Helena em `/demo`, abra `/idoso`. Autorize convites e compartilhamento com Pedro.
2. Como Pedro, abra `/familia/tarefas`: zero tarefas desse pedido.
3. Helena toca **Conversar** no convite (ou **Conversar com Lia** sem convite), permite o microfone e diz: “Lia, pede pro Pedro me acompanhar à feira sábado.”
4. Ouça a resposta em português e observe a proposta. Diga: “Às dez da manhã”. Confira 10:00 na revisão atual; Pedro continua sem cartão.
5. Confirme na tela. Pedro recebe um cartão, toca **Posso ajudar** e recarrega: aceite persistido.
6. Em outra sessão, cancele a proposta: nenhum cartão. Encerre e confira o indicador de microfone do navegador.

Não faça a gravação depender de interrupção até verificá-la com fala real. O formulário por texto é separado, não comprova áudio.

## Testes e limites

`npm run check`: tipos, lint, testes unitários e build. `npm run test:e2e`: interface, HTTP e persistência com sessões explicitamente fictícias; não comprova áudio real. Use um banco separado ao executar E2E, pois os testes reinicializam fixtures.

HTTP 200 ao iniciar agente, estado RUNNING e ingresso no canal não comprovam fala bidirecional. Captura física, compreensão em pt-BR, áudio recebido, ferramenta cloud e interrupção precisam de uma chamada real. Não publicamos métricas de latência não medidas. O login fictício é local por padrão, não autenticação empresarial. O opt-in legado `CARECIRCLE_PUBLIC_DEMO=true` permite login público, mas não foi habilitado neste fluxo; o túnel continua expondo somente a ferramenta.

[Arquitetura](docs/architecture.md) · [Demo](docs/demo-script.md) · [Validação gerenciada](docs/managed-voice-validation.md) · [Histórico Realtime substituído](docs/realtime-validation.md) · [Componentes/licenças](docs/COMPONENTES.md).

### Cenário 2 · Café, remédio e jejum

Em `/demo`, o segundo cartão abre `/demo/jejum`. O mesmo roteiro pode ser aberto na tela da pessoa idosa. Helena faz a pergunta por voz em um navegador compatível ou usa o texto do exemplo. Ela permite que Lia consulte Ana. A pergunta à filha é se a **equipe do exame já confirmou** a orientação sobre o café. Nenhuma resposta muda o horário ou a dose do remédio.

Para ativar ligações neste roteiro, publique as rotas e configure no servidor a lista de teste e o opt-in existentes, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` e a origem HTTPS do app em `CARECIRCLE_CALLBACK_ORIGIN`. O cenário usa Twilio Gather em português com fala ou teclas 1, 2 e 3. O webhook assinado vincula cada resposta ao pedido e ao CallSid. A página de Helena consulta o resultado e o apresenta em texto e, em navegadores compatíveis, em voz. Silêncio, assunto diferente ou queda não geram confirmação clínica. Em modo de ensaio, os botões simulam a participação de Ana e a interface identifica a simulação. Não são armazenados o telefone, a transcrição ou o áudio neste fluxo.
