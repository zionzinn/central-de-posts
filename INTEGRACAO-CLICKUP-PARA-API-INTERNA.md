# B.O.N.E × ClickUp: tudo que o painel lê e escreve, pra virar API interna

Versão do painel de referência: **3.63** (`server.js` + `public/index.html` + `public/pauta.html`).
Público deste documento: o time que vai construir o sistema interno e a API que substitui o ClickUp como fonte de dados do B.O.N.E.

---

## 1. Contexto em um parágrafo

O B.O.N.E (Bora Organizar Nossas Entregas) é o painel de planejamento de posts do Grupo SB (SeuBoné, Carbone Educação, Carbone Club, Onevo Energia, Onevo Investimentos, Weevo). Ele **não é** o sistema de produção: o dado mestre do post (nome, status de produção, responsável, briefing, artes, comentários) vive hoje no ClickUp, na lista **House Quatro5** (`list_id 901321051391`, folder MKT `901313343285`, space `901310318852`). O painel guarda só o que é dele (em que dia o post sai, em qual conta, observações internas, matriz de conteúdo, parecer da pauta) e **enriquece** cada post com o que lê do ClickUp, identificado pelo `taskId` (ex.: `86aj4kq6m`, que vem da URL `https://app.clickup.com/t/86aj4kq6m`).

Toda a conversa com o ClickUp está concentrada em **um único arquivo, `server.js`**, em duas funções (`cuFetch` para GET com cache e `cuWrite` para escrita), com base `https://api.clickup.com/api/v2` e header `Authorization: <token pessoal>`. Trocar o ClickUp pela API interna significa reescrever as chamadas listadas nas seções 3 e 4 e manter os contratos internos da seção 6. O front (`index.html`, `pauta.html`) não fala com o ClickUp; ele só consome os endpoints do próprio painel.

---

## 2. O que o painel guarda vs. o que vem do ClickUp

Cada post é um `slot` no `data/data.json` do painel:

| Campo do slot | Dono | Observação |
|---|---|---|
| `id`, `conta`, `date`, `titulo`, `formato`, `angulo`, `obs`, `notas`, `gm`, `collab`, `drive`, `linkRef`, `aprovado`, `postado`, `fixo`, `vaga`, `sugestao`, `parecer`, `matriz`, `responsavelManual`, `artesOcultas`, `artesOrdem`, `origem`, `cat`, `fonteId` | **Painel** | Nada disso existe no ClickUp. Continua no painel após a migração. |
| `taskId` | Painel (referência) | Chave de ligação com a task. No sistema novo vira o `id` do post/task de vocês. |
| `tituloCache` | ClickUp `task.name` | Nome exibido no card quando `titulo` está vazio. |
| `statusCache` = `{status, color}` | ClickUp `task.status.status` + cor | Status de produção. Move toda a lógica de aprovação/alerta (seção 5). |
| `assigneeCache` | ClickUp `task.assignees[].username` (join por vírgula) | Responsável mostrado no card, na pauta e na matriz. |
| `dueCache` | ClickUp `task.due_date` (ms epoch) | Data de entrega real; usada pra detectar ajuste manual lá. |
| `atualizadoEm` | Painel | Quando o cache foi renovado. |

Cache de leitura em memória (`cuCache`): respostas de `GET /task/{id}` e `GET /task/{id}/comment` por 60 s (`CACHE_MS`), com modo "stale" (devolve o que tem e renova em segundo plano). Cache de imagens em memória (LRU 120 MB, ETag/304) pra artes.

---

## 3. LEITURAS: o que o painel puxa do ClickUp

### 3.1 Task individual: `GET /task/{taskId}`

É a chamada mais frequente. Chamada em: enriquecimento em lote (sincronização), abertura do card, pauta pública, importação em lote, antes de cada ação de status.

Campos que o painel efetivamente usa da resposta:

| Campo ClickUp | Uso no painel |
|---|---|
| `id` | chave |
| `name` | nome do card / da linha da pauta / da matriz (`tituloCache`) |
| `status.status` (string) e `status.color` | status de produção normalizado (`trim().toLowerCase()`), cor da pílula. Se a cor não vier em `#hex`, cai numa tabela `statusColors` do painel (seed feita a partir dos status da lista). |
| `assignees[]` → `username`, `initials`, `color` | responsável (nome, iniciais e cor no card) |
| `due_date` (ms epoch) | entrega no ClickUp: exibida, comparada com a fila de datas, e usada na importação em lote pra calcular o dia do post |
| `date_updated` (ms) | "atualizado em" no card |
| `markdown_description` (fallback `text_content`, depois `description`) | briefing/roteiro mostrado no card e na pauta (renderizado como markdown leve) |
| `url` | link "abrir no ClickUp" |
| `attachments[]` → `id`, `title`/`name`, `url`, `url_w_query`, `url_w_host`, `thumbnail_small`, `thumbnail_medium`, `thumbnail_large`, `extension`, `date`, `user.username` | as **artes** do post (galeria do card, capa e visualizador da pauta). `thumbnail_large` é a versão exibida; a original só em tela cheia. |

Não usa: prioridade, tags, checklists, time tracking, subtasks, watchers, dependências, custom fields na leitura (só na criação, seção 4.4).

### 3.2 Comentários da task: `GET /task/{taskId}/comment`

Chamado ao abrir o card (aba Comentários/Arquivos) e pela pauta. Campos usados:

| Campo ClickUp | Uso |
|---|---|
| `comments[].id` | chave |
| `comments[].comment_text` | texto do comentário |
| `comments[].user.username`, `.initials`, `.color` | autor |
| `comments[].date` (ms) | ordenação (mais novo primeiro) |
| `comments[].resolved` | marca visual |
| `comments[].comment[]` (blocos) → `piece.attachment` (mesmos campos de attachment acima) e `piece.image` (`url`, `thumbnail_url`, `thumbnail_small/medium/large`, `title`, `id`) | **artes coladas em comentários**. O painel junta anexos da task + anexos dos comentários, deduplica por `id` (ou nome+data) e ordena natural por nome (`01.png`, `02.png`…). |

### 3.3 Sincronização em lote (o "polling")

- `backgroundSync` roda a cada **75 s** (`SYNC_MS`) e faz `GET /task/{id}` pra todos os slots com `taskId` numa janela de meses (mês anterior, atual e os dois seguintes), **6 requisições em paralelo** (`mapLimit(ids, 6, …)`).
- Também roda sob demanda: `GET /api/state?fresh=1` (botão atualizar), e ao criar/colar uma task no card (espera até 4 s pelo nome/status antes de responder).
- O front consulta o `/api/state` do painel a cada 20 s; **ele não fala com o ClickUp**.
- Isso é o que dispara: atualização de `tituloCache/statusCache/assigneeCache/dueCache` e a detecção de **transições de status** (seção 5.1).

Ponto de melhoria óbvio na API nova: um endpoint em lote (`GET /posts?ids=…` ou `?updated_since=…`) e/ou **webhook de mudança de status** eliminam o polling de 6 em 6.

### 3.4 Estrutura da lista (só pro formulário "Criar no ClickUp")

- `GET /list/{list_id}/member` → `members[].id`, `.username`, `.email`, `.color`. Filtrado pela equipe permitida (`Samuel Melo, Zion, Anny Beatriz, Klenio Braz`, configurável).
- `GET /list/{list_id}/field` → campos customizados. O painel usa dois, ambos do tipo `labels` (multi-etiqueta):
  - **Empresa Tag** (`4edf0f50-f3a4-4666-a8a9-40616038bfe2`), opções: Onevo Energia, Onevo Investimentos, Carbone Club, Carbone Educação, SeuBoné, Weevo, Box Corporativo, Cássio Maia P2P, Pedro Galvão P2P. O painel casa a opção com o nome da conta (sem acento/caixa).
  - **Formato SKILL** (`03539627-9374-4bdb-8864-546c185107bd`), opções: Estático, Carrossel, Vídeo, Estático Ads, Carrossel Ads, Vídeo Ads, Stories, Mídia OFF, Capa de Reels, Outros. Mapeamento painel → etiqueta: reels/vídeo médio/corte de podcast → Vídeo; carrossel → Carrossel; estático → Estático; story → Stories; vídeo de anúncio → Vídeo Ads.
- `GET /list/{list_id}` → `statuses[]` (nome exato, cor, ordem). Usado pra achar o nome exato do status inicial (`pendente ` tem espaço no fim no ClickUp) e pra semear a tabela de cores.
- Cache de 10 min.

### 3.5 Usuário do token: `GET /user`

Só na tela de configuração, pra validar o token e mostrar "conectado como" (`user.username`, `user.email`).

### 3.6 Imagens (proxy)

O painel serve as artes por `GET /api/img?u=<url>`: baixa a URL do ClickUp no servidor (hosts permitidos: `clickup.com`, `*.clickup.com`, `*.clickup-attachments.com`) e entrega ao navegador com cache. Motivo: as URLs de anexo do ClickUp são assinadas/expiram e não podem ir direto pro navegador de quem abre a pauta pública. **Na API nova**: entregar `url` estável (ou assinada com validade longa) + `thumbnail` em pelo menos dois tamanhos (~300 px e ~1200 px de largura). Sem thumbnail o visualizador fica lento.

---

## 4. ESCRITAS: o que o painel muda no ClickUp

### 4.1 Mudar status: `PUT /task/{id}` `{ status }`

Disparado por:
- **Aprovar** no card do painel: exige que a task esteja em `aprovar`; move pra `publicar`.
- **Alterar** no card do painel: comenta (4.2) e move pra `alterar`.
- **Parecer pela pauta pública** (link sem login): "aprovado" → se a task está em `aprovar`, move pra `publicar`; senão só registra e comenta, sem mover. "pedir alteração" → comenta e move pra `alterar`.
- **Ctrl+Z** de uma ação de status: devolve o status anterior (`statusAntes`, lido antes da ação).

### 4.2 Comentar: `POST /task/{id}/comment` `{ comment_text, notify_all: true }`

Disparado por: pedido de alteração (painel ou pauta, prefixo `ALTERAÇÃO SOLICITADA…`), aprovação pela pauta (prefixo `APROVADO (pela pauta, por X)`), e o campo de comentário livre dentro do card. `notify_all` é o que avisa o time no ClickUp.

### 4.3 Editar descrição: `PUT /task/{id}` `{ markdown_description }` (fallback `{ description }` se der 400)

Disparado por: edição do briefing dentro do card (aba Descrição). Ctrl+Z devolve o texto anterior.

### 4.4 Criar task: `POST /list/{list_id}/task`

Corpo enviado:
```json
{
  "name": "[REELS] - Onevo Energia - Case Pirelli",
  "markdown_description": "briefing digitado (opcional)",
  "assignees": [112066326],
  "status": "pendente ",
  "custom_fields": [
    { "id": "<Empresa Tag>", "value": ["<id da opção da empresa>"] },
    { "id": "<Formato SKILL>", "value": ["<id da opção do formato>"] }
  ]
}
```
Nada é obrigatório além do nome (o painel monta `[FORMATO] - Empresa - Título`; sem nada vira "Novo post (sem nome)"). Entrega (`due_date`) está **desligada** hoje. Da resposta o painel usa `id`, `name`, `url`, `status`, `assignees`, `due_date` pra já preencher o card sem esperar o próximo ciclo.

### 4.5 Entrega: `PUT /task/{id}` `{ due_date: <ms>, due_date_time: false }`

Fila `dueSync` ("Aplicar datas no ClickUp"): quando um post com task muda de dia no calendário, o painel enfileira a entrega = **2 dias úteis antes do dia do post** e aplica quando você clica em Aplicar. Retry automático se falhar.

---

## 5. Regras de negócio que dependem do status (precisam continuar valendo)

### 5.1 Máquina de status usada pelo painel

Status da lista House Quatro5, na ordem: `solicitado form` → `banco de conteúdos` → `pendente ` → `em progresso` → `alterar` → `pré revisão` → `revisão ia` → `aprovar` → `aprovação líder` → `publicar` → `banco de criativos` → `revisão solicitada` → `completo`.

O painel trata por nome (normalizado). Os que têm lógica:

| Status | O que o painel faz |
|---|---|
| `aprovar` | **entrou aqui** = aviso "PRA APROVAR" (faixa, título piscando, bipe, notificação do Windows, WhatsApp via Z-API se ligado). Único status em que o botão Aprovar funciona. Pauta mostra como "pra aprovar". |
| `alterar` | **entrou aqui** = aviso "PRA ALTERAR" com motivo e quem pediu (se veio da pauta). |
| `publicar` | "pronto": card rosa, pauta conta como pronto/publicar, matriz = "Em aprovação". |
| `aprovação líder`, `revisão solicitada` | contam como "em aprovação" na matriz. |
| `pendente `, `em progresso`, `pré revisão`, `revisão ia`, etc. | "em produção" na pauta. |
| `completo` / `banco de criativos` | só exibição. |

Detecção de transição: compara o status anterior guardado no slot com o novo a cada sincronização; só avisa quando **já conhecia** um status diferente (evita enxurrada no restart) e não repete enquanto o status não sair e voltar (`db.avisos[taskId]`). Movimentos feitos pelo próprio painel marcam `db.avisos` pra não se autoavisar.

### 5.2 Postado ≠ status

"Postado" é um flag do painel (clique no check do card), não um status do ClickUp. Continua assim.

### 5.3 Nome da task como fallback de conta

Se o nome da task diz "Onevo Energia" e o card está em outra conta, o painel sugere mover (`t-cdiv`). Usa só `task.name`.

---

## 6. Contrato mínimo da API interna (proposta, na medida do que o painel precisa)

Autenticação: um token de serviço no header (o painel já guarda token em variável de ambiente no Render). Datas em ISO 8601 ou ms epoch, mas **consistentes**. IDs curtos e estáveis (vão aparecer em URL: `/t/{id}`).

### 6.1 Ler um post
`GET /posts/{id}`
```json
{
  "id": "abc123",
  "nome": "[REELS] - Onevo Energia - Case Pirelli",
  "status": { "nome": "aprovar", "cor": "#0f9d9f", "ordem": 7 },
  "responsaveis": [{ "id": 1, "nome": "Klenio Braz", "iniciais": "KB", "cor": "#..." }],
  "empresa": "Onevo Energia",
  "formato": "Vídeo",
  "briefing_markdown": "# ROTEIRO\n...",
  "entrega": "2026-09-22",
  "atualizado_em": "2026-09-21T15:00:00Z",
  "url": "https://sistema.interno/t/abc123",
  "artes": [
    { "id": "f1", "nome": "01.png", "url": "https://.../01.png", "thumb": "https://.../01_300.png", "thumb_grande": "https://.../01_1200.png", "ext": "png", "criado_em": "...", "por": "Anny Beatriz" }
  ]
}
```

### 6.2 Ler vários (substitui o polling de 6 em 6)
`GET /posts?ids=a,b,c` ou `GET /posts?updated_since=<ts>` devolvendo a lista acima (campos resumidos bastam: id, nome, status, responsaveis, entrega, atualizado_em).

### 6.3 Comentários
`GET /posts/{id}/comentarios` → `[{ id, autor:{nome,iniciais,cor}, texto, criado_em, resolvido, artes:[...] }]` (artes coladas no comentário com os mesmos campos de 6.1).
`POST /posts/{id}/comentarios` `{ texto, notificar: true }`.

### 6.4 Mudar status / descrição / entrega
`PATCH /posts/{id}` aceitando qualquer combinação de `{ status, briefing_markdown, entrega }`. Erro claro (4xx com mensagem) quando o status não existe. Devolver o post atualizado.

### 6.5 Criar
`POST /posts` com `{ nome, briefing_markdown, responsaveis:[id], status, empresa, formato }`. Devolver o post completo (6.1). Nada obrigatório além de `nome`.

### 6.6 Catálogos (pro formulário)
`GET /status` → `[{ nome, cor, ordem }]`; `GET /pessoas` → `[{ id, nome, email }]`; `GET /empresas` e `GET /formatos` → listas de opções (hoje são etiquetas Empresa Tag e Formato SKILL).

### 6.7 Webhook (opcional, mas resolve o alerta em tempo real)
`POST <url do painel>/api/webhook` com `{ evento: "status_mudou", post_id, de, para, por, quando }`. O painel já tem a lógica de transição pronta; só trocaria a origem.

---

## 7. Requisitos não-funcionais que aparecem na prática

- **Volume**: ~50 a 150 posts com task por janela de 4 meses; sincronização a cada 75 s = até ~2 req/s em rajada de 6. Um endpoint em lote derruba isso pra 1 req a cada 75 s.
- **Latência de imagem**: a pauta pública abre artes em galeria; thumbnails de ~1200 px são obrigatórios pra ficar rápido. URL assinada com expiração curta obriga proxy (o painel já tem, mas é gambiarra).
- **Nomes exatos de status**: hoje `pendente ` tem espaço no fim e isso quebrou a criação até ser tratado. Na API nova: slugs (`pendente`, `em_progresso`) + rótulo de exibição.
- **Undo**: o painel guarda "estado anterior" antes de cada escrita pra desfazer. A API só precisa aceitar a escrita reversa; não precisa de histórico próprio.
- **Sem token = modo degradado**: o painel funciona sem ClickUp (cards ficam "sincronizando"/"sem task"). Manter esse comportamento com a API nova: falha da API não pode derrubar o painel.
- **Pauta pública**: links sem login que leem posts, artes e comentários e escrevem parecer/observação/sugestão. A API precisa aceitar que **o painel** (com token de serviço) faça isso em nome de "alguém pela pauta"; não há usuário final autenticado nesse caminho.

---

## 8. O que muda no código do painel na migração

1. `server.js`: `CU_API`, `cuFetch`, `cuWrite` e as ~25 chamadas das seções 3 e 4 viram um adaptador (`fonte.js`) com as funções: `lerPost(id)`, `lerPosts(ids)`, `comentarios(id)`, `comentar(id, texto)`, `mudarStatus(id, status)`, `editarBriefing(id, md)`, `mudarEntrega(id, data)`, `criarPost(dados)`, `catalogos()`.
2. Mapeamento de campos: `name→nome`, `status.status→status.nome`, `assignees→responsaveis`, `markdown_description→briefing_markdown`, `due_date→entrega`, `attachments/comment.image→artes`.
3. `taskIdFromUrl`: hoje extrai o id de `app.clickup.com/t/{id}`; passa a aceitar a URL do sistema novo.
4. Proxy de imagem: pode sumir se as URLs forem estáveis e públicas pra quem tem o link da pauta; senão continua igual, só trocando os hosts permitidos.
5. `statusColors`: passa a vir de `GET /status`.
6. Dados do painel (`data.json`) **não mudam**; só o campo `taskId` passa a apontar pro id novo. Migração: uma tabela de/para `clickup_task_id → id_novo` pra reescrever os slots existentes uma vez.

---

## 9. Perguntas que o time da API precisa responder antes de começar

1. O sistema novo vai manter o **mesmo fluxo de status** (13 etapas) ou vai simplificar? O painel só precisa de `pendente`, `em produção`, `alterar`, `aprovar`, `publicar`, `completo` pra funcionar; os outros são exibição.
2. Artes ficam no sistema novo (upload) ou em storage externo (Drive/S3)? Define se a API entrega URL pública ou assinada.
3. Comentários vão existir lá? Se não, o painel pode guardar comentários localmente, mas o time perde a notificação por comentário.
4. Vai ter **webhook** de mudança de status? Se sim, o polling some.
5. Quem é o "usuário" das escritas feitas pela pauta pública (parecer da Maria Clara sem login)? Sugestão: token de serviço do painel + campo `autor_nome` livre no comentário.
