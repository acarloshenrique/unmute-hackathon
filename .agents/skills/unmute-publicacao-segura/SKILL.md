---
name: unmute-publicacao-segura
description: "Preparar Git e GitHub públicos com revisão de segredos, privacidade, licenças e versão entregue."
---

# unmute-publicacao-segura

1. Revise os arquivos a publicar, os staged e o histórico alcançável pelas refs que vão ao GitHub. Use um scanner de segredos em modo de leitura; o check-setup só verifica nomes.
2. Remova .env, dumps, logs de voz, certificados e dados pessoais. Se uma credencial já vazou, revogue/rotacione; apagar do último commit não basta.
3. Liste componentes externos em docs/COMPONENTES.md. Preserve avisos de licença e não adote licença nova sem decisão do time.
4. Quando autorizado a publicar, verifique owner, repo e commit exatos, confirme visibilidade e teste leitura sem login. Não force push.
