// v4.02: RAIAS POR CONTA. Pedido do Zion (02/10/2026): "não consigo ter uma diferenciação tão clara do que é club e do
// que é Educação". Na aba com mais de uma conta (Carbone: Educação e Club; Onevo: Energia e Investimentos), cada semana
// vira uma faixa por conta, alinhada nos 7 dias (subgrid do CSS): o post fica SEMPRE na faixa da conta dele e o nome da
// conta aparece uma vez só, deitado na coluna da semana. A cor continua sendo só da etapa (v4.01); a conta é dita pela
// POSIÇÃO. Faixa vazia num dia = dia sem post daquela conta (sem contador de meta: decisão do Zion de 14/07/2026).
// Esconder uma conta no chip do topo deixa uma faixa só, e aí a grade volta a ser a de sempre.

/** Ordem fixa das contas na grade (a mesma que o dia usava antes da v4.02). */
const ORDEM_CONTA = { 'seubone': 1, 'carbone-edu': 2, 'carbone-club': 3, 'onevo-energia': 4, 'onevo-invest': 5, 'weevo': 6 };
/** Ícone da faixa: forma além da palavra (capelo = Educação, pessoas = Club, raio = Energia, gráfico = Investimentos). */
const RAIA_ICONE = { 'carbone-edu': 'capelo', 'carbone-club': 'users', 'onevo-energia': 'zap', 'onevo-invest': 'trend' };

/** As faixas da aba aberta: as contas visíveis, na ordem fixa. Uma conta só (ou o chip escondeu a outra): null. */
function raiasDaAba() {
  const v = contasDaAba(S.aba).filter(k => !S.filtroConta.has(k)).sort((a, b) => (ORDEM_CONTA[a] || 9) - (ORDEM_CONTA[b] || 9));
  return v.length > 1 ? v : null;
}
/** A faixa do post: a da conta dele. O collab que vem de outra aba vai pra faixa da conta parceira daqui. */
function raiaDoPost(s, raias) {
  if (raias.includes(s.conta)) return s.conta;
  return (s.collab || []).find(k => raias.includes(k)) || raias[0];
}
/** O post está na faixa da própria conta? (aí o card não precisa repetir a conta) */
function naRaiaPropria(s) { const r = raiasDaAba(); return !!r && r.includes(s.conta); }
/** As faixas vazias do dia (o celulaDia põe os cards em cada uma). */
function raiasHtml(raias) {
  return raias.map((k, i) => '<div class="day-cards raia r' + (i + 1) + '" data-conta="' + esc(k) + '" role="group" aria-label="' + esc(nomeConta(k)) + '"></div>').join('');
}
function raiaEl(cell, k) { return cell.querySelector('.raia[data-conta="' + k + '"]') || cell.querySelector('.raia'); }
/** Distribui os posts do dia nas faixas: cada um na faixa da conta dele (o "Colar aqui" o celulaDia põe na faixa certa). */
function raiasPreenche(cell, doDia, raias) {
  doDia.forEach(s => raiaEl(cell, raiaDoPost(s, raias)).appendChild(cardEl(s, true)));
}
/** Nome de cada faixa na coluna da semana (deitado, com o ícone em pé), alinhado com as faixas dos 7 dias. */
function raiasRotulos(raias) {
  return raias.map((k, i) => '<span class="wk-raia r' + (i + 1) + '" title="' + esc(nomeConta(k)) + '"><span class="wk-rt">' +
    icon(RAIA_ICONE[k] || 'users') + '<span>' + esc(contaCurta(k)) + '</span></span></span>').join('');
}
/** Liga as faixas na grade (do mês ou da semana): classe e quantas linhas cada semana ocupa (o dia + 1 por conta). */
function raiasNaGrade(g, raias) {
  g.classList.toggle('raias', !!raias);
  if (raias) g.style.setProperty('--nr', raias.length + 1); else g.style.removeProperty('--nr');
}
