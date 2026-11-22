# Texto de submissão (OS) — colar pronto

## Descrição

**Problema.** O Brasil tem 32,1 milhões de pessoas com 60+ anos (Censo IBGE 2022) e ~19,9 milhões delas conectadas (PNAD TIC 2022, derivado). A coordenação do cuidado acontece hoje em grupos de WhatsApp: pedidos se perdem, ninguém sabe quem assumiu, e o idoso não tem voz no processo — a família decide sobre ele, não com ele. Entre o chat manual e a teleassistência de emergência (R$ 89–250/mês, só reage a quedas) não existe solução de presença cotidiana.

**Público.** Famílias que cuidam de um idoso à distância — um "círculo" de 2 a 5 pessoas. Primeiro usuário: a filha/filho cuidador; beneficiário central: o idoso, que ganha autonomia e voz sobre o próprio cuidado.

**Solução.** CareCircle é coordenação familiar onde o idoso participa por voz. A cuidadora (Ana) agenda um convite; a assistente Lia conversa com a idosa (Helena) em português; o pedido dela vira um rascunho privado por function calling; Helena revisa e confirma na tela; só então o pedido é compartilhado com o destinatário escolhido (Pedro), que aceita a tarefa. O diferencial é o consentimento por design: **voz nunca autoriza, silêncio não é consentimento** — a confirmação é sempre visual e o compartilhamento é opt-in por destinatário.

**Uso da Agora.** RTC transporta o áudio do navegador; RTM carrega estado e legendas em tempo real; a sessão roda no Conversational AI gerenciado da Agora — STT (ARES pt-BR com hotwords de domínio) → LLM com ferramentas (única ação disponível: `prepareRequest`, executada server-side) → TTS MiniMax na edge — com SAL speaker-locking e VAD para turnos limpos e interrupção. Na demo, a correção falada "às dez da manhã" revisa o mesmo rascunho ao vivo.

**Evidência.** Vídeo narrado (1min53s) mostra a sessão real completa: saudação → pedido → confirmação por voz → correção → confirmação visual → tarefa aceita pelo familiar. Personas Helena, Ana e Pedro são fictícias; dados são sintéticos.

## Links

- Repositório: https://github.com/acarloshenrique/unmute-hackathon (público)
- Demo: https://demo-hermes.taild017e2.ts.net:8443/demo (complementar — o vídeo é a fonte da banca)
- Versão entregue: commit `2a71194` (main)
- Vídeo: `carecircle_demo.mp4` (1min53s, narração + interação real)

## Componentes preexistentes e simulações

- Personas fictícias (Helena, Ana, Pedro); nenhum dado real.
- Voz da "Helena" na gravação é TTS sintético no microfone (declarado); a Lia responde ao vivo via pipeline Agora real.
- Login de demonstração, SQLite local — autenticação real é próximo passo.
- Experimento separado do lab (não parte do produto): ponte telefone↔RTC via Twilio (`/opt/naima-call`, fora deste repo).
