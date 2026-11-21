# Casos de teste | voz real

| Caso | Procedimento | Esperado | Resultado |
|---|---|---|---|
| 01 Fluxo feliz | Faça um pedido em PT-BR e confirme | Resposta audível e ação esperada, uma vez | A executar |
| 02 Interrupção | Durante a fala do agente: “quinze, quer dizer cinquenta” | Para de falar; considera 50; não grava 15 | A executar |
| 03 Ambiguidade | Omita um dado necessário | Pede esclarecimento; não inventa nem altera estado | A executar |
| 04 Permissão | Negue microfone e tente novamente | Mensagem útil e recuperação sem recarregar tudo | A executar |
| 05 Conexão | Simule desconexão durante a sessão | Estado de falha visível; sem ação duplicada após retorno | A executar |
| 06 Encerramento | Encerre e reabra outra sessão | Microfone liberado e sem reaproveitar contexto indevido | A executar |

Registre navegador, versão do código, condições da rede e observações. Para medir latência percebida, marque fim da fala do usuário e início da primeira resposta audível na gravação da mesma execução. Faça cinco tentativas comparáveis; anote os valores e a mediana. Não use tempo de atualização de UI como latência de áudio nem trate amostra pequena como benchmark.
