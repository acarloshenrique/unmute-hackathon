# Relatório de validação · 21/11/2026

## Resultado final observado

| Verificação | Resultado |
|---|---|
| TypeScript estrito | Aprovado |
| ESLint | Aprovado, sem avisos |
| Vitest | **36 aprovados, 0 falhos** em 2 arquivos |
| Playwright Chromium | **2 aprovados, 0 falhos** |
| Total automatizado | **38 aprovados, 0 falhos** |
| Build Next.js de produção | Aprovado, sem o aviso anterior de tracing |
| Worker real | Iniciado; consulta o relógio real a cada 15 segundos |
| Segredos no código-fonte | Busca de padrões sem ocorrências; env e banco ignorados |
| OpenAI real | **Bloqueado: HTTP 429, credit_balance_exhausted** |
| Áudio Agora real | **Não executado; credenciais/HTTPS ausentes** |
| Supabase/Postgres RLS | Migração escrita, não executada |
| Docker | Arquivo fornecido, build não executado |

Comando final completo aprovado: `npm run check` (typecheck, lint, Vitest e build).
Último E2E observado contra produção local: 2 aprovados em 4,7 s. Isso é duração da suíte de navegador, **não latência da voz**.

## Cobertura automatizada

Agenda persistente; cálculo de próxima ocorrência e UTC/São Paulo; execução antes/depois do horário; repetição diária; duplicatas; pausa/cancelamento; horário silencioso; consentimento revogado; retries limitados; ausência de resposta sem inferência clínica; relógio fictício separado.

Identidade via cookie; expiração; tentativa de acesso entre famílias; destinatário sem consentimento; consentimento apenas pela titular; proposta sem compartilhamento automático; confirmação/rejeição; task idempotente; notificação no painel; correção de itens sem nova tarefa; aceite; conclusão e bloqueio de mutação final; revogação; resumo com horário/status/fonte; ausência de dados; relato de rotina idempotente.

Voz sem credenciais falha explicitamente; callback não autenticado é negado; encerramento exige propriedade da sessão; limpeza de microfone/RTC/RTM/toolkit continua mesmo com falhas e é idempotente. **São testes de lógica, não prova de chamada Agora.**

Falha de créditos/IA preserva consulta direta com indicação de modo; perguntas sobre tarefas e agenda não fabricam ações; validação de origem suporta Host loopback do Next e rejeita origem externa.

## Jornada verificada no navegador

1. Login fictício da Ana, com seed explícito.
2. Rotina às 16h salva pelo modal.
3. Relógio demo avançado e disparo determinístico.
4. Ocorrência e convite persistidos, sem duplicata após novo disparo.
5. Helena usa formulário acessível, claramente identificado como sem voz.
6. Proposta existe sem tarefa ou notificação de compartilhamento.
7. Confirmação cria tarefa com leite, pão e café.
8. Ana aceita; estado Aceita e notificação consultados no servidor.
9. Copilot mostra registros com horário, SIMULAÇÃO e fonte, informando indisponibilidade da IA.
10. Capturas desktop/móvel; ausência de overflow horizontal em 390 px.

Capturas em `.agent-local/screenshots/`. O E2E reinicia somente os dados fictícios da demonstração local; não execute com sessões reais ativas.

## Falhas encontradas e corrigidas

Teste de navegador inicialmente sem Chromium; FK de sessão indevida no teste textual; inferência TypeScript de tarefas; validação Origin/Host do Next; tracing do caminho SQLite que causava recargas contínuas; tratamento de saldo OpenAI; interoperabilidade CommonJS do pacote de tokens no worker.

## Validação manual ainda obrigatória

Configurar credenciais Agora, créditos OpenAI e callback HTTPS. Entrar voluntariamente, liberar microfone, observar agente no canal, falar português e ouvir resposta. Revisar proposta na tela, compartilhar, observar painel familiar, testar interrupção/reconexão e encerrar. Confirmar microfone liberado e estado de sessão encerrado no servidor.

Não há medição de latência de voz, entrevistas de usuários ou avaliação clínica. Nenhuma dessas validações foi declarada aprovada.


## Verificação final adicional

- CI Linux no GitHub aprovado: https://github.com/acarloshenrique/unmute-hackathon/actions/runs/44941133941 (código fb6446c).
- Busca do valor efetivo dos segredos disponíveis nos arquivos .next/static: aprovada, zero arquivos com ocorrência. Nenhum valor foi exibido.
- Servidor de produção em 127.0.0.1:3000 e scheduler deixados rodando.
- O dev apresentou novas recargas neste Windows/OneDrive após alterações. O aviso de tracing foi corrigido, mas a causa adicional não foi isolada. O teste final completo foi repetido contra npm start e passou. Para apresentação, usar build de produção.
