'use strict';
/*
 * Parser da planilha "PLANEJAMENTO ORGANIZAÇÃO" (Google Sheets) do Grupo SB.
 * Lê o CSV exportado (gviz) de cada aba e transforma em "slots" de postagem.
 * Usado pelo seed (scripts/seed.mjs) e pelo botão "Importar planilha" (server.js).
 */

// ---------- CSV ----------
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* ignora */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// ---------- helpers ----------
function clean(v) { return (v || '').trim(); }

function parseDate(v) {
  // "07/07/2026" -> "2026-07-07"
  const m = clean(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function taskIdFromUrl(v) {
  const s = clean(v);
  if (!s.includes('clickup.com')) return null;
  const m = s.match(/\/t\/(?:\d+\/)?([a-z0-9]+)\/?\s*$/i);
  return m ? m[1] : null;
}

function parsePostado(v) {
  const s = clean(v).toUpperCase();
  if (!s) return { postado: false, flag: null };
  if (s === 'SIM') return { postado: true, flag: null };
  return { postado: false, flag: s }; // ex.: "FRACASSEI"
}

function normFormato(v) {
  const s = clean(v).toLowerCase();
  if (!s) return '';
  if (s.includes('reel')) return 'reels';
  if (s.includes('carro')) return 'carrossel';
  if (s.includes('est')) return 'estático';
  return s;
}

// ---------- layout das abas ----------
// Cada aba tem blocos (contas lado a lado). Índices = colunas do CSV.
const TAB_LAYOUTS = {
  'ONEVO': [
    { conta: 'onevo-energia', data: 0, links: [1], drive: 2, dia: 3, aprovado: 4, formato: 5, obs: 6, postado: 7 },
    { conta: 'onevo-invest',  data: 12, links: [13], drive: 14, dia: 15, aprovado: 16, formato: 17, obs: 18, postado: 19 },
  ],
  'SEUBONÉ': [
    { conta: 'seubone', data: 0, links: [1], drive: 2, dia: 3, aprovado: 4, formato: 5, obs: 6, gm: 7, postado: 8 },
  ],
  'CARBONE': [
    { conta: 'carbone-edu',  data: 0, links: [1, 2], drive: 3, dia: 4, aprovado: 5, formato: 6, obs: 7, postado: 8 },
    { conta: 'carbone-club', data: 10, links: [11], drive: 12, dia: 13, aprovado: 14, formato: 15, obs: 16, postado: 17 },
  ],
  'WEEVO': [
    { conta: 'weevo', data: 0, links: [1], drive: 2, dia: 3, aprovado: 4, formato: 5, obs: 6, postado: 7 },
  ],
};

// Banco de reutilização (só na aba SEUBONÉ): colunas 10=link IG, 11=direcionamento, 12=responsável
const SEUBONE_BANCO = { link: 10, direcionamento: 11, responsavel: 12 };

/**
 * Converte o CSV de uma aba em slots.
 * @returns {{slots: Array, banco: Array}}
 */
function parseTab(tabName, csvText) {
  const layout = TAB_LAYOUTS[tabName];
  if (!layout) throw new Error(`Aba desconhecida: ${tabName}`);
  const rows = parseCsv(csvText);
  const slots = [];
  const banco = [];

  for (let r = 1; r < rows.length; r++) { // pula cabeçalho
    const row = rows[r];
    if (!row || !row.length) continue;

    for (const b of layout) {
      const date = parseDate(row[b.data]);
      if (!date) continue;

      const drive = clean(row[b.drive]);
      const aprovado = clean(row[b.aprovado]).toUpperCase() === 'SIM';
      const formato = normFormato(row[b.formato]);
      const obs = clean(row[b.obs]);
      const gm = b.gm != null ? clean(row[b.gm]).toLowerCase() : '';
      const post = parsePostado(row[b.postado]);

      for (let li = 0; li < b.links.length; li++) {
        const rawLink = clean(row[b.links[li]]);
        const taskId = taskIdFromUrl(rawLink);
        // sinal de que a linha é um post de verdade (e não só o esqueleto do mês)
        const temSinal = !!(rawLink || drive || aprovado || formato || obs || post.postado || post.flag);
        if (li > 0 && !rawLink) continue;       // 2º link vazio não gera slot
        if (li === 0 && !temSinal) continue;    // linha só com data: pula

        slots.push({
          conta: b.conta,
          date,
          taskId,
          linkRaw: rawLink && !taskId ? rawLink : '',
          drive,
          aprovado,
          formato,
          obs: post.flag ? (obs ? obs + ' · ' + post.flag : post.flag) : obs,
          gm: gm || '',
          postado: post.postado,
        });
      }
    }

    // banco de reutilização (SEUBONÉ)
    if (tabName === 'SEUBONÉ') {
      const link = clean(row[SEUBONE_BANCO.link]);
      if (link.startsWith('http')) {
        banco.push({
          conta: 'seubone',
          date: null,
          taskId: null,
          linkRaw: link,
          drive: '',
          aprovado: false,
          formato: 'reels',
          obs: clean(row[SEUBONE_BANCO.direcionamento]),
          gm: '',
          postado: false,
          responsavel: clean(row[SEUBONE_BANCO.responsavel]),
          origem: 'banco',
        });
      }
    }
  }
  return { slots, banco };
}

/** Chave de deduplicação de um slot (pro merge de importações repetidas). */
function slotKey(s) {
  return [s.conta, s.date || 'sem-data', s.taskId || s.linkRaw || s.drive || 'vazio'].join('|');
}

module.exports = { parseCsv, parseTab, slotKey, taskIdFromUrl, TAB_LAYOUTS };
