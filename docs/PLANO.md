# Plano CareCircle

- Produto: coordenação familiar por conversas autorizadas.
- Público de demonstração: Helena, Ana e Pedro, todos fictícios.
- Fluxo principal: Ana agenda → worker cria convite → Helena escolhe conversar → Lia propõe pedido → Helena revisa e autoriza → Ana aceita tarefa.
- Critério de pronto: conversa Agora real em português, ocorrência persistida sem duplicação, tarefa autorizada no painel e resposta com fonte.
- Critério atual: aplicação local e fluxo por formulário verificados; critério de voz permanece pendente.
- Estado atual: credenciais Agora e gateway HTTPS configurados localmente. Voz migrou para Agora gerenciada (ARES, LLM e TTS); não usa chave própria OpenAI. Conversa humana completa e qualidade de ARES/SAL ainda precisam de validação.
- Fonte de verdade: docs/architecture.md, docs/testing.md, docs/limitations.md e docs/managed-voice-validation.md.
- Prazo informado: domingo, 22/11/2026, 12h, America/Sao_Paulo.
- Congelamento recomendado: 10h30; priorizar configuração, prova de voz, gravação e submissão.
- Fora de escopo: WhatsApp, vídeo, avatares, diagnóstico, monitoramento clínico, P2.
- Não afirmar que testes ou integrações pendentes passaram. Não usar dados reais no login fictício local.
