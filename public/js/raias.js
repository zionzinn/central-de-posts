// v4.02: RAIAS POR CONTA. Pedido do Zion (02/10/2026): "não consigo ter uma diferenciação tão clara do que é club e do
// que é Educação". Na aba com mais de uma conta (Carbone: Educação e Club; Onevo: Energia e Investimentos), cada semana
// vira uma faixa por conta, alinhada nos 7 dias (subgrid do CSS): o post fica SEMPRE na faixa da conta dele e o nome da
// conta aparece uma vez só, deitado na coluna da semana. A cor continua sendo só da etapa (v4.01); a conta é dita pela
// POSIÇÃO. Faixa vazia num dia = dia sem post daquela conta (sem contador de meta: decisão do Zion de 14/07/2026).
// Esconder uma conta no chip do topo deixa uma faixa só, e aí a grade volta a ser a de sempre.

/** Ordem fixa das contas na grade (a mesma que o dia usava antes da v4.02). */
const ORDEM_CONTA = { 'seubone': 1, 'carbone-edu': 2, 'carbone-club': 3, 'onevo-energia': 4, 'onevo-invest': 5, 'weevo': 6 };
/** Ícone da faixa: forma além da palavra (capelo = Educação, pessoas = Club, raio = Energia, gráfico = Investimentos;
    v4.12, pra aba Todos: boné = SeuBoné, brilho = Weevo). */
const RAIA_ICONE = { 'carbone-edu': 'capelo', 'carbone-club': 'users', 'onevo-energia': 'zap', 'onevo-invest': 'trend', 'seubone': 'bone', 'weevo': 'sparkle' };
// v4.12: na aba Todos (6 faixas) o nome deitado precisa ser curto: o comprimento dele vira a altura mínima da faixa
const RAIA_CURTA = { 'onevo-invest': 'Invest.' };
function raiaRotulo(k) { return (ehTodos() && RAIA_CURTA[k]) || contaCurta(k); }
/** v4.12: a cor da EMPRESA da conta (a do tema da aba dela): as contas da mesma empresa ficam com a mesma marca na aba Todos. */
function corDaEmpresa(k) { const c = S.contas[k]; return temaDaAba(c ? c.aba : '').sb; }
/** A mesma cor, na versão que dá pra ler como texto ou ícone (no claro, o amarelo puro some: vira o ink do tema). */
function corDaEmpresaTexto(k) { const c = S.contas[k], t = temaDaAba(c ? c.aba : ''); return t.ink || t.sb; }
/** v4.12: a faixa abre uma empresa nova (na aba Todos, a linha entre Club e Energia fica cheia). */
function raiaNovaEmpresa(raias, i) { return i > 0 && S.contas[raias[i]] && S.contas[raias[i - 1]] && S.contas[raias[i]].aba !== S.contas[raias[i - 1]].aba; }

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
  return raias.map((k, i) => '<div class="day-cards raia r' + (i + 1) + (raiaNovaEmpresa(raias, i) ? ' emp' : '') + '" data-conta="' + esc(k) + '" role="group" aria-label="' + esc(nomeConta(k)) + '"></div>').join('');
}
function raiaEl(cell, k) { return cell.querySelector('.raia[data-conta="' + k + '"]') || cell.querySelector('.raia'); }
/** Distribui os posts do dia nas faixas: cada um na faixa da conta dele (o "Colar aqui" o celulaDia põe na faixa certa). */
function raiasPreenche(cell, doDia, raias) {
  doDia.forEach(s => raiaEl(cell, raiaDoPost(s, raias)).appendChild(cardEl(s, true)));
}
/** Nome de cada faixa na coluna da semana (deitado, com o ícone em pé), alinhado com as faixas dos 7 dias. */
function raiasRotulos(raias) {
  return raias.map((k, i) => '<span class="wk-raia r' + (i + 1) + (raiaNovaEmpresa(raias, i) ? ' emp' : '') + '" data-conta="' + esc(k) + '" style="--raia-cor:' + corDaEmpresa(k) + '" title="' + esc(nomeConta(k)) + '"><span class="wk-rt">' +
    icon(RAIA_ICONE[k] || 'users') + '<span>' + esc(raiaRotulo(k)) + '</span></span></span>').join('');
}
/** Liga as faixas na grade (do mês ou da semana): classe e quantas linhas cada semana ocupa (o dia + 1 por conta). */
function raiasNaGrade(g, raias) {
  g.classList.toggle('raias', !!raias);
  g.classList.toggle('todos', !!raias && ehTodos());          // v4.12: faixas baixas e card de 1 linha no Mês (css/todos.css)
  if (raias) g.style.setProperty('--nr', raias.length + 1); else g.style.removeProperty('--nr');
}
