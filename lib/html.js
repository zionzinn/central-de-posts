// Limpeza de HTML que vem de fora (v4.22: saiu do lib/docs.js, que foi pro backup junto com o documento da copy).
// Hoje quem usa é o lib/hub.js: a descrição das tasks do MKT Hub aparece na folha do post.
'use strict';

/** Tira script, estilo, iframe, formulário, atributos on* e links javascript:/data:. */
function limpaHtml(h) {
  return String(h || '')
    .replace(/<\s*(script|style|iframe|object|embed|form|textarea|select|svg|math|template|noscript)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*\/?\s*(script|style|iframe|object|embed|link|meta|base|form|input|button|textarea|select|svg|math|template|noscript|frame|frameset)\b[^>]*>/gi, '')
    .replace(/\s(on[a-z]+|srcdoc|formaction)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(href|src)\s*=\s*(["'])\s*(javascript|data|vbscript)\s*:[^"']*\2/gi, ' $1="#"')
    .replace(/\s(href|src)\s*=\s*(javascript|data|vbscript)\s*:[^\s>]*/gi, ' $1="#"');
}

module.exports = { limpaHtml };
