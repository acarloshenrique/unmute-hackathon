# Limitações verificadas e pendências

- **P0 completo ainda não comprovado:** a conversa Agora não foi executada. Faltam `NEXT_PUBLIC_AGORA_APP_ID`, `NEXT_AGORA_APP_CERTIFICATE` e `CARECIRCLE_PUBLIC_URL` HTTPS alcançável pela Agora. Também é preciso habilitar RTC, RTM, Conversational AI e provedores gerenciados no projeto.
- A API e o cliente de voz derivam do quickstart oficial e compilam contra os tipos instalados. Isso não comprova microfone, resposta audível, interrupção ou qualidade em português. Não há medição de latência de voz.
- Usamos STT → custom LLM → TTS. Não validamos suporte do caminho exigido de ferramentas via OpenAI Realtime; por isso essa integração não foi escolhida.
- Compartilhamento exige confirmação visual de um cartão pela Helena e consentimento para o destinatário. Autorização somente por fala não está implementada. Essa decisão impede que texto do modelo se torne permissão de acesso.
- Notificações são persistidas no painel. Não há push, SMS, e-mail, ligação telefônica ou WhatsApp. Atualização por consulta a cada dois segundos, sem Supabase Realtime ativo.
- Login de demonstração local com pessoas fictícias. Não é adequado para dados reais ou exposição pública. Não há Supabase Auth configurado nem autenticação empresarial.
- SQLite precisa de disco persistente e uma instância do serviço. Não usar em funções sem armazenamento durável. Node 24 é obrigatório.
- `migrations/postgres.sql` é a base de migração com RLS; não foi executada contra Supabase. O adaptador Postgres, o vínculo de identidades e os testes de RLS ainda são necessários. Escritas de clientes são negadas por padrão.
- Agenda suporta uma ocorrência ou repetição diária. Horário silencioso 21h–8h. Convite sem resposta após dez minutos não informa condição de saúde. O worker precisa permanecer rodando.
- Interrupção automática por VAD segue configuração oficial; ainda precisa de teste com áudio real. Seleção de saída depende do navegador. Áudio nunca inicia por agendamento em segundo plano.
- Contexto temporário mínimo é processado por OpenAI e Agora para atender a conversa; não gravamos transcrições integrais no banco local. Retenção dos provedores e transferência internacional precisam de avaliação antes de dados reais.
- Não há certificação LGPD/ISO, validação clínica, entrevistas de usuários ou indicadores de impacto medidos. O produto não faz diagnóstico, recomendações médicas ou monitoramento de emergências.
- Reset remove dados fictícios locais e invalida sessões. Não deve ser usado com dados reais; só existe em modo demo local.
- Teste real da chave OpenAI: HTTP 429 / credit_balance_exhausted. Ferramentas guiadas por IA e conversa de voz precisam de saldo. Consulta direta a registros e fluxo por formulário continuam disponíveis, sem simular uma chamada bem-sucedida à IA.

- Neste ambiente Windows/OneDrive o servidor dev apresentou recargas contínuas; causa adicional não isolada. Use npm run build e npm start para a demonstração. Produção local passou novamente no E2E.
