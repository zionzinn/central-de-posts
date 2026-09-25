// Medidor de uso de banda (v3.72).
// Conta, por mês, quanto o painel MANDA pra fora (é isso que o Render cobra: o plano grátis
// tem 5 GB/mês) e quanto disso vem dos DOCUMENTOS. No Render, cada alteração faz o start.js
// enviar o data.json INTEIRO pro GitHub; como os documentos moram dentro dele, quanto mais
// documento, mais cara fica cada alteração. É esse o aviso que aparece no painel.
// Os contadores ficam em db.uso e vão pro disco junto com as gravações normais: contar
// nunca dispara gravação sozinho (senão o próprio medidor gastaria banda).
'use strict';

const CABECALHO = 220;          // bytes de cabeçalho HTTP estimados por resposta
const DEBOUNCE_GIT = 15_000;    // igual ao start.js: envia 15 s depois da última alteração
const REDE_GIT = 5 * 60_000;    // igual ao start.js: rede de segurança a cada 5 min

module.exports = function criarUso({ db, fs, dataFile, limiteGB, comGitHub }) {
  const LIMITE = Math.round((limiteGB || 5) * 1e9);

  function mesAtual() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
  /** O contador do mês corrente (vira o mês: o anterior fica guardado em db.usoAnterior). */
  function atual() {
    const m = mesAtual();
    if (!db.uso || typeof db.uso !== 'object' || db.uso.mes !== m) {
      if (db.uso && db.uso.mes) db.usoAnterior = db.uso;
      db.uso = { mes: m, desde: new Date().toISOString(), respostas: 0, git: 0, gitEnvios: 0 };
    }
    return db.uso;
  }
  /** Uma resposta HTTP que saiu (corpo + cabeçalho estimado). */
  function resposta(bytes) { atual().respostas += (bytes || 0) + CABECALHO; }
  /** Bytes soltos numa conexão já aberta (presença ao vivo), sem cabeçalho novo. */
  function bruto(bytes) { atual().respostas += bytes || 0; }

  // Estimativa dos envios do start.js pro GitHub (só existe rodando no Render, com GH_TOKEN).
  let tEnvio = null, pendente = false, tamanho = 0;
  try { tamanho = fs.statSync(dataFile).size; } catch { /* primeira execução */ }
  function contaEnvio() {
    if (!pendente) return;
    pendente = false;
    const u = atual(); u.gitEnvios++; u.git += Math.ceil(tamanho * 4 / 3) + 600; // base64 + JSON do pedido
  }
  /** O data.json acabou de ser gravado com esse tamanho. */
  function gravou(bytes) {
    tamanho = bytes || tamanho;
    if (!comGitHub) return;
    pendente = true; clearTimeout(tEnvio); tEnvio = setTimeout(contaEnvio, DEBOUNCE_GIT);
  }
  if (comGitHub) { const t = setInterval(() => { if (pendente) contaEnvio(); }, REDE_GIT); if (t.unref) t.unref(); }

  /** Peso dos documentos dentro do data.json (texto + versões guardadas), sem serializar tudo. */
  function pesoDocs() {
    let bytes = 0, n = 0, lixeira = 0, versoes = 0;
    for (const d of Object.values(db.docs || {})) {
      n++; if (d.excluido) lixeira++;
      const vs = d.versoes || [];
      versoes += vs.length;
      bytes += 450 + Buffer.byteLength(d.html || '') + vs.reduce((a, v) => a + (v.z ? v.z.length : 0) + 90, 0);
    }
    return { bytes, n, lixeira, versoes };
  }

  let cache = null;
  function invalida() { cache = null; }
  /** Resumo completo (cacheado 60 s, porque o painel pede a cada 20 s). */
  function resumo() {
    if (cache && Date.now() - cache.t < 60_000) return cache.r;
    const u = atual();
    const agora = Date.now();
    const [y, m] = u.mes.split('-').map(Number);
    const iniMes = new Date(y, m - 1, 1).getTime(), fimMes = new Date(y, m, 1).getTime();
    const desde = Math.max(Date.parse(u.desde) || iniMes, iniMes);
    const decorrido = Math.max(agora - desde, 24 * 3600_000); // pelo menos 1 dia, pra não exagerar no começo
    const total = u.respostas + u.git;
    const previsao = Math.round(total / decorrido * (fimMes - iniMes));
    const docs = pesoDocs();
    const dataBytes = Math.max(tamanho, 1);
    const fracDocs = Math.min(1, docs.bytes / dataBytes);
    const gitPrev = total ? previsao * (u.git / total) : 0;
    const gitDocsPrev = Math.round(gitPrev * fracDocs);
    let nivel = previsao >= LIMITE ? 'alto' : previsao >= LIMITE * 0.7 ? 'atencao' : 'ok';
    if (nivel === 'ok' && docs.bytes >= 5e6) nivel = 'atencao';            // mesmo com pouco uso, 5 MB de documento já pesa em cada alteração
    const porDocs = docs.bytes >= 2e6 || (previsao > 0 && gitDocsPrev >= previsao * 0.4);
    const r = {
      mes: u.mes, desde: new Date(desde).toISOString(), comGitHub: !!comGitHub,
      respostasBytes: u.respostas, gitBytes: u.git, gitEnvios: u.gitEnvios, totalBytes: total,
      previsaoBytes: previsao, limiteBytes: LIMITE, gitDocsPrevBytes: gitDocsPrev,
      dataBytes, docsBytes: docs.bytes, docsN: docs.n, docsLixeira: docs.lixeira, docsVersoes: docs.versoes,
      envioBytes: comGitHub ? Math.ceil(dataBytes * 4 / 3) : 0,
      nivel, porDocs,
      mesAnterior: db.usoAnterior ? { mes: db.usoAnterior.mes, totalBytes: (db.usoAnterior.respostas || 0) + (db.usoAnterior.git || 0) } : null,
    };
    cache = { t: agora, r };
    return r;
  }
  /**
   * O pedaço que vai no /api/state (pequeno e ARREDONDADO: se mudasse a cada byte, a resposta do painel
   * nunca seria igual à anterior e o "nada mudou" (304) nunca aconteceria).
   */
  function curto() {
    const r = resumo();
    const arred = (v, passo) => Math.round(v / passo) * passo;
    return { nivel: r.nivel, porDocs: r.porDocs, comGitHub: r.comGitHub, previsaoBytes: arred(r.previsaoBytes, 1e8), limiteBytes: r.limiteBytes,
      docsBytes: arred(r.docsBytes, 1e5), dataBytes: arred(r.dataBytes, 1e5), docsN: r.docsN };
  }

  return { resposta, bruto, gravou, resumo, curto, invalida, atual };
};
