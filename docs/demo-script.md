# Demo Agora gerenciada — companhia para a feira

**Voz gerenciada implementada, conversa de áudio ainda não validada.** Os testes HTTP e de interface usam pessoas e sessões fictícias; não representam áudio real.

## Preparação

Rodar `npm run check`, `npm start` e, em outro terminal, `npm run voice:gateway`. Configurar credenciais Agora e origem HTTPS do gateway restrito. Não expor a porta 3000 no túnel. Usar perfis de navegador separados para Helena e Pedro.

Helena autoriza convites e compartilhamento com Pedro em /idoso. Pedro abre /familia/tarefas. Não mostrar valores de chaves ou consoles de credenciais.

## Roteiro curto

1. Helena inicia voluntariamente a conversa, permite o microfone e diz: “Lia, pede pro Pedro me acompanhar à feira sábado.”
2. Ouvir a resposta em português. Observar a proposta, sem tarefa para Pedro.
3. Helena corrige: “às dez da manhã”. Verificar 10:00 no mesmo rascunho; Pedro ainda vê zero tarefas.
4. Helena revisa e toca Confirmar e compartilhar.
5. Pedro recebe um único cartão, toca Posso ajudar e recarrega. O estado Aceita permanece.
6. Encerrar a sessão. Confirmar microfone liberado e encerramento no servidor.

Segundo teste, em cenário limpo: preparar e corrigir, mas tocar Não compartilhar. Pedro não recebe cartão. Não resetar a demo enquanto houver sessão real ativa.

## Marco de áudio pendente

É obrigatório verificar fala real, resposta audível, caminho Agora, idioma, limpeza do microfone e interrupção. Um agente presente no canal não comprova conversa bidirecional. Se interrupção não for estável, não fazer a gravação depender dela. Sem configuração/saldo, apresentar apenas o teste de interface como tal e manter a voz marcada como pendente.
