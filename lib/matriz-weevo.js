// v3.91: matriz de conteúdo do feed da Weevo, no mesmo modelo da SeuBoné (lib/matriz-seubone.js).
// Fonte: o artifact "Matriz Weevo" que o Zion mandou em 30/09/2026 (Weevo · matriz de conteúdo do feed · out/2026):
// duas trilhas que não se misturam. A trilha 1 (hacks e virais) fica FORA da matriz: 4 por dia de segunda a sexta e
// 2 no sábado e no domingo. A matriz é a trilha 2: um post por dia, tipo fixo pelo dia e formato livre (os marcados
// como quadro já são aprovados, mas são sugestão). Ciclo de 2 semanas; a semana A é a de 01/10/2026 (resposta do
// Zion: "começa dia 01"), então a âncora é a segunda 28/09 e a matriz vale de 01/10 em diante.
'use strict';
const baseMatriz = require('./matriz-base.js');

// Tipos de conteúdo. O que é "do tipo" (objetivo, funil, CTA, quem produz) a copywriter não mexe.
const TIPOS = {
  'Posicionamento': {
    objetivo: 'Crescer', funil: 'Topo', cta: 'Siga o perfil',
    quando: 'Segunda (e terça na B, se a pauta pedir)', oQueE: 'Opinião da marca sobre pauta quente ou erro comum do dono de PME com IA.',
    formatos: ['Tá fazendo errado', 'Talking head de opinião', 'Giro de pauta da semana', 'Carrossel de tese', 'Quadro branco', 'Tela dividida (situação x situação)', 'Corte de podcast'],
    quadros: ['Tá fazendo errado'],
    formatosTxt: {
      'Tá fazendo errado': 'Um erro que a Weevo viu essa semana em empresa real e o que fazer no lugar. Ex.: "Contratou o ChatGPT pro time inteiro e ninguém sabe o que pedir pra ele."',
      'Talking head de opinião': 'Raí ou Igor falando pra câmera, 30 a 60 s, uma tese só, sem tutorial. Ex.: "IA não é projeto de TI, é projeto de gestão."',
      'Giro de pauta da semana': 'Uma notícia de IA da semana e o que ela muda (ou não) pra quem tem 5 a 50 funcionários. Ex.: "A Meta começou a cobrar pelo robô do WhatsApp. Serve pra você?"',
      'Carrossel de tese': 'Capa com a tese, slides com o porquê, último slide com o posicionamento e CTA. Ex.: "IA não conserta empresa desorganizada."',
      'Quadro branco': 'Raí desenhando a lógica no quadro enquanto explica. Bom pra tese que precisa de esquema, tipo o fluxo de uma tarefa antes e depois da IA.',
      'Tela dividida (situação x situação)': 'Lado a lado: a mesma tarefa feita do jeito errado e do jeito certo. Ex.: pedido genérico pra IA x pedido com contexto da empresa.',
      'Corte de podcast': 'Trecho de 30 a 90 s de conversa com empresário, com a opinião forte no gancho e legenda grande.',
    },
    angulos: ['Querer que a IA compense empresa desorganizada', 'Dono que delega pra IA o que nem ele sabe explicar', 'Ferramenta comprada antes da tarefa definida', 'IA tratada como projeto de TI e não de gestão', 'Novidade da semana e o que ela muda (ou não) pra quem tem 5 a 50 funcionários'],
    quem: 'Time, com fala do Raí ou do Igor quando for tese forte',
  },
  'Indicação': {
    objetivo: 'Crescer', funil: 'Meio', cta: 'Siga o perfil',
    quando: 'Terça (semana A)', oQueE: 'Dizer o que serve e o que não serve pro dono de PME: ferramenta, plano, novidade, prática.',
    formatos: ['Serve ou não serve', 'Tier list', 'Comparativo A x B', 'Use isso pra isso', 'Ranking', 'Review da novidade da semana', 'Grátis x pago'],
    quadros: ['Serve ou não serve'],
    formatosTxt: {
      'Serve ou não serve': 'Uma ferramenta ou novidade, o veredito pra PME e o motivo em uma frase. Ex.: "Meta One a R$ 59: serve pra quem responde mais de 30 conversas por dia. Pra menos, não."',
      'Tier list': 'Várias ferramentas pra uma mesma tarefa ranqueadas em faixas (usa, testa, ignora). Ex.: "IAs pra atendimento no WhatsApp, do que roda sozinho ao que precisa de dev."',
      'Comparativo A x B': 'Duas opções lado a lado com 3 critérios que o dono entende: preço, esforço pra colocar de pé, resultado. Ex.: ChatGPT x Claude pra escrever proposta comercial.',
      'Use isso pra isso': 'Uma ferramenta, um uso só, sem enrolação. Ex.: "Use o Gemini no Sheets pra fechar o relatório de vendas da semana."',
      'Ranking': 'Top 3 ou top 5 com critério declarado no primeiro slide. Ex.: "As 3 tarefas que mais valem colocar IA numa loja."',
      'Review da novidade da semana': 'Testou de verdade e mostra o resultado: o que prometeu, o que entregou, pra quem vale.',
      'Grátis x pago': 'Quando o plano grátis basta e o que muda quando paga. Ex.: "ChatGPT grátis segura até onde na sua empresa?"',
    },
    angulos: ['Ferramenta nova julgada pelo tamanho da empresa', 'Plano pago x grátis: quando vale', 'O que dá pra fazer sem dev e o que exige dev', 'Três ferramentas pra uma mesma tarefa, qual escolher', 'O que a Weevo usa e o que abandonou'],
    quem: 'Time; o radar de pautas das últimas 72 h alimenta esse slot',
  },
  'Dor + solução': {
    objetivo: 'Crescer', funil: 'Meio', cta: 'Siga o perfil',
    quando: 'Quarta', oQueE: 'Bate numa dor concreta do dono de PME e mostra a solução com IA, direto, no mesmo post.',
    formatos: ['O que eu faria no seu lugar', 'Empresário pergunta, a Weevo responde', 'Antes e depois de um processo', 'Mapa do gargalo', 'Storytelling de empresa com resultado', 'Vídeo médio de análise'],
    quadros: ['O que eu faria no seu lugar'],
    formatosTxt: {
      'O que eu faria no seu lugar': 'Raí pega uma empresa real ou típica, nomeia a dor e diz o que faria primeiro, com roteiro fechado. Ex.: "Loja com 3 vendedores e o dono respondendo o WhatsApp de noite: eu começaria por aqui."',
      'Empresário pergunta, a Weevo responde': 'Print ou áudio de uma dúvida real (com autorização) e a resposta em vídeo curto ou carrossel.',
      'Antes e depois de um processo': 'Como a rotina era e como ficou com IA, em dois blocos. Ex.: fechamento do mês em 5 dias x em 1 tarde.',
      'Mapa do gargalo': 'Desenho do fluxo da empresa apontando onde trava e onde a IA entra. Bom em carrossel ou quadro branco.',
      'Storytelling de empresa com resultado': 'Caso contado em 3 atos: a dor, o que fez, o que mudou. Número só confirmado.',
      'Vídeo médio de análise': '2 a 4 min analisando uma situação de empresa passo a passo, com a solução montada na tela.',
    },
    angulos: ['O líder como gargalo: o que tirar da mão dele primeiro', 'Atendimento no WhatsApp que depende de uma pessoa', 'Financeiro no manual e fechamento atrasado', 'Conteúdo que só sai quando o dono grava', 'Comercial sem follow-up'],
    quem: 'Raí, com roteiro fechado',
  },
  'Prova social': {
    objetivo: 'Converter', funil: 'Fundo', cta: 'Palavra-chave no ManyChat ou Garanta sua vaga',
    quando: 'Quinta', oQueE: 'Quem já fez, feedback, número, resultado.',
    formatos: ['Quem já fez', 'Prova real', 'Feedback escrito', 'Print de conversa', 'Placar de números', 'Pilha de depoimentos', 'Repost de story de aluno', 'Antes e depois'],
    quadros: ['Quem já fez', 'Prova real'],
    formatosTxt: {
      'Quem já fez': 'Aluno do workshop em vídeo, 30 a 60 s: o que travava, o que implementou, o que mudou. Sem roteiro, só três perguntas.',
      'Prova real': 'Número da própria operação da Weevo ou do Grupo SB, mostrado na tela. Ex.: quantas conversas o SB Conversas respondeu sem humano essa semana (confirmar).',
      'Feedback escrito': 'Card com o texto do aluno, nome e empresa (com autorização), foto ou logo ao lado.',
      'Print de conversa': 'Print real de WhatsApp ou DM com o feedback, dados sensíveis borrados.',
      'Placar de números': '3 números lado a lado: alunos, empresas, horas liberadas. Só com confirmação.',
      'Pilha de depoimentos': 'Vários feedbacks curtos empilhados num carrossel, um por slide.',
      'Repost de story de aluno': 'Story do aluno aplicando o que aprendeu, repostado com contexto em uma linha.',
      'Antes e depois': 'O processo do aluno antes do workshop e depois, com o que ele mesmo disse.',
    },
    angulos: ['Antes e depois do workshop', 'Tempo liberado do dono por semana (confirmar o número)', 'O que a pessoa implementou na semana seguinte', 'Quem veio do convite e o que levou', 'Número da própria operação da Weevo'],
    quem: 'Time; a base de depoimentos já existe, só entra com autorização',
  },
  'Oferta': {
    objetivo: 'Converter', funil: 'Fundo', cta: 'Garanta sua vaga',
    quando: 'Sexta (e domingo na B, opcional)', oQueE: 'Chamada direta pro workshop, pra live ou pro convite. Sem preço e sem vagas no criativo.',
    formatos: ['Fala direta (Raí ou Igor)', 'Anti-anúncio', 'Teaser', 'Chat "como é participar"', 'Callout com setas', 'Ugly post', 'Ancoragem (com x sem)'],
    quadros: [],
    formatosTxt: {
      'Fala direta (Raí ou Igor)': 'Pra câmera, sem edição pesada: o que é, pra quem é, por que agora, CTA. Ex.: "Se sua empresa para quando você some 15 dias, esse workshop é pra você."',
      'Anti-anúncio': 'Começa dizendo pra quem NÃO é. Ex.: "Se você quer aprender IA pra postar no Instagram, não vem. Isso aqui é pra tirar tarefa da sua mão."',
      'Teaser': '15 s mostrando o que vai acontecer no workshop ou na live, sem explicar tudo, com data.',
      'Chat "como é participar"': 'Simulação de conversa de WhatsApp mostrando o passo a passo de se inscrever e o que a pessoa recebe.',
      'Callout com setas': 'Estático ou carrossel com setas apontando o que a pessoa leva: solução montada, método, empresários ensinando empresários.',
      'Ugly post': 'Print cru, foto de celular ou texto no bloco de notas com a chamada. Funciona por parecer bastidor.',
      'Ancoragem (com x sem)': 'Compara o custo de continuar como está com o que muda depois do workshop, sem citar preço. Ex.: horas do dono por semana x uma tarde.',
    },
    angulos: ['Workshop presencial: gestão com IA, sua empresa menos dependente de você', 'Live nacional: o que vai acontecer e por que agora', 'Convite exclusivo: "valor exclusivo" e "benefício", nunca "desconto"', 'Empresários ensinando empresários (Grupo SB)', 'Prazo de inscrição como urgência, não número de vagas'],
    nota: 'Os três destinos (workshop local, live e convite) ficam no card. A weekly decide qual entra na sexta, conforme o calendário de funil.',
    quem: 'Time; o destino (workshop local, live ou convite) é escolhido na weekly',
  },
  'Técnico': {
    objetivo: 'Crescer', funil: 'Meio', cta: 'Siga o perfil',
    quando: 'Sábado', oQueE: 'Ensinar do ponto A ao B. 70% em vídeo.',
    formatos: ['Hackzinho estendido', 'Vídeo médio tutorial', 'Tela gravada', 'Carrossel passo a passo', 'FAQ', 'Quadro branco'],
    quadros: ['Hackzinho estendido'],
    formatosTxt: {
      'Hackzinho estendido': 'O hack da semana que mais rodou, agora com contexto: por que funciona, onde falha, como adaptar pro seu negócio. 1 a 2 min.',
      'Vídeo médio tutorial': '2 a 4 min fazendo a tarefa inteira na tela, do zero ao resultado. Ex.: montar o relatório semanal de vendas com IA.',
      'Tela gravada': 'Só a tela, com narração, mostrando o clique a clique. Bom pra ferramenta nova.',
      'Carrossel passo a passo': 'Um passo por slide, print de cada etapa, último slide com o resultado.',
      'FAQ': 'As 3 perguntas que mais chegam nos comentários sobre um tema, respondidas em sequência.',
      'Quadro branco': 'A lógica da automação desenhada antes de mostrar a ferramenta: entrada, o que a IA faz, saída.',
    },
    angulos: ['A primeira tarefa da empresa pra colocar IA', 'Prompt com contexto: o que dar pra IA antes de pedir', 'Automação simples de atendimento', 'Relatório semanal com IA', 'Do áudio à proposta comercial'],
    quem: 'Godoy ou time',
  },
  'Bastidor Grupo SB': {
    objetivo: 'Converter', funil: 'Fundo', cta: 'Siga o perfil ou palavra-chave no ManyChat',
    quando: 'Domingo', oQueE: 'Como as empresas do grupo usam IA de verdade. Empresário ensinando empresário.',
    formatos: ['Vlog de bastidor', 'Tela mostrando o sistema em uso', 'Fala do Igor', 'Número da operação', '"Como a gente faz" em 60 s', 'Erro que o grupo cometeu e corrigiu'],
    quadros: [],
    formatosTxt: {
      'Vlog de bastidor': 'Um dia ou uma rotina do grupo filmada no celular, mostrando a IA no meio do trabalho real.',
      'Tela mostrando o sistema em uso': 'Gravação do SB Conversas ou de outra automação rodando, com narração do que está acontecendo.',
      'Fala do Igor': 'Igor contando uma decisão do grupo sobre IA: o que testou, o que manteve, o que jogou fora.',
      'Número da operação': 'Um número real do grupo na tela e o que ele significa. Ex.: conversas respondidas sem humano no mês (confirmar).',
      '"Como a gente faz" em 60 s': 'Uma rotina do grupo explicada em um minuto, do problema à solução que roda hoje.',
      'Erro que o grupo cometeu e corrigiu': 'O que deu errado numa implementação de IA no grupo e o que mudou depois. Humaniza e prova.',
    },
    angulos: ['SeuBoné, Carbone e Onevo usando IA no dia a dia', 'SB Conversas: o atendimento que roda sem o dono', 'O que rodou e o que não rodou no grupo', 'Quanto tempo o time ganhou em uma rotina (confirmar)', 'O que o grupo faria diferente se começasse hoje'],
    quem: 'Time, com acesso às operações do grupo',
  },
};

// Ciclo de 2 semanas. Índice 0 = segunda ... 6 = domingo. String = tipo fixo; array = slot EM ABERTO.
// Semana A (padrão): 4 Crescer e 3 Converter. Semana B (regra 8): a terça vira slot em aberto (Posicionamento
// primeiro: "e terça na B, se a pauta pedir") e o domingo alterna Bastidor com Oferta ("e domingo na B, opcional").
const SEMANAS = {
  A: ['Posicionamento', 'Indicação', 'Dor + solução', 'Prova social', 'Oferta', 'Técnico', 'Bastidor Grupo SB'],
  B: ['Posicionamento', ['Posicionamento', 'Indicação', 'Dor + solução', 'Prova social', 'Oferta', 'Técnico', 'Bastidor Grupo SB'], 'Dor + solução', 'Prova social', 'Oferta', 'Técnico', ['Oferta', 'Bastidor Grupo SB']],
};
const ANCORA = '2026-09-28';   // segunda-feira de uma semana A (a de 01/10/2026)
const INICIO = '2026-10-01';   // a matriz da Weevo vale daqui em diante

const STATUS = ['Não iniciado', 'Briefing criado', 'Em produção', 'Em aprovação', 'Aprovado', 'Postado'];
const CAMPOS = ['tipo', 'formato', 'pautaQuente', 'angulo', 'tema', 'tese', 'gancho', 'descricao', 'refs', 'status', 'obs'];
const OBRIGATORIOS = ['formato', 'pautaQuente', 'angulo', 'tema', 'tese', 'gancho', 'descricao'];
const CONTEUDO = ['formato', 'pautaQuente', 'angulo', 'tema', 'tese', 'gancho', 'descricao', 'refs', 'obs'];

// As 10 regras da matriz ("o que vale pra todo post"), como estão no artifact
const REGRAS = [
  'Todo post declara a etapa do funil (topo, meio ou fundo) e segue gancho, corpo, CTA. Topo bate na dor de quem não sabe que tem problema, meio bate no problema, fundo converte.',
  'Gancho só entra se bate em dor concreta e dá pra entender o problema e a solução. Curiosidade vazia é reprovada, mesmo que abra bem.',
  'Um insight e um CTA por post. Crescer pede "siga o perfil". Converter capta no ManyChat (telefone e e-mail) ou manda pro workshop com "Garanta sua vaga".',
  'Preço e número de vagas nunca aparecem no criativo. Nos posts de Converter, ancoragem, autoridade do Grupo SB e urgência aparecem sempre.',
  'Carrossel: texto até 35% da tela, blocos de até 4 linhas. Técnico é 70% em vídeo.',
  'Número, depoimento e nome de empresa só com confirmação e autorização. Nada inventado.',
  'Posicionamento vai junto em quase todo post, inclusive nos técnicos. Pauta quente sempre que houver.',
  'As semanas A e B se alternam. Na B, a terça vira slot em aberto e o domingo alterna Bastidor com Oferta. O mesmo formato não repete no mesmo tipo em duas semanas seguidas.',
  'Hack não é vídeo de conteúdo: sem passo a passo longo, sem moral no fim. No Hackzinho, o prompt aparece escrito em tela cheia, com pausa pra copiar.',
  'Vocabulário do dono de PME. Sem palavra em inglês nem termo de marketing que ele não usa.',
];
// Conferência antes de entregar: tirada direto das regras acima (1, 2, 3, 4, 6 e 10)
const CHECKLIST = [
  'Etapa do funil declarada e a peça segue gancho, corpo, CTA',
  'Gancho bate em dor concreta (nada de curiosidade vazia)',
  'Um insight e um CTA, o do tipo',
  'Sem preço e sem número de vagas no criativo',
  'Número, depoimento e nome de empresa confirmados e autorizados',
  'Vocabulário do dono de PME: sem inglês nem termo de marketing',
];
// Trilha 1, fora da matriz: só a regra (a matriz não escolhe esses temas)
const HACKS = 'Hacks e virais (trilha 1, fora da matriz): 4 por dia de segunda a sexta e 2 no sábado e no domingo. Tudo Crescer, CTA "siga o perfil". Hackzinho (Godoy), na mão x com IA, trend, react, corte de podcast, meme com pauta quente. A matriz não escolhe esses temas, só dá a regra. Com a matriz, dá 3 a 5 posts por dia (31 por semana).';

const GLOSSARIO = {
  campos: {
    tipo: { tit: 'Tipo de conteúdo', txt: 'É o papel que o post cumpre na semana. A Weevo tem 7 tipos (Posicionamento, Indicação, Dor + solução, Prova social, Oferta, Técnico e Bastidor Grupo SB) e cada dia já tem o seu, pela rotação A/B. O tipo define o objetivo, a etapa do funil, o CTA e quem produz; por isso esses campos já vêm prontos e não se mexe neles.' },
    semana: { tit: 'Semana A e semana B', txt: 'A matriz roda em ciclos de 2 semanas; a semana A é a de 01/10/2026. Na B, a terça vira slot em aberto (Posicionamento, se a pauta pedir, ou o tipo que a semana precisar) e o domingo alterna Bastidor com Oferta. O resto é igual nas duas.' },
    slotAberto: { tit: 'Slot em aberto', txt: 'Dia em que a rotação deixa escolher o tipo. Na terça da semana B, Posicionamento quando tem pauta quente; senão, o tipo que a semana mais precisa. No domingo da B, Oferta ou Bastidor Grupo SB.' },
    progresso: { tit: 'Campos preenchidos', txt: 'Quantos dos 7 campos obrigatórios estão preenchidos: formato, ângulo, pauta quente, tema, tese, gancho e descrição. Quando chega em 7, o status muda sozinho pra Briefing criado.' },
    formato: { tit: 'Formato', txt: 'É o jeito como a peça é montada. O formato é livre: as sugestões são opções que funcionam pra este tipo, e as marcadas como QUADRO já são aprovadas (mas continuam sendo sugestão, não obrigação). Regra da rotação: o mesmo formato não repete no mesmo tipo em semanas seguidas (o painel avisa).' },
    angulo: { tit: 'Ângulo', txt: 'É o recorte, o ponto de vista pelo qual o assunto é contado. O mesmo assunto pode ser contado pela dor, pela ferramenta ou pelo resultado. As sugestões são os ângulos que servem pra este tipo.' },
    pautaQuente: { tit: 'Pauta quente', txt: 'O assunto do momento que ancora a peça: novidade de IA, notícia, data ou trend que o dono de PME já está vendo. Regra 7: pauta quente sempre que houver. Se não tiver, escreva ATEMPORAL.' },
    tema: { tit: 'Tema', txt: 'O recorte específico desta peça, numa frase curta. O tema vira o nome do card no calendário, então escreva de um jeito que dê pra reconhecer o post batendo o olho.' },
    tese: { tit: 'Tese em uma frase', txt: 'A opinião da Weevo sobre o tema: o que a marca defende, e não a descrição do post. Ex.: "IA não conserta empresa desorganizada." Regra 7: o posicionamento vai junto em quase todo post, inclusive nos técnicos.' },
    gancho: { tit: 'Gancho', txt: 'A primeira frase ou imagem, a que faz o dono de PME parar de rolar o feed. Regra 2: só entra se bate em dor concreta e dá pra entender o problema e a solução; curiosidade vazia é reprovada.' },
    descricao: { tit: 'Descrição (o que fazer)', txt: 'O que produzir, em 2 ou 3 linhas: a cena, a estrutura da peça (slides ou cortes) e quem aparece. É o que o time lê pra fazer sem precisar voltar perguntando.' },
    refs: { tit: 'Refs visuais e inserts', txt: 'Links de referência: posts parecidos, telas, prints, matérias sobre a pauta. Opcional, mas economiza ida e volta com a produção.' },
    obs: { tit: 'Observações', txt: 'O que precisa ser confirmado antes de gravar ou publicar: número, autorização de aluno ou empresa, destino da oferta. Opcional.' },
    status: { tit: 'Status da matriz', txt: 'Em que pé a peça está dentro da matriz. Quando o card ganha a task de produção, o andamento passa a ser acompanhado por lá.' },
    pede: { tit: 'O que o tipo pede', txt: 'Estes campos saem do tipo de conteúdo e são iguais pra todo post desse tipo. Não se preenchem: servem de guia na hora de escrever a peça.' },
    objetivo: { tit: 'Objetivo', txt: 'O que o post precisa fazer pela marca. Na Weevo são 2: Crescer (seguidor e alcance, CTA "siga o perfil") e Converter (captar no ManyChat ou levar pro workshop). A semana padrão tem 4 dias de Crescer e 3 de Converter.' },
    funil: { tit: 'Etapa do funil', txt: 'Regra 1: todo post declara a etapa. Topo bate na dor de quem não sabe que tem problema, meio bate no problema, fundo converte.' },
    cta: { tit: 'CTA (chamada pra ação)', txt: 'O que a pessoa deve fazer no fim do post. Um CTA por post e sempre o do tipo (regra 3).' },
    quem: { tit: 'Quem produz', txt: 'Quem costuma fazer este tipo de peça. A pessoa responsável pela task de produção é escolhida quando a copy aprovada vira task no MKT Hub.' },
    nota: { tit: 'Observação do tipo', txt: 'Uma regra a mais que vale só pra este tipo.' },
    hacks: { tit: 'Hacks e virais', txt: HACKS },
  },
  sugestoes: { formato: {}, angulo: {} },
  valores: {
    objetivo: {
      'Crescer': 'Trazer gente nova e fazer seguir o perfil. CTA "siga o perfil".',
      'Converter': 'Captar no ManyChat (telefone e e-mail) ou levar pro workshop com "Garanta sua vaga". Sem preço e sem vagas no criativo.',
    },
    funil: {
      'Topo': 'Bate na dor de quem ainda não sabe que tem um problema.',
      'Meio': 'Bate no problema: a pessoa já sente e quer entender o que fazer.',
      'Fundo': 'Converte: a pessoa está perto de decidir.',
    },
    status: {
      'Não iniciado': 'Ainda falta preencher campo obrigatório.',
      'Briefing criado': 'Os 7 campos estão preenchidos (o painel muda pra cá sozinho). Pronto pra produzir.',
      'Em produção': 'Alguém está fazendo a arte ou o vídeo.',
      'Em aprovação': 'Pronto, esperando o ok.',
      'Aprovado': 'Liberado pra sair no dia.',
      'Postado': 'Já foi ao ar (marcar postado no card faz isso).',
    },
  },
};

const base = baseMatriz({ TIPOS, SEMANAS, ANCORA, INICIO, STATUS, CAMPOS, OBRIGATORIOS, CONTEUDO });
module.exports = Object.assign({ TIPOS, SEMANAS, ANCORA, INICIO, STATUS, CAMPOS, OBRIGATORIOS, CONTEUDO, REGRAS, CHECKLIST, HACKS, GLOSSARIO }, base);
