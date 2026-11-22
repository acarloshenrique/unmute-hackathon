# Texto de submissão (OS) — colar pronto

## Descrição

**Problema.** O Brasil tem 32,1 milhões de pessoas com 60+ anos (Censo IBGE 2022) e ~19,9 milhões delas conectadas (PNAD TIC 2022, derivado). A coordenação do cuidado acontece hoje em grupos de WhatsApp: pedidos se perdem, ninguém sabe quem assumiu, e o idoso não tem voz no processo — a família decide sobre ele, não com ele. Entre o chat manual e a teleassistência de emergência (R$ 89–250/mês, só reage a quedas) não existe solução de presença cotidiana.

**Público.** Famílias que cuidam de um idoso à distância — um "círculo" de 2 a 5 pessoas. Primeiro usuário: a filha/filho cuidador; beneficiário central: o idoso, que ganha autonomia e voz sobre o próprio cuidado.

**Solução.** CareCircle é coordenação familiar onde o idoso participa por voz. A cuidadora (Ana) agenda um convite; a assistente Lia conversa com a idosa (Helena) em português; o pedido dela vira um rascunho privado por function calling; Helena revisa e confirma na tela; só então o pedido é compartilhado com o destinatário escolhido (Pedro), que aceita a tarefa. O diferencial é o consentimento por design: **voz nunca autoriza, silêncio não é consentimento** — a confirmação é sempre visual e o compartilhamento é opt-in por destinatário.

A mesma Lia alcança o **WhatsApp** (canal que o idoso já usa): conversa por nota de voz, lê o estado real do círculo, mostra as telas do app quando pedem, registra a agenda do círculo (idoso, familiares, médicos, laboratório, farmácia, números úteis) e — a pedido explícito de um membro — envia **pedidos de agendamento em áudio** para contatos e **avisos de responsabilidade** para a família. A regra de consentimento se mantém: enviar o pedido é a ação que a própria pessoa solicitou; confirmar agenda continua sendo do humano do outro lado.

**Uso da Agora.** RTC transporta o áudio do navegador; RTM carrega estado e legendas em tempo real; a sessão roda no Conversational AI gerenciado da Agora — STT (ARES pt-BR com hotwords de domínio) → LLM com ferramentas (única ação disponível: `prepareRequest`, executada server-side) → TTS na edge — com SAL speaker-locking e VAD para turnos limpos e interrupção. Na demo, a correção falada "às dez da manhã" revisa o mesmo rascunho ao vivo. O **próprio pitch é narrado pela Lia**: os takes foram gerados por um agente Conversational AI num canal RTC (endpoint `speak`) e capturados do áudio do canal — a voz do produto narra a própria história. No WhatsApp, a mesma persona usa Whisper + LLM + TTS por HTTP (a edge não disparava turno de forma confiável com áudio push — declarado); a sessão Agora 100% gerenciada segue sendo a demo do app.

**Evidência.** Vídeo narrado (1min53s) mostra a sessão real completa: saudação → pedido → confirmação por voz → correção → confirmação visual → tarefa aceita pelo familiar. Personas Helena, Ana e Pedro são fictícias; dados são sintéticos.

## Links

- Repositório: https://github.com/acarloshenrique/unmute-hackathon (público)
- Demo: https://carecircle.jazzautomations.com.br/demo (complementar — o vídeo é a fonte da banca)
- Versão entregue: commit `2e60660` (main)
- Vídeo: `carecircle_pitch_lia.mp4` (pitch de negócio narrado pela própria Lia — dor, mercado, gap, consentimento, sessão real, modelo, expansão, moat; `carecircle_demo.mp4`/`carecircle_demo_raw.mp4` = sessão integral)
- Lia no WhatsApp: número da instância demo `5511974128451` — membros cadastrados conversam por nota de voz

## Componentes preexistentes e simulações

- Personas fictícias (Helena, Ana, Pedro); nenhum dado real.
- Voz da "Helena" na gravação é TTS sintético no microfone (declarado); a Lia responde ao vivo via pipeline Agora real.
- Narração do vídeo: gerada por agente Agora Conversational AI real (`speak` + captura RTC); o segmento de demo usa o áudio original da sessão.
- Canal WhatsApp: Evolution API (self-hosted) + Groq Whisper/LLM + Fish Audio TTS — componentes externos declarados; o pipeline Agora gerenciado cobre a sessão do app.
- Login de demonstração, SQLite local — autenticação real é próximo passo.
- Experimento separado do lab (não parte do produto): ponte telefone↔RTC via Twilio (`/opt/naima-call`, fora deste repo).
