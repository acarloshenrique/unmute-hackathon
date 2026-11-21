# Roteiro de demonstração · dois minutos

## Preparação
Inicie app e scheduler. Abra `/demo`, entre como Ana fictícia. Uma fixture relata almoço às 12h08; o selo SIMULAÇÃO deve ficar visível. O relógio demo começa às 15h58 na data local. Encerre sessões de voz antes de resetar.

**Não apresente voz sem verificar a Agora.** Configure credenciais e HTTPS público, inicie `/idoso` como Helena e faça um teste completo de fala, áudio, pedido, autorização visual e encerramento. Use perfis de navegador separados se quiser Ana e Helena simultâneas; duas abas no mesmo perfil compartilham o cookie de identidade.

| Tempo | Ação | Evidência |
|---|---|---|
| 00:00–00:20 | Ana pergunta “Como foi o dia da minha mãe?” | Fonte, horário e estado Relatado; dado fictício identificado |
| 00:20–00:40 | Agendar pergunta de necessidades às 16h na data do relógio demo | Confirmar antes de salvar; rotina persistida |
| 00:40–01:00 | Avançar dois minutos e Disparar agora · teste | Uma ocorrência e um convite; repetir não duplica |
| 01:00–01:30 | Helena entra voluntariamente na conversa Agora e pede leite, pão e café | Microfone autorizado, agente observado no canal, resposta audível |
| 01:30–01:50 | Lia propõe compartilhar com Ana; Helena revisa e confirma na tela | Tarefa e notificação reais no SQLite |
| 01:50–02:00 | Ana vê o painel e toca Posso ajudar | Estado Aceita, evento e log de ferramenta |

## Variação: correção
Helena pede “Coloca açúcar também”. Lia deve consultar a tarefa existente, propor atualização e esperar confirmação visual. A tarefa mantém o mesmo ID. Esta etapa requer validação real de voz e não é anunciada como comprovada sem ela.

## Alternativa honesta se faltar Agora
Mostre agenda → convite → formulário acessível “Prefiro escrever meu pedido” → revisão → confirmação → painel. Diga claramente: **“Este é o teste persistido por formulário, sem voz Agora; a integração de voz ainda precisa ser validada.”** Não substitua o áudio por gravação ou síntese local disfarçada.

## Encerramento
Encerre a conversa. Confira ausência de indicador de microfone e estado encerrado no servidor. Não exiba `.env`, tokens ou consoles com credenciais durante a gravação.