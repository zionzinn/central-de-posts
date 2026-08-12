// Gera data/data.json a partir do retrato da planilha (julho/2026) + cache de nomes/status do ClickUp.
// Rode com: node scripts/seed.mjs   (só é preciso rodar de novo se quiser resetar os dados)
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseTab, slotKey } = require('../lib/sheet-parser.js');

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const OUT = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'data.json')
  : path.join(__dirname, '..', 'data', 'data.json');

// ---------------------------------------------------------------------------
// Retrato do CSV das 4 abas (capturado em 13/07/2026 via export público da planilha)
// ---------------------------------------------------------------------------
const CSV_ONEVO = `"JULHO ONEVO ENERGIA DATA SEMANA 1","LINK ","DRIVE ","DIA DA SEMANA ","APROVADO PARA EXECUÇÃO? ","FORMATO ","OBS ","POSTADO? ","","","","","JULHO ONEVO INVESTIMENTOS DATA SEMANA 1","LINK ","DRIVE ","DIA DA SEMANA ","APROVADO PARA EXECUÇÃO? ","FORMATO ","OBS ","POSTADO? "
"07/07/2026","https://app.clickup.com/t/9013450208/86aj4kq6m","https://drive.google.com/drive/u/2/folders/1OSVofuzh7fdbW1V_LZE7KHZ2gYBT0YF9","TERÇA","","","","SIM","","","","","07/07/2026","https://app.clickup.com/t/9013450208/86aj11ay6","https://drive.google.com/drive/u/2/folders/1XfXTeR9yBGQhZZ-U-i1NjdsAV6gJK40z","TERÇA","","","","SIM"
"08/07/2026","https://app.clickup.com/t/9013450208/86ajce7tx","","QUARTA","","","","SIM","","","","","","","","QUARTA","","","",""
"09/07/2026","https://app.clickup.com/t/9013450208/86ajekdwu","","QUINTA","","","","SIM","","","","","","","","QUINTA","","","",""
"","","","SEXTA","","","","","","","","","10/07/2026","","","SEXTA","SIM","","",""
"","","","","","","","","","","","","11/07/2026","","","SÁBADO","","","",""
"13/07/2026","https://app.clickup.com/t/9013450208/86aj4kq6m","https://drive.google.com/drive/u/2/folders/1m4DZjCgH6iux2F4QzNCuD3FqodPSZ0LR","SEGUNDA","SIM","","","","","","","","13/07/2026","https://app.clickup.com/t/9013450208/86aje9mw7","https://drive.google.com/drive/u/2/folders/17f6jNdr_PBLf_b3k5yT1Vx1vcxIF6369","SEGUNDA","SIM","","",""
"","","","TERÇA","","","","","","","","","","","","TERÇA","","","",""
"15/07/2026","","","QUARTA","","","","","","","","","15/07/2026","https://app.clickup.com/t/9013450208/86aje9pwp","","QUARTA","SIM","","",""
"","","","QUINTA","","","","","","","","","","","","QUINTA","","","",""
"17/07/2026","https://app.clickup.com/t/9013450208/86aj4kq6m","https://drive.google.com/drive/u/2/folders/1MQ2W_ixOO_xt3AHoSOD2XGqkybVjyAgp","SEXTA","","","","","","","","","17/07/2026","https://app.clickup.com/t/9013450208/86aje9r5v","","SEXTA","","","",""
"20/07/2026","","","SEGUNDA","","","","","","","","","20/07/2026","https://app.clickup.com/t/9013450208/86aje9x5m","","SEGUNDA","","","",""
"","","","TERÇA","","","","","","","","","","","","TERÇA","","","",""
"22/07/2026","https://app.clickup.com/t/9013450208/86aj4j72j","https://drive.google.com/drive/u/2/folders/1l1qxY-WQoEvFkxDlMSIr6CWX4ontDFiN","QUARTA","","","","","","","","","22/07/2026","","","QUARTA","","","",""
"","","","QUINTA","","","","","","","","","","","","QUINTA","","","",""
"24/07/2026","","","SEXTA","","","","","","","","","24/07/2026","","","SEXTA","","","",""
"27/07/2026","https://app.clickup.com/t/9013450208/86aj4j72j","https://drive.google.com/drive/u/2/folders/1tMaFKSklUkdmHT02pGPVK7d2rgLi8EmX","SEGUNDA","","","","","","","","","27/07/2026","","","SEGUNDA","","","",""
"","","","TERÇA","","","","","","","","","","","","TERÇA","","","",""
"29/07/2026","https://app.clickup.com/t/9013450208/86aj4j72j","https://drive.google.com/drive/u/2/folders/1IwJOm-JN5Ht1uhgr2B4ZTI0oqPpKEQTS","QUARTA","","","","","","","","","29/07/2026","","","QUARTA","","","",""
"","","","QUINTA","","","","","","","","","","","","QUINTA","","","",""
"31/07/2026","https://app.clickup.com/t/9013450208/86aj4kq6m","https://drive.google.com/drive/u/2/folders/1ZkFZJuJ5CImVOYZ8CKbOeRSd1gEPqHhp","SEXTA","","","","","","","","","31/07/2026","","","SEXTA","","","",""`;

const CSV_SEUBONE = `"JULHO SEUBONÉ DATA SEMANA 1","LINK ","DRIVE ","DIA DA SEMANA ","APROVADO PARA EXECUÇÃO? ","FORMATO ","OBS ","GM ","POSTADO? ","","BANCO DE REUTILIZAÇÃO -> VÍDEOS LINK","DIRECIONAMENTO","RESPONSÁVEL"
"07/07/2026","https://app.clickup.com/t/9013450208/86ajaga3z","","TERÇA","SIM","carrossel","","não","SIM","","https://www.instagram.com/reels/DLDtmehKiGt/","REFAZER COM MAIS PERSONALIDADES E DINANIMSO","AUDIOVISUAL"
"08/07/2026","https://app.clickup.com/t/9013450208/86aje4cu2","https://www.instagram.com/reels/DEU2fZ5umdg/","QUARTA","SIM","reels","TROCAR TELA FINAL","não","SIM","","https://www.instagram.com/reels/DMnZEGQsu-x/","MUDAR FINAL","ZION, MALU"
"09/07/2026","","","QUINTA","","","","sim","FRACASSEI","","https://www.instagram.com/reels/DPRqw5BERj0/","MUDAR FINAL","ZION, MALU"
"10/07/2026","https://app.clickup.com/t/9013450208/86ajazdnn","","SEXTA","SIM","carrossel","","não","SIM","","https://www.instagram.com/reels/DPzeRyDEvl8/","REFAZER IGUAL","AUDIOVISUAL"
"11/07/2026","https://app.clickup.com/t/9013450208/86ah2rk7b","https://drive.google.com/drive/u/2/folders/1VkWJg4GgAAh_P15TFUIUWn66fvrwRpaw","SÁBADO","SIM","reels","","não","SIM","","https://www.instagram.com/reels/Cdobpa9gPi5/","MUDAR FINAL","ZION, MALU"
"12/07/2026","","","DOMINGO","SIM","carrossel","","sim","FRACASSEI","","https://www.instagram.com/reels/Cpij_k9ggsV/","MUDAR FINAL","ZION, MALU"
"","","","","","","","","","","https://www.instagram.com/reels/CrUABHVO92v/","MUDAR FINAL","ZION, MALU"
"13/07/2026","https://app.clickup.com/t/9013450208/86ajagav9","","SEGUNDA","SIM","carrossel","","não","","","https://www.instagram.com/reels/C5UN1jmsuwp/","MUDAR COMEÇO + FINAL","AUDIOVISUAL"
"14/07/2026","https://app.clickup.com/t/9013450208/86aj8hkue","","TERÇA","","reels","","não","","","https://www.instagram.com/reels/C8aa4zfvm-6/","MUDAR FINAL","ZION, MALU"
"15/07/2026","https://app.clickup.com/t/9013450208/86aj9gjwz","","QUARTA","","carrossel","","sim","","","https://www.instagram.com/reels/DB9a_aYvosc/","MUDAR FINAL","ZION, MALU"
"16/07/2026","https://app.clickup.com/t/9013450208/86ajawrmj","","QUINTA","","reels","","não","","","https://www.instagram.com/reels/DCfOsC-y5Xv/","MUDAR COMEÇO + FINAL","ZION, MALU"
"17/07/2026","https://app.clickup.com/t/9013450208/86ajafmpg","","SEXTA","","estático","","não","","","https://www.instagram.com/reels/DDNfQ2sSNch/","REFAZER IGUAL","MALU"
"18/07/2026","https://app.clickup.com/t/9013450208/86ajagcjn","","SÁBADO","","reels","","sim","","","","",""
"19/07/2026","https://app.clickup.com/t/9013450208/86ahz675j","","DOMINGO","","reels","","não","","","","",""
"","","","","","","","","MONTAR NOVOS POSTS","","","",""
"20/07/2026","https://app.clickup.com/t/9013450208/86aj9gp3j","","SEGUNDA","","","","não",""," ","","",""
"21/07/2026","","","TERÇA","","","","sim","","","","",""
"22/07/2026","https://app.clickup.com/t/9013450208/86ajc67qz","","QUARTA","","reels","","não","","","","",""
"23/07/2026","","","QUINTA","","","","não","","","","",""
"24/07/2026","","","SEXTA","","","","sim","","","","",""
"25/07/2026","","https://www.instagram.com/reels/DElDNbHvsp3/","SÁBADO","","reels","TROCAR TELA FINAL + ELEMENTOS AZUIS","não","","","","",""
"26/07/2026","","","DOMINGO","","","","não","","","","",""
"","","","","","","","","MONTAR NOVOS POSTS","","","",""
"27/07/2026","","https://www.instagram.com/reels/DFQwQR1JkK6/","SEGUNDA","","reels","TROCAR INICIAL + TELA FINAL","sim","","","","",""
"28/07/2026","","","TERÇA","","","","não","","","","",""
"29/07/2026","","","QUARTA","","","","não","","","","",""
"30/07/2026","","","QUINTA","","","","sim","","","","",""
"31/07/2026","","https://www.instagram.com/reels/DF8pi3iJYYy/","SEXTA","","reels","TROCAR TELA FINAL","não","","","","",""`;

const CSV_CARBONE = `"JULHO CARBONE EDUCAÇÃO DATA SEMANA 1","LINK¹ ","LINK² ","DRIVE ","DIA DA SEMANA ","APROVADO PARA EXECUÇÃO? ","FORMATO ","OBS ","POSTADO? ","","JULHO CARBONE CARBONE DATA SEMANA 1","LINK ","DRIVE ","DIA DA SEMANA ","APROVADO PARA EXECUÇÃO? ","FORMATO ","OBS ","POSTADO? "
"07/07/2026","","","","TERÇA","","","","","","07/07/2026","","","TERÇA","","","",""
"08/07/2026","","","","QUARTA","","","","","","08/07/2026","","","QUARTA","","","",""
"09/07/2026","","","","QUINTA","","","","","","09/07/2026","","","QUINTA","","","",""
"10/07/2026","","","","SEXTA","","","","","","10/07/2026","","","SEXTA","","","",""
"11/07/2026","","","","SÁBADO","","","","","","11/07/2026","","","SÁBADO","","","",""
"12/07/2026","","","","DOMINGO","","","","","","12/07/2026","","","DOMINGO","","","",""
"13/07/2026","https://app.clickup.com/t/9013450208/86ajcmm20","https://app.clickup.com/t/9013450208/86ajcmrw9","","SEGUNDA","SIM","","","","","13/07/2026","https://app.clickup.com/t/9013450208/86ajc5bzn","https://drive.google.com/drive/u/2/folders/17ExrD0eqZag2fou5IEoWgsFp9ePh8Vl6","SEGUNDA","SIM","","",""
"14/07/2026","https://app.clickup.com/t/9013450208/86aj7q8tz","https://app.clickup.com/t/9013450208/86ajfkk7y","","TERÇA","SIM","","","","","14/07/2026","https://app.clickup.com/t/9013450208/86ajfmkxq","","TERÇA","SIM","","",""
"15/07/2026","https://app.clickup.com/t/9013450208/86agr3kdz","https://app.clickup.com/t/9013450208/86ahqmkby","","QUARTA","SIM","","","","","15/07/2026","https://app.clickup.com/t/9013450208/86agr3kdz","https://drive.google.com/drive/u/2/folders/1_R_R-oPsdesACHuqKx1u-DVRcg6OoiyH","QUARTA","SIM","","",""
"16/07/2026","https://app.clickup.com/t/9013450208/86ahr6mwa","https://app.clickup.com/t/9013450208/86aj2tj3p","","QUINTA","SIM","","","","","16/07/2026","https://app.clickup.com/t/9013450208/86ahr6mwa","https://drive.google.com/drive/u/2/folders/1RZ7yxXeH3OxletRWjnHuec4bD-j22wsX","QUINTA","SIM","","",""
"17/07/2026","https://app.clickup.com/t/9013450208/86ahxaw10","https://app.clickup.com/t/86ahtyd4q","","SEXTA","SIM","","","","","17/07/2026","https://app.clickup.com/t/9013450208/86ahxaw10","https://drive.google.com/drive/u/2/folders/18nyV9LBEx3z2MNmXVPirBG2mIY1sWSqA","SEXTA","SIM","","",""
"18/07/2026","https://app.clickup.com/t/9013450208/86aj5hmdg","","","SÁBADO","SIM","","","","","18/07/2026","","","SÁBADO","","","",""
"19/07/2026","https://app.clickup.com/t/9013450208/86aj7q8tz","","","DOMINGO","SIM","","","","","19/07/2026","https://app.clickup.com/t/9013450208/86aj4cq9m","https://drive.google.com/file/d/1RE_Eo0SEI7GfDzsTMHLKNks9EMDA8vdj/view","DOMINGO","SIM","","",""
"20/07/2026","https://app.clickup.com/t/9013450208/86aj49wgw","https://app.clickup.com/t/9013450208/86ahxaxqj","","SEGUNDA","","","","","","20/07/2026","","","SEGUNDA","","","",""
"21/07/2026","https://app.clickup.com/t/9013450208/86aj49wgw","https://app.clickup.com/t/9013450208/86ahxaxqj","","TERÇA","","","","","","21/07/2026","","","TERÇA","","","",""
"22/07/2026","","","","QUARTA","","","","","","22/07/2026","","","QUARTA","","","",""
"23/07/2026","","","","QUINTA","","","","","","23/07/2026","","","QUINTA","","","",""
"24/07/2026","","","","SEXTA","","","","","","24/07/2026","","","SEXTA","","","",""
"25/07/2026","","","","SÁBADO","","","","","","25/07/2026","","","SÁBADO","","","",""
"26/07/2026","","","","DOMINGO","","","","","","26/07/2026","","","DOMINGO","","","",""
"27/07/2026","","","","SEGUNDA","","","","","","27/07/2026","","","SEGUNDA","","","",""
"28/07/2026","","","","TERÇA","","","","","","28/07/2026","","","TERÇA","","","",""
"29/07/2026","","","","QUARTA","","","","","","29/07/2026","","","QUARTA","","","",""
"30/07/2026","","","","QUINTA","","","","","","30/07/2026","","","QUINTA","","","",""
"31/07/2026","","","","SEXTA","","","","","","31/07/2026","","","SEXTA","","","",""`;

const CSV_WEEVO = `"WEEVO DATA SEMANA 1","LINK ","DRIVE ","DIA DA SEMANA ","APROVADO PARA EXECUÇÃO? ","FORMATO ","OBS ","POSTADO? "
"07/07/2026","","","TERÇA","","","",""
"08/07/2026","https://app.clickup.com/t/9013450208/86aje5tnn","https://drive.google.com/drive/u/2/folders/1dFexIyeGzwJvWp1VA9Cfsh8q4isZ_oqY","QUARTA","SIM","reels","","SIM"
"09/07/2026","","","QUINTA","","","",""
"10/07/2026","https://app.clickup.com/t/9013450208/86ajb6457","https://drive.google.com/drive/u/2/folders/13VX_vpqhyxKNQDZw5mCNBWo89PQgdCB3","SEXTA","SIM","reels","","SIM"
"11/07/2026","","","SÁBADO","","","",""
"12/07/2026","","","DOMINGO","","","",""
"13/07/2026","https://app.clickup.com/t/9013450208/86ajag257","https://drive.google.com/drive/u/2/folders/16RgoROLcwceGstHCgOUz5mWAntG9EJBn","SEGUNDA","SIM","reels","",""
"14/07/2026","","","TERÇA","","","",""
"15/07/2026","https://app.clickup.com/t/9013450208/86ajbu4ay","https://drive.google.com/drive/u/2/folders/1Fsb9lfrg8GvocTvDnInXBot4OUxSm7zB","QUARTA","SIM","reels","",""`;

// ---------------------------------------------------------------------------
// Cache de nomes/status/responsável (lido do ClickUp em 13/07/2026).
// O servidor atualiza tudo ao vivo depois que o token for configurado.
// ---------------------------------------------------------------------------
const TASK_CACHE = {
  '86aj4kq6m': { name: '[Edição ADS] - Onevo Energia - Junte-se a +50 empresas', status: 'banco de criativos', assignee: 'Klenio Braz' },
  '86ajce7tx': { name: '[Edição] Cassio _ Fixado ONEVO ENERGIA', status: 'completo', assignee: 'Thiago' },
  '86ajekdwu': { name: 'Agendar Post onevo estático - 09/07', status: 'completo', assignee: 'Zion Bagatoli' },
  '86aje9mw7': { name: '[EDIÇÃO] Takes de drones USINAS', status: 'completo', assignee: 'Thiago' },
  '86aje9pwp': { name: '[CARROSSEL] 5 RISCOS DE INVESTIR EM USINAS SOLARES', status: 'aprovar', assignee: 'Samuel Melo' },
  '86aje9r5v': { name: '[CAPTAÇÃO] A Selic já caiu 3 vezes este ano.', status: 'pendente', assignee: 'Thiago' },
  '86ajaga3z': { name: '[CARROSSEL] 3 coisas que decidem se o brinde vira rotina.', status: 'completo', assignee: 'Samuel Melo' },
  '86aje4cu2': { name: 'Trocar tela final do vídeo em anexo instagram', status: 'completo', assignee: 'Zion Bagatoli' },
  '86ajazdnn': { name: '[CARROSSEL] CASE REDBULL', status: 'completo', assignee: 'Samuel Melo' },
  '86ajagav9': { name: '[CARROSSEL] Tem um motivo pro Trucker ser o boné mais pedido por quem trabalha no campo.', status: 'completo', assignee: 'Samuel Melo' },
  '86aj9gjwz': { name: '[CARROSSEL] VOCÊ GASTA MAIS PRA CONQUISTAR DO QUE PRA MANTER.', status: 'pendente', assignee: 'Samuel Melo' },
  '86ajawrmj': { name: '[ADS] Autoridade Igor [1 JUL] - Grandes Marcas + Aumentar recompra', status: 'pendente', assignee: 'Klenio Braz' },
  '86ajafmpg': { name: 'ESTÁTICO BONÉ TRUCKER - RAM', status: 'completo', assignee: 'Samuel Melo' },
  '86aj9gp3j': { name: '[CARROSSEL] O BRINDE QUE VOCÊ ENTREGA É A IMPRESSÃO QUE FICA.', status: 'pendente', assignee: 'Samuel Melo' },
  '86ajcmm20': { name: 'Aftermovie Class', status: 'em progresso', assignee: 'Klenio Braz' },
  '86aj7q8tz': { name: '[Reels] Cortes do Podcast Leonardo Correa', status: 'publicar', assignee: 'Klenio Braz' },
  '86ajfkk7y': { name: 'POST CARROSSEL ACADEMY CLASS', status: 'pendente', assignee: 'Samuel Melo' },
  '86ahr6mwa': { name: '[Edição] Cortes de podcast Loucos por Coxinha', status: 'publicar', assignee: 'Thiago' },
  '86aj2tj3p': { name: 'CASE GIRAMUNDO', status: 'alterar', assignee: 'Samuel Melo' },
  '86aj5hmdg': { name: 'CASE FIO A FIO', status: 'pendente', assignee: 'Samuel Melo' },
  '86aj49wgw': { name: 'CASE SACOLÃO', status: 'aprovar', assignee: 'Samuel Melo' },
  '86ajc5bzn': { name: '[Edição] Compilado Conselho [06 JUL]', status: 'aprovar', assignee: 'Thiago' },
  '86ajfmkxq': { name: 'POST CARROSSEL CLUB CLASS', status: 'alterar', assignee: 'Samuel Melo' },
  '86aje5tnn': { name: '[Edição] Aftermovie Weevo [07JUL]', status: 'completo', assignee: 'Thiago' },
  '86ajb6457': { name: 'Depoimento de Lucas Mega', status: 'completo', assignee: 'Klenio Braz' },
  '86ajag257': { name: '[ADS] Concorrencia_Cresce - Raí [1 JUL]', status: 'alterar', assignee: 'Klenio Braz' },
  '86ajbu4ay': { name: '[CAPTAÇÃO] Workshop Destrava IA - Weevo [02 JUL]', status: 'completo', assignee: 'Thiago' },
};

const STATUS_COLORS = {
  'solicitado form': '#656f7d', 'pendente': '#87909e', 'backlog': '#aa8d80',
  'em progresso': '#f9d900', 'alterar': '#d33d44', 'aprovar': '#0f9d9f',
  'revisão ia': '#a18072', 'aprovação líder': '#e16b16', 'publicar': '#ee5e99',
  'banco de criativos': '#1090e0', 'revisão solicitada': '#ffc53d', 'completo': '#008844',
};

// ---------------------------------------------------------------------------
const tabs = [
  ['ONEVO', CSV_ONEVO],
  ['SEUBONÉ', CSV_SEUBONE],
  ['CARBONE', CSV_CARBONE],
  ['WEEVO', CSV_WEEVO],
];

let all = [];
for (const [name, csv] of tabs) {
  const { slots, banco } = parseTab(name, csv);
  all = all.concat(slots, banco);
}

// dedup
const seen = new Set();
all = all.filter(s => { const k = slotKey(s); if (seen.has(k)) return false; seen.add(k); return true; });

let n = 0;
const slots = all.map(s => {
  const cache = s.taskId ? TASK_CACHE[s.taskId] : null;
  return {
    id: 's' + String(++n).padStart(3, '0'),
    conta: s.conta,
    date: s.date || null,
    taskId: s.taskId || null,
    titulo: null, // override manual; se null, usa tituloCache ou fallback
    formato: s.formato || '',
    obs: s.obs || '',
    gm: s.gm || '',
    drive: s.drive || '',
    linkRef: s.linkRaw || '',
    aprovado: !!s.aprovado,
    postado: !!s.postado,
    responsavelManual: s.responsavel || '',
    origem: s.origem || 'planilha',
    tituloCache: cache ? cache.name : null,
    statusCache: cache ? { status: cache.status, color: STATUS_COLORS[cache.status] || '#87909e' } : null,
    assigneeCache: cache ? cache.assignee : null,
    atualizadoEm: null,
  };
});

const data = {
  version: 1,
  geradoEm: '2026-07-13',
  abas: ['SEUBONÉ', 'CARBONE', 'ONEVO', 'WEEVO'],
  contas: {
    'seubone':       { nome: 'SeuBoné',             cor: '#3987e5', aba: 'SEUBONÉ' },
    'carbone-edu':   { nome: 'Carbone Educação',    cor: '#c98500', aba: 'CARBONE' },
    'carbone-club':  { nome: 'Carbone Club',        cor: '#d95926', aba: 'CARBONE' },
    'onevo-energia': { nome: 'Onevo Energia',       cor: '#199e70', aba: 'ONEVO' },
    'onevo-invest':  { nome: 'Onevo Investimentos', cor: '#9085e9', aba: 'ONEVO' },
    'weevo':         { nome: 'Weevo',               cor: '#d55181', aba: 'WEEVO' },
  },
  sheet: {
    id: '1V-v9ly14ZDV_sTviN1w9al0FFmGNR5bOF-qXDo9W10Q',
    tabs: { 'ONEVO': { gid: '0' }, 'SEUBONÉ': { sheet: 'SEUBONÉ' }, 'CARBONE': { sheet: 'CARBONE' }, 'WEEVO': { sheet: 'WEEVO' } },
  },
  statusColors: STATUS_COLORS,
  slots,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(data, null, 2));

const porConta = {};
for (const s of slots) porConta[s.conta] = (porConta[s.conta] || 0) + 1;
console.log('data.json gerado:', slots.length, 'slots');
console.log(porConta);
console.log('sem data (banco):', slots.filter(s => !s.date).length);
console.log('com task do ClickUp:', slots.filter(s => s.taskId).length);
console.log('com cache de nome:', slots.filter(s => s.tituloCache).length);
