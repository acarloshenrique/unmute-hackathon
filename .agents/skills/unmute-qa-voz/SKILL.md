---
name: unmute-qa-voz
description: "Testar a interação real, barge-in, silêncio, falhas de microfone/rede e medir latência perceptível para a demo."
---

# unmute-qa-voz

1. Execute casos de docs/TESTES-VOZ.md usando dados sintéticos e grave evidências que possam ser divulgadas.
2. Valide que uma fala corrigida gera só o resultado final e que reconexões não duplicam ações.
3. Se estimar latência, registre condições e medições de fim da fala até áudio audível. Separe UI, backend e experiência percebida.
4. Registre esperado, observado, versão e limitações. Nunca invente métricas nem marque casos não realizados como aprovados.
