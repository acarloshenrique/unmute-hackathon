---
name: unmute-implementacao
description: "Transformar um fluxo do hackathon em uma implementação pequena, testável e reproduzível sem trocar a stack do time."
---

# unmute-implementacao

1. Identifique o contrato mínimo entre interface, sessão Agora e lógica do domínio. Evite frameworks extras sem necessidade.
2. Separe serviços externos do estado da aplicação. Para mutações, use validação determinística e impeça duplicatas após retry ou reconexão.
3. Prefira uma fatia pequena ponta a ponta. Versione lockfile e documente dependências, variáveis e comandos exatos.
4. Execute testes locais pertinentes e registre o que não conseguiu testar. Não instale nem publique por conta própria.
