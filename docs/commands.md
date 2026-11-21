# Registro de execução

Executados em 21/11/2026, Windows e Node 24.15.0:

- Inspeção de AGENTS.md, plano, skills e nomes de variáveis, sem valores.
- Clone e inspeção dos repositórios oficiais Agora quickstart e custom LLM em .agent-local ignorado.
- Consulta dos índices e páginas oficiais; confrontação com tipos instalados.
- npm install; instalação local de Prettier; npm reportou zero vulnerabilidades.
- Formatação, typecheck, lint, testes unitários e build de produção.
- Servidor em 127.0.0.1:3000; testes com Playwright em desktop e móvel.
- Instalação do Chromium após a primeira falha por navegador ausente.
- Jornada real por formulário: agenda, convite, autorização, tarefa, notificação e aceite no SQLite.
- Chamada mínima real OpenAI: 429, credit_balance_exhausted. Sem exposição ou escrita de chave.
- Correções verificadas: FK do teste textual, tipos de tarefa, origem loopback, rastreamento de filesystem e modo de consulta direta sem IA.

Não executados: conversa Agora com áudio real, interrupção de áudio, medição de latência, migração Postgres/RLS, Docker ou submissão ao evento.

Números finais e limites em docs/testing.md.
