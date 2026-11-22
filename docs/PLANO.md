# Plano CareCircle

- Produto: coordenação familiar por conversas autorizadas.
- Público de demonstração: Helena, Ana e Pedro, todos fictícios.
- Fluxo principal: Ana agenda → worker cria convite → Helena escolhe conversar → Lia propõe pedido → Helena revisa e autoriza → Ana aceita tarefa.
- Critério de pronto: conversa Agora real em português, ocorrência persistida sem duplicação, tarefa autorizada no painel e resposta com fonte.
- Critério atual: conversa Agora real em português executada em 22/11 (`docs/TESTES-VOZ.md`, caso 01: pedido → confirmação por voz → correção → confirmação visual → tarefa aceita). Barge-in isolado e latência medida seguem pendentes.
- Estado atual: voz em Agora gerenciada (ARES, LLM e TTS) validada em sessão real em 22/11, sem chave própria OpenAI. Demo pública em https://carecircle.jazzautomations.com.br/demo; texto de submissão e entregáveis em `docs/SUBMISSAO.md` (vídeo `carecircle_pitch_lia.mp4`, narração Fish Audio — a mesma voz da Lia no WhatsApp).
- Fonte de verdade: docs/architecture.md, docs/testing.md, docs/limitations.md e docs/managed-voice-validation.md.
- Prazo informado: domingo, 22/11/2026, 12h, America/Sao_Paulo.
- Congelamento recomendado: 10h30; priorizar configuração, prova de voz, gravação e submissão.
- Fora do núcleo Agora: WhatsApp e ligação entraram como extensão com componentes externos declarados; o vídeo virou entregável da submissão; o avatar 3D atual é renderização local no cliente. Permanecem fora: track de avatar por vendor Agora, diagnóstico, monitoramento clínico, P2.
- Não afirmar que testes ou integrações pendentes passaram. Não usar dados reais no login fictício local.
