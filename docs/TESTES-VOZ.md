# Casos de teste | voz real

| Caso | Procedimento | Esperado | Resultado |
|---|---|---|---|
| 01 Fluxo feliz | Faça um pedido em PT-BR e confirme | Resposta audível e ação esperada, uma vez | ✅ Executado 22/11 07:45 UTC, commit `2a71194`, Chrome 151 — Helena pediu companhia do Pedro à feira; Lia confirmou por voz ("Você gostaria que eu pedisse para o Pedro te acompanhar à feira no sábado de manhã?"); rascunho privado criado via `prepareRequest`; Helena confirmou na tela; tarefa `pending` criada e aceita por Pedro. Evidência: `carecircle_demo.mp4` + proposta `2b9a7035` no banco. |
| 02 Interrupção | Correção por voz no meio do fluxo | Revisão do mesmo rascunho, sem criar novo | ✅ Parcial — Helena corrigiu "às dez da manhã" durante a escuta; o rascunho foi revisado (payload `_realtime.revision: 1, time: "10:00"`). Barge-in durante fala do agente não foi testado isoladamente. |
| 03 Ambiguidade | Omita um dado necessário | Pede esclarecimento; não inventa nem altera estado | ✅ Observado — a Lia perguntou explicitamente antes de agir ("Você gostaria que eu pedisse...?") em vez de executar direto. Caso de dado faltante isolado: a executar. |
| 04 Permissão | Negue microfone e tente novamente | Mensagem útil e recuperação sem recarregar tudo | A executar |
| 05 Conexão | Simule desconexão durante a sessão | Estado de falha visível; sem ação duplicada após retorno | ⚠️ Parcial — um WebSocket da edge falhou antes de estabelecer (log de captura) e o SDK reconectou sem quebrar a sessão. Desconexão prolongada não simulada. |
| 06 Encerramento | Encerre e reabra outra sessão | Microfone liberado e sem reaproveitar contexto indevido | A executar |

**Ambiente da execução de 22/11:** VPS Oracle dedicada à demo, `carecircle.service` rodando `2a71194` (`agora_managed`: ARES STT pt-BR → gpt-4o-mini → MiniMax TTS, SAL locking, VAD). Entrada de voz via microfone sintético (TTS 16kHz); saída capturada do monitor PulseAudio. Latência fim-de-fala → primeira resposta audível **não medida formalmente** — turnos visivelmente de ~2–4s na gravação, sem mediana de 5 amostras.

Registre navegador, versão do código, condições da rede e observações. Para medir latência percebida, marque fim da fala do usuário e início da primeira resposta audível na gravação da mesma execução. Faça cinco tentativas comparáveis; anote os valores e a mediana. Não use tempo de atualização de UI como latência de áudio nem trate amostra pequena como benchmark.
