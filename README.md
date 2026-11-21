# CareCircle

**Cuidar é estar em círculo.** Coordenação familiar com conversas autorizadas, memória estruturada e tarefas compartilhadas.

> Protótipo local UNMUTE by Agora. Helena, Ana e Pedro são fictícios; os eventos de demonstração têm selo SIMULAÇÃO. **Voz Agora ainda não validada em runtime.** A chamada real OpenAI de 21/11/2026 retornou 429, `credit_balance_exhausted`. O copilot permanece disponível por consulta direta aos registros, com aviso explícito de IA indisponível.

## Problema e solução

Pedidos e responsabilidades familiares se perdem entre mensagens. O CareCircle fecha o ciclo: familiar agenda → rotina cria convite → Helena escolhe conversar → Lia prepara proposta → Helena revisa e autoriza → familiar acompanha e aceita a tarefa.

CareCircle não é um chatbot para idosos. É um sistema de coordenação familiar com agentes de voz que transformam conversas autorizadas em ações, informações e acompanhamento. Não faz diagnóstico, aconselhamento médico, monitoramento de saúde ou detecção de emergências.

## Por que a Agora é essencial

A integração utiliza **RTC para áudio bidirecional, RTM para legendas/estados e Conversational AI para STT → custom LLM → TTS**. Não há gravações ou áudio sintético local disfarçados de sessão Agora. O servidor executa ferramentas validadas e retorna texto SSE ao agente.

A autorização final exige confirmação visual pela Helena. Autorização exclusivamente por fala não está implementada. [Quickstart oficial](https://github.com/AgoraIO-Conversational-AI/agent-quickstart-nextjs), [custom LLM oficial](https://github.com/AgoraIO-Conversational-AI/server-custom-llm), [contrato de integração](https://docs.agora.io/en/ai/platform/build/custom-model-integration/custom-llm.md). Mapa dos arquivos adaptados: [arquitetura](docs/architecture.md).

## Arquitetura

Next.js App Router, React, TypeScript estrito, Tailwind, componentes próprios, Zod e OpenAI no servidor. SQLite persistente via Node 24, transações, UUIDs, chaves estrangeiras e reserva única por ocorrência. Worker separado para agenda. Atualização do painel a cada dois segundos.

Sessões locais usam cookie opaco HttpOnly, SameSite e verificação de origem/Host. Supabase Auth e Realtime não estão ativos. [Arquitetura completa](docs/architecture.md).

A prioridade econômica é validar um círculo e um fluxo de compras antes de ampliar integrações. Assinatura por círculo é hipótese comercial, ainda sem validação de demanda.

## Instalação

Requer Node.js **24+** e npm. PowerShell:

~~~powershell
git clone https://github.com/acarloshenrique/unmute-hackathon.git
cd unmute-hackathon
npm ci
Copy-Item .env.example .env.local
~~~

Se `.env.local` já existir, preserve suas configurações. Nunca use dados reais neste modo.

## Variáveis

| Variável | Uso |
|---|---|
| `CARECIRCLE_DEMO=true` | Pessoas e controles fictícios, somente em localhost |
| `CARECIRCLE_DB_PATH` | SQLite; padrão `.agent-local/carecircle.sqlite` |
| `OPENAI_API_KEY` | Segredo do servidor; também pode ser herdado do terminal |
| `OPENAI_MODEL` | Modelo com ferramentas; padrão `gpt-4o-mini` |
| `NEXT_PUBLIC_AGORA_APP_ID` | Identificador público do projeto Agora |
| `NEXT_AGORA_APP_CERTIFICATE` | Certificado Agora, exclusivamente no servidor |
| `CARECIRCLE_PUBLIC_URL` | Base HTTPS pública que a Agora consegue alcançar |
| `AGORA_TTS_VOICE` | Opcional: ID confirmado no catálogo do provedor; vazio usa padrão do SDK |

`.env.local` é ignorado pelo Git. Somente o App ID é público. Chaves e certificado nunca vão ao bundle cliente. Trocar de modelo não resolve saldo esgotado.

Para voz, habilite RTC, RTM, Conversational AI e provedores gerenciados no projeto Agora. O pipeline usa Deepgram `nova-3` em português e MiniMax `speech_2_6_turbo`; confirme suporte e cobrança na conta. Encaminhe **somente o callback** `/api/voice/llm/{session_id}` por HTTPS, protegido pelo token da sessão. Não exponha o login fictício à internet.

## Execução local

Terminal 1:

~~~powershell
npm run build
npm start
~~~

Abra **http://127.0.0.1:3000/demo** e escolha uma pessoa fictícia. O seed é explícito e idempotente. O banco é criado automaticamente pela migração SQLite.

Terminal 2, na mesma pasta:

~~~powershell
npm run scheduler
~~~

O worker lê `.env.local`, consulta o relógio real a cada 15 segundos e precisa continuar rodando. Nunca inicia áudio/microfone em segundo plano. O disparo manual usa a mesma lógica com relógio fictício separado.

Para desenvolvimento, `npm run dev` continua disponível. Neste ambiente Windows/OneDrive foram observadas recargas contínuas no dev; a causa adicional não foi isolada. A demonstração foi validada e ficou rodando em produção local (`npm start`), sem HMR. SQLite exige disco persistente e uma instância de serviço. O Dockerfile não foi validado.

## Telas e demo

| Rota | Função |
|---|---|
| `/` | Apresentação |
| `/idoso` | Lia, privacidade, revisão e formulário acessível |
| `/familia` | Eventos, fontes, tarefas e copilot |
| `/familia/agenda` | Criar, editar, pausar, retomar e cancelar |
| `/familia/tarefas` | Aceitar, concluir e cancelar tarefas |
| `/demo` | Relógio separado, disparo e registro de ações |

1. Entre como Ana. Consulte o dia; a fixture de almoço às 12h08 aparece como relato simulado.
2. Agende às 16h na data do relógio demo e confirme.
3. Avance dois minutos e use **Disparar agora · teste**. Repetir não duplica a ocorrência.
4. Entre como Helena e abra `/idoso`. Use a voz apenas após configurar e verificar Agora. Sem configuração, o botão fica desabilitado.
5. Alternativa sem credenciais: **Prefiro escrever meu pedido** → leite, pão e café → revisar → **Confirmar e compartilhar**. Isso é formulário, sem voz.
6. Volte como Ana e aceite a tarefa.

Use perfis de navegador separados para observar Ana e Helena simultaneamente; duas abas do mesmo perfil compartilham o cookie de identidade. A correção de itens por voz depende de validação real. [Roteiro de dois minutos](docs/demo-script.md).

## Segurança e privacidade

Ator derivado da sessão no servidor; parâmetros do modelo não concedem acesso a outras famílias. Consentimento por finalidade e destinatário, concedido ou revogado pela Helena. Revogação oculta eventos, tarefas e notificações do destinatário.

Ferramentas preparam propostas. Compartilhar requer confirmação explícita na interface. Eventos distinguem relato, confirmação, pendência e ausência de resposta. Silêncio não informa estado de saúde.

Não gravamos áudio ou transcrições integrais no banco. Legendas são temporárias; contexto mínimo é processado por OpenAI/Agora para atender a conversa. Retenção dos provedores precisa ser avaliada antes de dados reais.

Tokens de voz curtos, canal/UID do servidor e callback com capacidade por sessão. Notificações significam apenas registros no painel; não há SMS, e-mail ou WhatsApp.

**Não é uma aplicação certificada LGPD/ISO ou pronta para dados reais.** Autenticação empresarial e controles operacionais permanecem pendentes.

## Verificação

~~~powershell
npm run typecheck
npm run lint
npm test
npx playwright install chromium
# Com o servidor local rodando:
npm run test:e2e
npm run build
~~~

Unitários usam bancos temporários isolados. E2E usa a demo fictícia local; não rode com sessões reais ativas. Capturas ficam em `.agent-local/screenshots/`, ignoradas pelo Git. [Relatório](docs/testing.md), [limitações](docs/limitations.md), [pitch](docs/pitch.md), [slides](docs/slides-outline.md).

## Migração Supabase

`migrations/postgres.sql` contém as 12 tabelas do domínio com UUIDs e RLS. Clientes têm políticas de leitura por família, destinatário e consentimento; escritas são negadas por padrão e devem passar pela API autorizada. A migração **não foi executada**. Adaptador Postgres, vínculo com Supabase Auth e testes de isolamento ainda são necessários.

## Componentes e licença

Código de integração derivado do quickstart Agora sob MIT, com aviso preservado em `LICENSE.agora-quickstart`. [Componentes externos](docs/COMPONENTES.md). Nenhuma licença global foi adotada automaticamente.
