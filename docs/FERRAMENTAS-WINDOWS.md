# Ferramentas | Windows

| Ferramenta | Para quê | Prioridade |
|---|---|---|
| Git + GitHub | Versionar e publicar a versão entregue | Essencial |
| Node.js LTS + npm/npx | Executar skills oficiais e ferramentas JavaScript | Se usar Node |
| Agora Console + CLI | Habilitar a integração, vincular projeto e diagnosticar | Essencial para o fluxo do quickstart |
| pnpm | Dependências do starter Next.js | Só se escolher Next.js |
| Python + Bun (ou conforme o starter) | Backend Python e comandos do starter oficial | Alternativa, não instale junto por padrão |
| Chrome/Edge + microfone/fone | Verificar permissões, latência, interrupção e eco | Essencial |
| OBS Studio ou gravador equivalente | Capturar tela, narração e resposta do agente | Essencial gravar, OBS é opcional |
| Canva/PowerPoint | Slides da apresentação | Use o que o time já domina |

No PowerShell, na raiz do projeto, rode `./scripts/check-setup.ps1`. O script só verifica ferramentas e nomes de arquivos Git em risco; não instala, não lê valores de segredos e não publica. Para auditoria de histórico use o scanner do time em modo de somente leitura antes de abrir o repo.

## Skill oficial da Agora

A versão incluída fica em `.agents/skills/agora/` (1.9.0, MIT, com referências). Para usar no Codex, abra este projeto e peça pela skill `agora`. Não precisa rodar um instalador de skills. Se sua ferramenta não reconhecer a pasta, indique o arquivo `.agents/skills/agora/SKILL.md` diretamente. A instalação e o login do CLI são passos separados.

## Integração real: use um único starter

1. Abra o quickstart oficial e siga a opção Windows para instalar o CLI. Confirme `agora --help` e faça `agora login` com a conta do time.
2. Em uma pasta de teste **fora do repositório**, crie o starter para verificar acesso antes de integrar. Para Next.js, a documentação mostra:

```powershell
agora init unmute-voice-spike --template platform-nextjs
Set-Location unmute-voice-spike
pnpm install
pnpm dev
```

3. Abra o endereço local indicado pelo terminal, autorize o microfone, converse em PT-BR, interrompa durante a resposta e encerre. Se falhar, rode `agora project doctor` e revise permissões e rede. Não copie saídas com credenciais para o chat ou Git.
4. Confirme a variante, a região e as permissões disponíveis na conta do time. Se o template de preview não estiver habilitado, use o starter que a organização indicar para as credenciais do evento. Não misture exemplos de APIs diferentes.
5. Traga apenas os arquivos necessários ao repo, preserve licenças e registre origem/versão. Não copie o `.git` nem o `.env` do teste. Mantenha o lockfile do gerenciador escolhido.

Extras como avatar, múltiplos agentes, banco e deploy são opcionais: adicione só depois da voz funcionar bem. Use o [guia de sessão](https://docs.agora.io/en/ai/platform/get-started/start-stop-agent) para o ciclo de início e parada se precisar ir além do starter.
