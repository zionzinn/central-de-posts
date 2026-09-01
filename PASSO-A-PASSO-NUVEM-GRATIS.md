# Painel 24/7 de graça (PC desligado)

Seu painel v3.32 sobe pra nuvem **sem alterar uma linha do server.js**. Tudo que ele já faz
continua igual: arrastar, Semana/Mês, Produção, Relatório, Exportar, Bancos, GM/BP, undo,
artes dos comentários e o "Aplicar datas no ClickUp".

O único problema que a nuvem gratuita tem é não ter disco fixo: quando a máquina reinicia,
o `data.json` sumiria. Quem resolve isso é o arquivo novo **start.js**, que baixa seus dados
ao ligar e devolve a cada alteração. Testado aqui: apaguei o disco inteiro, subi de novo e
os 134 posts voltaram, com a alteração feita segundos antes.

**Custo: R$ 0. Cartão de crédito: nenhum, em passo nenhum.**

---

## Parte 1 · GitHub (guarda o código e os dados)

1. Crie a conta em **github.com/signup** (grátis, sem cartão).
2. Crie o **repositório do código**: botão **+** (canto superior direito) → **New repository**
   → nome `central-de-posts` → marque **Private** → **Create repository**.
3. Na tela seguinte clique em **uploading an existing file** e arraste TODO o conteúdo da
   pasta que eu te mandei (`start.js`, `server.js`, `package.json`, e as pastas `lib`,
   `public`, `scripts`). Desça e clique **Commit changes**.
4. Crie o **repositório dos dados**: **+** → **New repository** → nome `central-posts-dados`
   → **Private** → **Create repository**.
5. Nesse segundo repositório, clique **uploading an existing file** e arraste o arquivo
   `data.json` que está na pasta `painel-posts\data` do seu PC. **Commit changes**.
   (É a sua base atual: 134 posts. Sem esse passo o painel sobe vazio.)

> Por que dois repositórios: o painel salva os dados várias vezes por dia, e cada
> salvamento vira um commit. Se dados e código ficassem juntos, cada salvamento
> reiniciaria o painel. Separados, isso não acontece. Bônus: cada salvamento fica no
> histórico do GitHub, então você ganha backup versionado de graça.

## Parte 2 · A chave que deixa o painel gravar os dados

6. Vá em **github.com/settings/personal-access-tokens/new** (Settings → Developer settings
   → Personal access tokens → **Fine-grained tokens** → Generate new token).
7. Preencha: **Token name** `painel-dados` · **Expiration**: escolha **No expiration**
   (ou a maior possível) · **Repository access**: marque **Only select repositories** e
   escolha `central-posts-dados`.
8. Em **Permissions → Repository permissions**, ache **Contents** e mude para
   **Read and write**. Só isso.
9. **Generate token** e **copie o código que aparece** (começa com `github_pat_`). Ele só
   aparece uma vez. Guarde no bloco de notas por enquanto, e não cole em chat nenhum.

## Parte 3 · Render (a máquina que fica ligada)

10. Entre em **render.com** e clique **Get Started** → **GitHub** (login com a conta que
    você acabou de criar; o plano gratuito não pede cartão).
11. No painel do Render: **New** → **Web Service** → **Build and deploy from a Git
    repository** → **Next** → conecte e escolha o repositório `central-de-posts`.
12. Configure assim:
    - **Name**: `central-de-posts` (vira o endereço `central-de-posts.onrender.com`)
    - **Region**: Oregon (ou a mais próxima disponível)
    - **Branch**: `main`
    - **Runtime / Language**: **Node**
    - **Build Command**: `npm install`
    - **Start Command**: `node start.js`
    - **Instance Type**: **Free**
13. Clique em **Advanced** → **Add Environment Variable** e cadastre estas (uma por linha):

    | Chave | Valor |
    |---|---|
    | `CU_TOKEN` | seu token do ClickUp (o mesmo do config.json) |
    | `CU_SENHA` | a senha de entrada do painel (você e a Maria usam essa) |
    | `SB_SECRET` | qualquer texto aleatório longo, ex.: `sb-9f3k2p8x-natal-2026` |
    | `GH_TOKEN` | o token do GitHub da Parte 2 (`github_pat_...`) |
    | `GH_REPO` | `SEU-USUARIO/central-posts-dados` |
    | `GH_PATH` | `data.json` |
    | `DATA_DIR` | `/tmp/dados` |

14. **Create Web Service**. A primeira subida leva 2 a 3 minutos.
15. Quando terminar, abra a aba **Logs**. Você deve ver:
    `[nuvem] dados restaurados do GitHub: 134 posts.`
    Se aparecer isso, está funcionando. Abra a URL, digite a senha e confira o painel.

## Parte 4 · Manter acordado (opcional, 2 minutos)

O plano gratuito do Render coloca o serviço pra dormir depois de 15 minutos sem acesso, e
a primeira abertura depois disso demora cerca de 1 minuto. Se isso te incomodar:

16. Entre em **cron-job.org** (grátis, sem cartão), crie conta e clique **Create cronjob**.
17. **Title**: `acordar painel` · **URL**: a URL do seu painel · **Execution schedule**:
    **Every 10 minutes** → **Create**.

Assim ele fica sempre acordado. O plano gratuito do Render dá 750 horas por mês e um mês
tem cerca de 730, então um único serviço ligado direto cabe na franquia.

---

## O que muda no seu dia a dia

- **Endereço**: `https://central-de-posts.onrender.com` (ou o nome que você escolher).
  Funciona de qualquer lugar, com o PC desligado. Manda pra Maria com a senha.
- **Seu PC**: pode continuar usando o painel local pra testar coisas novas, mas escolha UM
  como oficial. Recomendo o online, senão os dois calendários divergem.
- **Backup**: cada alteração vira um commit no `central-posts-dados`. Pra ver ou restaurar
  uma versão antiga, entre no repositório → arquivo `data.json` → **History**.
- **Segurança**: token do ClickUp e senha ficam nas variáveis do Render, nunca no código
  nem no repositório. Os dois repositórios são privados.

## Quando você atualizar o painel no PC (nova versão v3.23, v3.24...)

Entre no repositório `central-de-posts` no GitHub → clique no arquivo que mudou (normalmente
`server.js` ou `public/index.html`) → ícone de lápis → apague o conteúdo, cole o novo →
**Commit changes**. O Render republica sozinho em ~2 minutos. Os dados não são afetados.

Nunca altere o `start.js`: ele é a peça que segura a persistência.

## Se algo der errado

- **Logs do Render** (aba Logs) dizem tudo. As mensagens que começam com `[nuvem]` são do
  sistema de dados.
- `[nuvem] FALHA ao restaurar do GitHub` → confira `GH_TOKEN`, `GH_REPO` e se a permissão
  **Contents: Read and write** foi marcada. Nesse estado o envio fica desligado de
  propósito, pra não sobrescrever seu backup.
- `[nuvem] ENVIO BLOQUEADO` → é a trava de segurança: o banco local ficou muito menor que o
  backup. Nada foi sobrescrito. Me chame antes de mexer.
- Painel demorou ~1 minuto pra abrir → ele estava dormindo. Veja a Parte 4.
