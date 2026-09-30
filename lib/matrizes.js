// v3.91: as matrizes de conteúdo que existem, por empresa. Cada uma tem a conta dona dos cards amarelos, a aba e as
// regras (lib/matriz-*.js). O campo do post continua `matrizSB` (nome antigo, da época em que só a SeuBoné tinha
// matriz): a conta do post diz de qual matriz ele é.
'use strict';
const SB = require('./matriz-seubone.js');
const WE = require('./matriz-weevo.js');

// umPorDia: dia que já tem QUALQUER post da conta não ganha card da matriz (SeuBoné: a matriz é o post do dia).
// Na Weevo os hacks e virais são outros posts no mesmo dia (trilha 1): só um card da matriz que já existe impede.
const MATRIZES = {
  seubone: { conta: 'seubone', aba: 'SEUBONÉ', nome: 'SeuBoné', mod: SB, umPorDia: true },
  weevo: { conta: 'weevo', aba: 'WEEVO', nome: 'Weevo', mod: WE, umPorDia: false },
};
const porConta = c => MATRIZES[c] || null;
const porAba = a => Object.values(MATRIZES).find(m => m.aba === a) || null;
/** A matriz de um post: pela conta dele (card cuja conta não tem matriz própria segue as regras da SeuBoné, a primeira). */
const doPost = s => (s && MATRIZES[s.conta]) || MATRIZES.seubone;
const ABAS = Object.values(MATRIZES).map(m => m.aba);
/** O que o navegador precisa de cada matriz (regras, rotação e explicações). Vai pelo GET /api/matrizes, com cache. */
function publicas() {
  const o = {};
  for (const [k, m] of Object.entries(MATRIZES)) {
    const x = m.mod;
    o[k] = { conta: m.conta, aba: m.aba, nome: m.nome, tipos: x.TIPOS, semanas: x.SEMANAS, ancora: x.ANCORA, inicio: x.INICIO || null, status: x.STATUS,
      obrigatorios: x.OBRIGATORIOS, regras: x.REGRAS, checklist: x.CHECKLIST, hacks: x.HACKS || '', glossario: x.GLOSSARIO };
  }
  return o;
}
module.exports = { MATRIZES, porConta, porAba, doPost, ABAS, publicas };
