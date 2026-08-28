# Como atualizar o painel no ar (GitHub → Render)

Esta pasta é um **repositório git ligado ao `zionzinn/central-de-posts`**. O histórico dos
seus commits antigos está preservado, e o `origin` já está configurado. Você não precisa
mais copiar e colar arquivo por arquivo no site do GitHub.

## A rotina, sempre igual

Abra o **Git Bash** nesta pasta e rode:

```
git add -A
git commit -m "v3.25"
git push
```

Só isso. Sem `--force`, sem apagar nada. O Render vê o push e republica sozinho em uns
2 minutos. Troque a mensagem pela versão da vez.

Na primeira vez ele vai pedir login:
- **Username**: `zionzinn`
- **Password**: NÃO é a sua senha, é um **token**. Se não tiver, crie em
  github.com/settings/tokens → *Generate new token (classic)* → marque o escopo **repo**
  → copie o código que começa com `ghp_`.

Pra não digitar o token toda vez, rode uma vez só:

```
git config --global credential.helper store
```

O próximo push pede o token e é o último que pede.

## Conferir se subiu

1. **GitHub**: o commit mais novo tem que estar no topo do repositório.
2. **Render**: aba *Logs*, espere `[nuvem] dados restaurados do GitHub: N posts`.
3. **Painel**: abra a URL e dê Ctrl+F5. Se aparecer a faixa dizendo que o servidor está
   numa versão antiga, o deploy ainda não terminou. Espere 1 minuto e recarregue.

## Antes de mexer

Se alguém editou algo pelo site do GitHub desde o seu último push, comece com:

```
git pull --rebase
```

Assim você pega o que mudou lá antes de mandar o seu.

## Regras que não mudam

- **Nunca** altere o `start.js`. É ele que segura a persistência dos dados.
- **Nunca** suba o `config.json` nem a pasta `data/`. O `.gitignore` já bloqueia os dois.
- O token do ClickUp e a senha do painel vivem nas variáveis de ambiente do Render.
- Este repositório guarda só **código**. Os dados moram no `central-posts-dados`, que é
  outro repositório e não é tocado por nenhum comando daqui.

## Pendência de segurança

O `central-de-posts` está **público** hoje. Não tem segredo nenhum dentro dele (conferido
commit por commit: nada de config.json, data.json, token do ClickUp ou do GitHub), mas o
plano original era ele ser privado, e não há motivo pra deixar o código da operação aberto.

Pra fechar: repositório → **Settings** → desça até **Danger Zone** → **Change repository
visibility** → **Make private**. Isso não afeta o Render, que já está conectado.

O `central-posts-dados`, que é o que realmente importa, já está privado. Conferi.
