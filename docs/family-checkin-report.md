# Resumo de acompanhamento familiar

No painel **Família**, o resumo inspirado no SBAR apresenta o registro
autorizado mais recente para aquele familiar: situação, contexto se houver
convite vinculado, relato ou registro, o que não foi confirmado e, quando
existir vínculo explícito, tarefa, responsável e estado.

A projeção é determinística e somente leitura. Ela não combina conversas ou
tarefas por proximidade de datas. O relatório exige consentimento
`family_updates` vigente para o destinatário, não lê rascunhos ou transcrições
e não gera diagnóstico. A revogação remove a visualização na próxima consulta.
Não atender não confirma saúde. O estado da tarefa é o que consta no app,
não uma verificação de sua execução fora dele. O relatório não propõe nem
aplica ajustes ao plano de acompanhamento.

Para conferir localmente, abra `/familia` como Ana com os dados fictícios, depois
compartilhe e aceite uma tarefa pelo fluxo existente. Confira a atualização no
resumo e após recarregar. Outra pessoa no mesmo círculo não recebe o registro
destinado a Ana. Use somente dados sintéticos.

## Validação desta alteração

- `npm run check`: verificação de tipos, lint, 73 testes unitários e build aprovados.
- Teste HTTP no build local: três sessões fictícias, cache privado, rascunho
  oculto, isolamento de destinatários, aceite atualizado e revogação aprovados.
- Playwright: 7 testes aprovados no Chromium headless local, incluindo o
  aceite persistido no relatório e as poses sintéticas do avatar em WebGL.
  A execução não fez chamadas nem enviou mensagens reais.
