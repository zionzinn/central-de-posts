// Matriz de conteúdo do feed da SeuBoné.
// Fonte: planilha "Matriz SeuBoné" (aba Tipos de conteúdo + Como usar) e o artifact "Matriz SeuBoné"
// (formatos e ângulos por tipo, regras da rotação). Tudo que é regra da matriz mora AQUI, num lugar só:
// o servidor usa pra gerar os cards e a planilha, e manda pro navegador pelo /api/state.
'use strict';

// Tipos de conteúdo. As colunas "travadas" (objetivo até métricas) saem do tipo, a copywriter não mexe.
const TIPOS = {
  'Case': {
    objetivo: 'Provar', funil: 'Meio', consciencia: 'Consciente da solução', emocao: 'Desejo',
    cta: 'Clique no link da bio', metrica1: 'Cliques no link da bio | Visitas ao perfil', metrica2: 'Salvamentos | Retenção | DMs',
    quando: 'Toda segunda', oQueE: 'Cliente real, de preferência marca conhecida, com número.',
    formatos: ['Carrossel storytelling (pedido → produção → entrega)', 'Mini documentário de 60 s', 'Foto real + texto', 'Antes e depois (logo no papel → boné pronto)', 'Repost de story do cliente', 'Vídeo contando o case com gancho forte', 'Alguém contando o case'],
    angulos: ['O problema que o boné resolveu', 'Qual foi o uso', 'Que efeito resultou'],
  },
  'Educação': {
    objetivo: 'Atrair', funil: 'Topo', consciencia: 'Consciente do problema', emocao: 'Dor',
    cta: 'Salva e manda pra quem cuida do marketing', metrica1: 'Alcance | Compartilhamentos | Salvamentos', metrica2: 'Seguidores novos | Comentários | Tempo de tela',
    quando: 'Terça da semana A', oQueE: 'Um insight por post, que o comprador salva e manda pra quem decide.',
    formatos: ['Carrossel checklist', 'Péssimo x bom x excelente', 'Erro comum', 'Use isso pra isso', 'Mitos e verdades', 'Tier list', 'Quadro branco', 'FAQ', 'Como fazer', 'Como funciona'],
    angulos: ['Qual modelo pra qual uso (trucker, aba curva, aba reta...)', 'Bordado x silk x patch x sublimação', 'Quando pedir pra chegar a tempo do evento', 'Erros de arte (logo pequeno demais, cor que não borda)', 'Quantos bonés pedir', 'Como fazer o brinde ser usado depois do evento'],
  },
  'Prova': {
    objetivo: 'Provar', funil: 'Meio', consciencia: 'Consciente do produto', emocao: 'Desejo',
    cta: 'Clique no link da bio', metrica1: 'Cliques no link da bio | Visitas ao perfil', metrica2: 'Salvamentos | Retenção | DMs',
    quando: 'Toda quarta', oQueE: 'Big number, avaliação, depoimento, volume entregue.',
    formatos: ['Número gigante', 'Placar de 3 números', 'Card de avaliação com estrelas', 'Print de depoimento', 'Pilha de depoimentos', 'Vídeo depoimento', 'Repost de story', 'Feedback com foto', 'Feedback em vídeo', 'Depoimento em vídeo', 'NPS', 'Carrossel de bonés + feedback de quem recebeu'],
    angulos: ['Clientes atendidos e bonés produzidos (confirmar os números antes de postar)', 'Avaliação no Google', 'Cliente que recompra', 'Marcas conhecidas que usam', 'Bonés que saíram essa semana'],
  },
  'Produto': {
    objetivo: 'Converter', funil: 'Fundo', consciencia: 'Consciente do produto', emocao: 'Desejo',
    cta: 'Simule com o seu logo', metrica1: 'Orçamentos (leads) | Simulações com logo', metrica2: 'DMs | Cliques no link da bio',
    quando: 'Quinta (e domingo na B, opcional)', oQueE: 'Modelo, tecido ou aplicação em contexto de uso. Pode aparecer 2 vezes na mesma semana, sempre com formatos diferentes.',
    formatos: ['POV com o boné na mão', 'Detalhe com zoom', 'Comparativo modelo A x B', 'Callout com setas', 'Grid de cores', 'Foto com bullets'],
    angulos: ['Um modelo por post e pra quem ele serve', 'Uma aplicação de perto (bordado 3D, patch de couro, silk)', 'O mesmo logo em 3 modelos', 'Combinações de cor', 'Acabamento interno'],
  },
  'Hype': {
    objetivo: 'Atrair', funil: 'Topo', consciencia: 'Inconsciente', emocao: 'Curiosidade',
    cta: 'Salva e compartilha', metrica1: 'Alcance | Compartilhamentos | Salvamentos', metrica2: 'Seguidores novos | Comentários | Tempo de tela',
    quando: 'Toda sexta', oQueE: 'Novidade, lançamento, bastidor de grande marca.',
    formatos: ['Giro de notícia', 'Trend / POV', 'Meme', 'Starter pack', 'React', 'Teaser', 'Anúncio de novidade'],
    angulos: ['Marca conhecida usando boné em ação', 'Lançamento de modelo ou cor', 'Bastidor de pedido grande (com autorização)', 'Trend de áudio gravada na fábrica', 'Coisas que só quem compra brinde corporativo passa'],
  },
  'Demanda': {
    objetivo: 'Converter', funil: 'Fundo', consciencia: 'Consciente do produto', emocao: 'Dor',
    cta: 'Faça seu orçamento', metrica1: 'Orçamentos (leads) | Simulações com logo', metrica2: 'DMs | Cliques no link da bio',
    quando: 'Todo sábado', oQueE: 'Data comercial, sazonal, motivo real pra pedir agora.',
    formatos: ['Timeline de prazo', 'Notificação / lembrete', 'Checklist / FAQ', 'Callout', 'Frase-manifesto', 'Grid / colagem'],
    angulos: ['Contagem regressiva com o prazo real ("pra chegar na confraternização de dezembro, o pedido fecha até [data]")', 'Fim de ano, Black Friday, feiras do setor, SIPAT, kit de boas-vindas', 'O prazo de 7 ou 14 dias úteis como saída pra quem atrasou'],
  },
  'Fábrica': {
    objetivo: 'Provar', funil: 'Meio', consciencia: 'Consciente da solução', emocao: 'Curiosidade',
    cta: 'Clique no link da bio', metrica1: 'Cliques no link da bio | Visitas ao perfil', metrica2: 'Salvamentos | Retenção | DMs',
    quando: 'Domingo', oQueE: 'Como é feito, bordado, escala, bastidor.',
    formatos: ['Bastidores do dia', 'Horizontal cinemático', 'Passo a passo (do logo ao boné)', 'Detalhe da máquina bordando', 'Vlog', 'Foto de celular com flash'],
    angulos: ['Uma etapa por vídeo (digitalização do logo, bordado, corte, costura, controle de qualidade, embalagem)', 'O rosto de quem faz', 'Escala ("quantos bonés saem por dia")', 'O erro que o controle de qualidade pega', 'Fábrica exclusiva'],
  },
  'Oferta direta': {
    objetivo: 'Converter', funil: 'Fundo', consciencia: 'Totalmente consciente', emocao: 'Desejo',
    cta: 'Simule com o seu logo', metrica1: 'Orçamentos (leads) | Simulações com logo', metrica2: 'DMs | Cliques no link da bio',
    quando: 'Terça da semana B (slot aberto)', oQueE: 'Pedido direto de orçamento, com motivo claro e sem enrolação. Só na semana B.',
    formatos: ['Simulação com o logo (arte → boné pronto)', 'Fala direta do vendedor (oferta, suporte, CTA)', 'Chat WhatsApp ("como é pedir")', 'Callout com setas', 'Anti-anúncio', 'Ugly post'],
    angulos: ['Simule com o seu logo e veja antes de pagar', 'Como é pedir, em 3 passos', 'Quantidade mínima e prazo', 'Condição do mês (confirmar com o comercial antes de citar)', 'Kit pronto pra evento ou equipe'],
  },
  'Autoridade': {
    objetivo: 'Provar', funil: 'Meio', consciencia: 'Consciente do produto', emocao: 'Desejo',
    cta: 'Clique no link da bio', metrica1: 'Cliques no link da bio | Visitas ao perfil', metrica2: 'Salvamentos | Retenção | DMs',
    quando: 'Terça da semana B (slot aberto)', oQueE: 'O tamanho e a experiência da SeuBoné como motivo pra confiar. Só na semana B.',
    formatos: ['Número gigante', 'Fala direta do fundador', 'Carta do fundador', 'Selo de imprensa', 'Retrospectiva (datas e conquistas)', 'Bastidor de marca grande'],
    angulos: ['Escala da operação (confirmar os números)', 'Marcas grandes atendidas', 'Tempo de mercado', 'Imprensa e reconhecimento', 'O fundador falando de marca e brinde que funciona'],
  },
  'Sazonal': {
    objetivo: 'Converter', funil: 'Fundo', consciencia: 'Consciente do produto', emocao: 'Dor',
    cta: 'Faça seu orçamento', metrica1: 'Orçamentos (leads) | Simulações com logo', metrica2: 'DMs | Cliques no link da bio',
    quando: 'Terça da semana B (slot aberto)', oQueE: 'Uma data do calendário com ideia de boné pronta pra ela. Só na semana B.',
    formatos: ['Calendário de datas com prazo de pedido', 'Teaser da data', 'Grid de modelos temáticos', 'Notificação / lembrete', 'Case da mesma data no ano passado'],
    angulos: ['Quando pedir pra cada data chegar a tempo', 'Ideia de boné pra data (cor, aplicação, frase)', 'Como uma empresa usou boné na mesma data', 'Datas do setor do cliente (feira, convenção, lançamento)'],
  },
};

// Ciclo de 2 semanas. Índice 0 = segunda ... 6 = domingo.
// String = tipo fixo do dia. Array = slot EM ABERTO: o time escolhe um desses.
const SEMANAS = {
  A: ['Case', 'Educação', 'Prova', 'Produto', 'Hype', 'Demanda', 'Fábrica'],
  B: ['Case', ['Oferta direta', 'Autoridade', 'Sazonal'], 'Prova', 'Produto', 'Hype', 'Demanda', ['Fábrica', 'Produto']],
};
// Segunda-feira que abre uma semana A (ciclo da planilha: 28/09 a 11/10/2026 = A e B).
const ANCORA = '2026-09-28';

const STATUS = ['Não iniciado', 'Briefing criado', 'Em produção', 'Em aprovação', 'Aprovado', 'Postado'];

// O que a copywriter preenche (colunas amarelas da planilha). "tipo" só nos slots em aberto.
const CAMPOS = ['tipo', 'formato', 'pautaQuente', 'angulo', 'tema', 'tese', 'gancho', 'descricao', 'refs', 'responsavel', 'status', 'obs'];
// Os que contam no "x/8 preenchido" do card e no avanço automático pra "Briefing criado".
const OBRIGATORIOS = ['formato', 'pautaQuente', 'angulo', 'tema', 'tese', 'gancho', 'descricao', 'responsavel'];

const REGRAS = [
  'As semanas A e B se alternam. Na B, a terça sai de Educação e vira um slot em aberto: Oferta direta, Autoridade ou Sazonal, conforme o momento.',
  'Uma semana pode ter dois posts de Produto, desde que em formatos diferentes (ex.: POV na quinta e comparativo modelo A x B no domingo).',
  'O mesmo formato não repete dentro do mesmo tipo em duas semanas seguidas.',
  'Um insight por post e um CTA por post, sempre dos CTAs aprovados.',
  'Número, marca de cliente e depoimento só com confirmação e autorização. Nada inventado.',
  'Sem palavra em inglês nem termo de marketing que o dono de PME não usa. "Retorno", não "ROI".',
];
const CHECKLIST = [
  'Tese clara e gancho que dá pra entender em 1,5 s',
  'A marca se posicionou em algum ponto da peça',
  'Tem pelo menos um momento de entretenimento, não só informação',
  'CTA único e igual ao do tipo',
  'Número e marca de cliente confirmados e autorizados',
  'Sem erro de português',
];

// Conteúdo que já estava pronto na planilha (aba "Ciclo 28-09 a 11-10"). Só entra num dia que
// estiver VAZIO no painel na hora de gerar: se o dia já tem post, o post manda e isso aqui é ignorado.
const SEED = {
  '2026-09-28': { tipo: 'Case', formato: 'Vídeo contando o case com gancho forte', pautaQuente: 'ATEMPORAL (case próprio)', angulo: 'Que efeito resultou', tema: 'Porto: 70 mil bonés distribuídos', tese: 'Boné distribuído em escala leva a marca pra lugares onde a campanha não chega.', gancho: '70 mil bonés com a marca da Porto. Olha onde eles foram parar.', descricao: 'Alguém do time conta em 40 s o case da Porto: qual era a situação, que boné foi feito, onde foi distribuído e o que resultou. Abre com o número. Inserts: fotos do pedido e do boné em uso.', refs: 'Fotos do pedido no Drive da fábrica', obs: 'Confirmar o número e a autorização da Porto antes de gravar' },
  '2026-09-29': { tipo: 'Educação', formato: 'Use isso pra isso', pautaQuente: 'ATEMPORAL', angulo: 'Bordado x silk x patch x sublimação', tema: 'Qual aplicação usar no seu boné', tese: 'A aplicação certa depende do logo e do uso; escolher errado deixa o boné bonito no mockup e ruim na mão.', gancho: 'Bordado, silk, patch ou sublimação? Cada um serve pra uma coisa.', descricao: 'Carrossel de 6 slides: capa; um slide por aplicação com foto de perto, pra que serve e quando não usar; último slide "Salva pra quando for pedir".', refs: 'Fotos de perto de cada aplicação (fábrica)', obs: '' },
  '2026-09-30': { tipo: 'Prova', formato: 'Carrossel de bonés + feedback de quem recebeu', pautaQuente: 'ATEMPORAL', angulo: 'Bonés que saíram essa semana', tema: 'Os bonés que saíram essa semana', tese: 'O melhor argumento de venda é quem acabou de receber.', gancho: 'Esses saíram da fábrica essa semana. E foi isso que os clientes falaram.', descricao: '6 a 8 fotos de pedidos que saíram da fábrica na semana, cada uma com a frase de quem recebeu (print do WhatsApp do vendedor, com autorização).', refs: 'Planilha da rotina de UGC + prints dos vendedores', obs: 'Pedir autorização dos clientes' },
  '2026-10-01': { tipo: 'Produto', formato: 'POV com o boné na mão', pautaQuente: 'ATEMPORAL', angulo: 'O mesmo logo em 3 modelos', tema: 'Um logo, três modelos', tese: 'O mesmo logo muda de cara conforme o modelo: escolher o modelo é escolher como a marca aparece.', gancho: 'O mesmo logo em 3 bonés. Qual combina com a sua marca?', descricao: 'POV: a mão pega 3 bonés com o mesmo logo (trucker, aba curva, aba reta) e gira cada um. Texto na tela: pra quem cada modelo serve.', refs: '', obs: '' },
  '2026-10-02': { tipo: 'Hype', formato: 'React', pautaQuente: '1 ano do pop-up do Claude em Nova York (04/10/2025)', angulo: 'Marca conhecida usando boné em ação', tema: 'A fila por um boné do Claude em Nova York', tese: 'Até a marca mais digital do mundo usou um objeto físico pra colocar gente na rua.', gancho: 'Uma empresa de inteligência artificial fez centenas de pessoas esperarem na fila por um boné.', descricao: 'Reels com as fotos e o post do pop-up do Claude (Anthropic) em Nova York: café e boné de graça, fila de 500 a 700 pessoas por quarteirões. Fecha com a leitura SeuBoné: a empresa de IA mais falada do mundo escolheu um boné pra colocar gente na rua.', refs: 'Post: instagram.com/p/DPeHslegd7r · Matéria: consumidormoderno.com.br/anthropic-claude-ruas · Fotos pro Samuca: consumidormoderno.com.br/wp-content/uploads/2025/10/SaveClip.App_559472153_17976302405917032_6293589265579617392_n-1-769x1024.jpg · consumidormoderno.com.br/wp-content/uploads/2025/10/SaveClip.App_558805410_17976302420917032_667656917516572461_n-1-769x1024.jpg · pbs.twimg.com/media/G2bQaDEXIAAR69u?format=jpg&name=large', obs: 'Evento de 04/10/2025 (dá pra usar como "há um ano"). Relatos falam em 500 a mais de 700 pessoas: usar "centenas" ou citar a fonte' },
  '2026-10-03': { tipo: 'Demanda', formato: 'Timeline de prazo', pautaQuente: 'Confraternizações de fim de ano', angulo: 'Contagem regressiva com o prazo real', tema: 'Prazo pra ter boné na confraternização de dezembro', tese: 'Quem deixa o brinde de fim de ano pra última hora paga produção expressa ou fica sem.', gancho: 'Sua confraternização é em dezembro. Seu pedido de boné fecha em [data].', descricao: 'Estático ou carrossel com a linha do tempo até a confraternização de dezembro, de trás pra frente: data da festa, envio (2 a 10 dias), produção (até 21 dias úteis), arte e aprovação. Fecha com "o pedido fecha até [data]".', refs: '', obs: 'Calcular a data com o comercial' },
  '2026-10-04': { tipo: 'Fábrica', formato: 'Detalhe da máquina bordando', pautaQuente: 'ATEMPORAL', angulo: 'Uma etapa por vídeo', tema: 'O logo virando bordado', tese: 'Boné bom se vê de perto: é no bordado que a qualidade aparece.', gancho: '[Nº] mil pontos. É isso que tem num logo bordado.', descricao: '30 s na máquina de bordado: o logo aparecendo ponto a ponto, som ambiente, close no acabamento no final.', refs: '', obs: 'Confirmar com a fábrica quantos pontos tem um logo médio' },
  '2026-10-05': { tipo: 'Case', formato: 'Carrossel storytelling (pedido → produção → entrega)', pautaQuente: 'Rock in Rio 2026', angulo: 'Qual foi o uso', tema: 'Os brindes de cabeça do Rock in Rio 2026, e o da Schweppes saiu da nossa fábrica', tese: 'Nos maiores eventos do país, as marcas escolhem brinde que vai pra cabeça do público, e a gente faz esses brindes.', gancho: 'Tic Tac, Doritos e Schweppes levaram bucket hat pro Rock in Rio. O da Schweppes fomos nós que fizemos.', descricao: 'Carrossel: capa com as 3 marcas; Tic Tac (bucket hat, viseira, corta-vento e pins); Doritos (roleta com bucket hats, pochetes e pins, na 6ª edição seguida); Schweppes com foto da produção na nossa fábrica e do bucket no festival; último slide: o próximo evento pode ser o seu.', refs: 'Fotos e vídeos da produção dos bucket hats da Schweppes (Drive da fábrica) · Matéria: tododiaumrock.com.br/corta-vento-bucket-hat-e-pins-veja-os-brindes-da-tic-tac-no-rock-in-rio/rock-in-rio · Refs e inserts: instagram.com/tictacbrasil/reel/DdJ1OqSvbnw · instagram.com/tictacbrasil/reel/DdM5vilhfyL · instagram.com/p/Dc_r4AUlbpd (img 3) · gkpb.com.br/wp-content/uploads/2026/08/tic-tac-rock-in-rio-brindes-1024x576.jpg.webp · pbs.twimg.com/media/HDO7zBHWAAAivnC?format=jpg&name=medium · instagram.com/p/DWKDSEolbfv (img 5) · instagram.com/p/DWWV5EZj9qW · Matérias: livemarketing.com.br/doritos-estreia-turbo-e-aposta-na-cultura-da-street-food-no-rock-in-rio-2026 · viventeandante.com/doritos-turbo-e-destaque-no-rock-in-rio-e-transforma-estande-em-experiencia-de-street-food · Refs pro Samuca: viventeandante.com/wp-content/uploads/2026/09/@sand-doritos.webp · livemarketing.com.br/wp-content/uploads/2026/08/Doritos-no-Rock-in-Rio-2026-03-1024x819.png · instagram.com/p/DdXIRMMtNAa', obs: 'Confirmar quantidade e autorização da Schweppes pra usar o case e as fotos' },
  '2026-10-06': { tipo: 'Oferta direta', formato: 'Simulação com o logo (arte → boné pronto)', pautaQuente: 'ATEMPORAL', angulo: 'Simule com o seu logo e veja antes de pagar', tema: 'Como funciona a simulação com o seu logo', tese: 'Ver o boné com o seu logo antes de pagar tira o risco da compra.', gancho: 'Antes de pagar, você já vê o boné com o seu logo.', descricao: 'Vídeo curto: um logo (cliente autorizado ou marca fictícia) entrando no simulador, virando mockup, e corte pro boné real pronto. Texto: "você vê como fica antes de fechar".', refs: 'sb.seubone.com', obs: 'Confirmar como a simulação funciona hoje no site' },
  '2026-10-07': { tipo: 'Prova', formato: 'Card de avaliação com estrelas', pautaQuente: 'ATEMPORAL', angulo: 'Avaliação no Google', tema: 'O que quem comprou fala no Google', tese: 'Avaliação de quem comprou vale mais que qualquer promessa.', gancho: '[Nota] no Google. Quem comprou explica por quê.', descricao: 'Carrossel com 5 avaliações reais do Google, com nome e empresa, e a nota média na capa.', refs: 'Perfil da SeuBoné no Google', obs: 'Confirmar a nota média' },
  '2026-10-08': { tipo: 'Produto', formato: 'Detalhe com zoom', pautaQuente: 'ATEMPORAL', angulo: 'Uma aplicação de perto (bordado 3D, patch de couro, silk)', tema: 'Bordado 3D de perto', tese: 'Bordado 3D é o detalhe que faz o boné parecer de loja.', gancho: 'Bordado 3D visto de pertinho.', descricao: 'Macro do bordado 3D com luz lateral e a mão passando o dedo no relevo. Termina com um corte rápido do bordado plano pra comparar.', refs: '', obs: '' },
  '2026-10-09': { tipo: 'Hype', formato: 'Giro de notícia', pautaQuente: 'Rock in Rio 2026', angulo: 'Marca conhecida usando boné em ação', tema: 'O boné no Rock in Rio 2026', tese: 'Boné com marca é produto que as pessoas pagam pra usar, não só brinde.', gancho: 'No Rock in Rio, o acessório mais vendido não foi camiseta. Foi boné.', descricao: 'Reels ou carrossel: no Rock in Rio 2026 o boné foi o acessório mais vendido nas lojas da Cidade do Rock (cerca de 400 esgotados em um dia), e a loja oficial vende 7 modelos, de R$120 a R$180. Leitura SeuBoné: boné com marca é produto que as pessoas pagam pra usar.', refs: 'Loja oficial: loja.rockinrio.com/bone · Matéria: g1.globo.com/pop-arte/musica/rock-in-rio/noticia/2026/09/08/o-que-mais-vendeu-no-rock-in-rio-no-frio-da-1a-semana-de-festival.ghtml', obs: 'O número de 400 vem de matéria que cita as lojas do festival: conferir no g1 antes de postar' },
  '2026-10-10': { tipo: 'Demanda', formato: 'Notificação / lembrete', pautaQuente: 'Eventos de novembro e fim de ano', angulo: 'O prazo de 7 ou 14 dias úteis como saída pra quem atrasou', tema: 'Produção expressa pra eventos de novembro', tese: 'Com a arte pronta, a produção expressa ainda salva o evento.', gancho: 'Seu evento é em novembro e o brinde ainda não foi pedido? Ainda dá tempo.', descricao: 'Estático no formato de notificação de celular: "Lembrete: brinde do evento de novembro". Legenda com as opções de produção em 14 e 7 dias úteis (com adicional) e o que precisa estar pronto (arte e quantidade).', refs: '', obs: 'Confirmar com o comercial o adicional e as condições da produção expressa' },
  '2026-10-11': { tipo: 'Produto', formato: 'Comparativo modelo A x B', pautaQuente: 'ATEMPORAL', angulo: 'Um modelo por post e pra quem ele serve', tema: 'Trucker ou aba curva', tese: 'Cada modelo tem um uso: o modelo certo é o que a pessoa vai usar de novo.', gancho: 'Trucker ou aba curva? Depende do que você vai fazer com ele.', descricao: 'Tela dividida: trucker x aba curva. Pra quem serve cada um, quando usar (evento ao ar livre x uniforme) e a foto de cada. Formato diferente do Produto de quinta.', refs: '', obs: '' },
};

const DIA_MS = 86400000;
function utc(iso) { return Date.parse(iso + 'T12:00:00Z'); }
/** Semana A ou B de uma data, contando a partir da âncora (vale pra qualquer mês, pra frente e pra trás). */
function semanaDe(iso) {
  const d = utc(iso), dowSeg = (new Date(d).getUTCDay() + 6) % 7; // 0 = segunda
  const semanas = Math.round((d - dowSeg * DIA_MS - utc(ANCORA)) / DIA_MS / 7);
  return ((semanas % 2) + 2) % 2 === 0 ? 'A' : 'B';
}
/** O que a matriz pede num dia: {semana, tipo (ou null se em aberto), opcoes (quando em aberto)}. */
function tipoDoDia(iso) {
  const semana = semanaDe(iso);
  const dowSeg = (new Date(utc(iso)).getUTCDay() + 6) % 7;
  const v = SEMANAS[semana][dowSeg];
  return Array.isArray(v) ? { semana, tipo: null, opcoes: v.slice() } : { semana, tipo: v, opcoes: null };
}
/** Saneia o que vem do navegador. Tipo só se for um tipo conhecido; status só da lista. */
function limpa(m, anterior) {
  if (!m || typeof m !== 'object') return null;
  const out = Object.assign({}, anterior || {});
  for (const k of CAMPOS) {
    if (!(k in m)) continue;
    let v = String(m[k] == null ? '' : m[k]).replace(/[<>]/g, '').trim().slice(0, k === 'descricao' || k === 'refs' ? 4000 : 1500);
    if (k === 'tipo' && v && !TIPOS[v]) v = '';
    if (k === 'status' && !STATUS.includes(v)) v = 'Não iniciado';
    out[k] = v;
  }
  if (!out.status) out.status = 'Não iniciado';
  // preencheu tudo que é obrigatório e ainda estava "Não iniciado": o briefing está criado
  if (out.status === 'Não iniciado' && OBRIGATORIOS.every(k => out[k])) out.status = 'Briefing criado';
  return out;
}
/** Card novo da matriz pra um dia (com o conteúdo pronto da planilha, se houver). */
function novoParaDia(iso) {
  const t = tipoDoDia(iso);
  const seed = SEED[iso];
  const base = { tipo: t.tipo || '', status: 'Não iniciado' };
  return limpa(seed ? Object.assign(base, seed) : base);
}

// Explicação de cada campo e de cada valor, pro botão (i) do painel e do documento da copy.
// Fica aqui, junto das regras, pra existir num lugar só.
const GLOSSARIO = {
  campos: {
    tipo: { tit: 'Tipo de conteúdo', txt: 'É o papel que o post cumpre na semana. A SeuBoné tem 10 tipos (Case, Educação, Prova, Produto, Hype, Demanda, Fábrica, Oferta direta, Autoridade e Sazonal) e cada dia já tem o seu, pela rotação A/B. O tipo define o objetivo, a etapa do funil, a emoção, o CTA e as métricas; por isso esses campos já vêm prontos e não se mexe neles.' },
    semana: { tit: 'Semana A e semana B', txt: 'A matriz roda em ciclos de 2 semanas, contados a partir de 28/09/2026. Na semana A a terça é Educação. Na semana B a terça vira um slot em aberto (Oferta direta, Autoridade ou Sazonal) e o domingo pode ser Fábrica ou Produto. O resto é igual nas duas.' },
    slotAberto: { tit: 'Slot em aberto', txt: 'Dia em que a rotação deixa escolher entre alguns tipos. Oferta direta quando tem motivo real pra pedir orçamento agora; Autoridade quando é hora de mostrar o tamanho e a experiência da SeuBoné; Sazonal quando tem uma data do calendário chegando.' },
    gm: { tit: 'GM: grande marca na capa', txt: 'A cada 3 dias (2 sem, 1 com) um post da SeuBoné precisa ter uma marca conhecida na capa, porque marca conhecida faz a pessoa parar de rolar. A estrela no calendário mostra o dia que pede GM.' },
    progresso: { tit: 'Campos preenchidos', txt: 'Quantos dos 8 campos obrigatórios estão preenchidos: formato, ângulo, pauta quente, tema, tese, gancho, descrição e quem faz. Quando chega em 8, o status muda sozinho pra Briefing criado.' },
    formato: { tit: 'Formato', txt: 'É o jeito como a peça é montada, e não só o tipo de post do Instagram. Exemplos: "Carrossel storytelling (pedido → produção → entrega)", "Número gigante", "POV com o boné na mão". As sugestões são os formatos que funcionam pra este tipo. Regra da rotação: o mesmo formato não repete no mesmo tipo em semanas seguidas (o painel avisa).' },
    angulo: { tit: 'Ângulo', txt: 'É o recorte, o ponto de vista pelo qual o assunto é contado. O mesmo case pode ser contado pelo problema que o boné resolveu, pelo jeito que foi usado ou pelo resultado que deu. Escolher o ângulo é decidir o que a peça vai destacar. As sugestões são os ângulos que servem pra este tipo.' },
    pautaQuente: { tit: 'Pauta quente', txt: 'O assunto do momento que ancora a peça: um evento, notícia, data ou trend que o público já está vendo (ex.: Rock in Rio 2026). É o que dá motivo pra peça sair agora e não em qualquer semana. Se não tiver, escreva ATEMPORAL.' },
    tema: { tit: 'Tema', txt: 'O recorte específico desta peça, numa frase curta. Ex.: "Os brindes de cabeça do Rock in Rio 2026". O tema vira o nome do card no calendário, então escreva de um jeito que dê pra reconhecer o post batendo o olho.' },
    tese: { tit: 'Tese em uma frase', txt: 'A opinião da SeuBoné sobre o tema: o que a marca defende, e não a descrição do post. Ex.: "Boné com marca é produto que as pessoas pagam pra usar, não só brinde." Sem tese a peça só informa; com tese ela posiciona a marca.' },
    gancho: { tit: 'Gancho', txt: 'A primeira frase ou imagem, a que faz a pessoa parar de rolar o feed. Precisa ser entendida em 1,5 segundo e bater numa dor ou num desejo concreto. Ex.: "No Rock in Rio, o acessório mais vendido não foi camiseta."' },
    descricao: { tit: 'Descrição (o que fazer)', txt: 'O que produzir, em 2 ou 3 linhas: a cena, a estrutura da peça (slides ou cortes) e quem aparece. É o que o Samuca e a edição leem pra fazer sem precisar voltar perguntando.' },
    refs: { tit: 'Refs visuais e inserts', txt: 'Links de referência: posts parecidos, fotos e vídeos da fábrica, matérias sobre a pauta. Opcional, mas economiza ida e volta com a produção.' },
    obs: { tit: 'Observações', txt: 'O que precisa ser confirmado antes de gravar ou publicar: número de cliente, autorização de marca, prazo. Opcional.' },
    responsavel: { tit: 'Quem faz', txt: 'A pessoa que toca a peça a partir daqui. Conta como um dos 8 campos do progresso.' },
    status: { tit: 'Status da matriz', txt: 'Em que pé a peça está dentro da matriz. É separado do status do ClickUp: quando o card ganha task, o andamento passa a ser acompanhado por lá.' },
    pede: { tit: 'O que o tipo pede', txt: 'Estes campos saem do tipo de conteúdo e são iguais pra todo post desse tipo. Não se preenchem: servem de guia na hora de escrever a peça.' },
    objetivo: { tit: 'Objetivo', txt: 'O que o post precisa fazer pela marca. São 3: Atrair (gente nova), Provar (confiança pra quem já considera) e Converter (pedido agora).' },
    funil: { tit: 'Etapa do funil', txt: 'Em que ponto da jornada de compra está a pessoa que vai ver o post. Topo: ainda nem pensa em comprar boné. Meio: já sabe que boné personalizado resolve e está vendo em quem confiar. Fundo: está perto de decidir.' },
    consciencia: { tit: 'Nível de consciência', txt: 'Quanto a pessoa já sabe do problema e da solução quando vê o post. A escala vem de Eugene Schwartz (Breakthrough Advertising, 1966) e ajuda a decidir o que a peça pode dar por sabido e o que precisa explicar. Vai de Inconsciente até Totalmente consciente.' },
    emocao: { tit: 'Emoção alvo', txt: 'A emoção que o post precisa provocar pra funcionar. É ela que puxa o gancho e o tom da peça.' },
    cta: { tit: 'CTA (chamada pra ação)', txt: 'O que a pessoa deve fazer no fim do post. Um CTA por post e sempre o do tipo, porque é esse movimento que a métrica do tipo mede.' },
    metrica1: { tit: 'Métrica principal', txt: 'O número que diz se o post cumpriu o objetivo. É o primeiro a olhar no relatório.' },
    metrica2: { tit: 'Métrica secundária', txt: 'Números de apoio, pra entender por que a principal foi bem ou mal.' },
  },
  valores: {
    objetivo: {
      'Atrair': 'Trazer gente nova, que ainda não conhece a SeuBoné. Mede em alcance, compartilhamento e seguidor novo.',
      'Provar': 'Mostrar que a SeuBoné entrega o que promete (case, número, depoimento) pra quem já está considerando.',
      'Converter': 'Fazer a pessoa pedir orçamento ou simular o logo agora.',
    },
    funil: {
      'Topo': 'A pessoa ainda não pensa em comprar boné. O post chama atenção, entretém ou ensina.',
      'Meio': 'A pessoa já sabe que boné personalizado resolve e está comparando quem faz. O post dá prova e confiança.',
      'Fundo': 'A pessoa está perto de decidir. O post pede a ação: orçamento, simulação.',
    },
    consciencia: {
      'Inconsciente': 'Não sabe que tem um problema nem que boné resolve alguma coisa. A peça precisa entreter ou despertar curiosidade antes de falar de venda.',
      'Consciente do problema': 'Sente a dor (brinde que ninguém usa, evento chegando) mas não conhece a solução. A peça nomeia a dor e ensina o caminho.',
      'Consciente da solução': 'Sabe que boné personalizado resolve, mas não sabe por que a SeuBoné. A peça mostra case e prova.',
      'Consciente do produto': 'Conhece a SeuBoné e os modelos, mas ainda não decidiu. A peça tira dúvida com detalhe, avaliação e comparação.',
      'Totalmente consciente': 'Já quer comprar. A peça só precisa do motivo pra ser agora e do caminho pro orçamento.',
    },
    emocao: {
      'Desejo': 'Vontade de ter aquilo: boné bonito, marca forte, o resultado que outra empresa conseguiu.',
      'Dor': 'Incômodo com um problema real: brinde que vai pro lixo, prazo apertado, arte que não borda.',
      'Curiosidade': 'Vontade de saber o resto: bastidor, número surpreendente, novidade.',
    },
    status: {
      'Não iniciado': 'Ainda falta preencher campo obrigatório.',
      'Briefing criado': 'Os 8 campos estão preenchidos (o painel muda pra cá sozinho). Pronto pra produzir.',
      'Em produção': 'Alguém está fazendo a arte ou o vídeo.',
      'Em aprovação': 'Pronto, esperando o ok.',
      'Aprovado': 'Liberado pra sair no dia.',
      'Postado': 'Já foi ao ar (marcar postado no card faz isso).',
    },
  },
};

module.exports = { TIPOS, SEMANAS, ANCORA, STATUS, CAMPOS, OBRIGATORIOS, REGRAS, CHECKLIST, SEED, GLOSSARIO, semanaDe, tipoDoDia, limpa, novoParaDia };
