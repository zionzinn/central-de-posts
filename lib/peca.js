// v4.03: a PEÇA do post é Arte ou Vídeo. Pedido do Zion (02/10/2026): "o doc se divide em arte e video somente, só
// pra dividir o que é arte e video"; no vídeo, a Elis "vai criar apenas o roteiro de captar daquele dia (o dia que vai
// sair)". v4.14: o post de vídeo pode ser ligado a uma captação do calendário de captação (lib/captacao.js).
// Vídeo = tem captação (o filmmaker grava). Arte = não tem (design, ou edição de material que já existe: corte de
// podcast, depoimento e vídeo do banco). Vem do formato e do nome do post; slot.peca (a marcação que o doc da copy
// fazia) ainda vale onde ficou guardada. v4.22: o doc da copy e a marcação saíram (backup _backup-v4.21-fluxo-copy).
// A mesma regra mora em public/js/captacao.js (a tela): mudou aqui, muda lá.
'use strict';

const semAcento = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const FMT_VIDEO = new Set(['reels', 'video medio', 'video de anuncio']);
const FMT_ARTE = new Set(['carrossel', 'estatico', 'story', 'stories', 'corte de podcast']);
// corte de podcast e edição de material que já existe (depoimento gravado em evento, vídeo antigo): é vídeo no
// Instagram, mas não tem captação. O nome da task diz ("Corte podcast: ...", "[Reels] Cortes do Podcast ...",
// "[EDIÇÃO] Depoimento ..."), e "[CAPTAÇÃO]" diz o contrário. slot.peca (marcação antiga) vence tudo.
const SEM_CAPTACAO = /\bcortes? (do |de )?(podcast|reels)\b|\[cortes?\b|\[edicao|\bedicao (de |do )?depoimento/;
/** O que o nome do post (o do painel, o da task e o tema da matriz) diz: 'video', 'arte' ou null. */
function nomeDiz(s) {
  const t = semAcento([s.titulo, s.tituloCache, s.matrizSB && s.matrizSB.tema].filter(Boolean).join(' · '));
  if (/\bcaptacao\b/.test(t)) return 'video';
  if (SEM_CAPTACAO.test(t)) return 'arte';
  if (/\[(reels?|videos?)\]/.test(t)) return 'video';
  if (/\[(carrossel|estatico|story|stories)\]/.test(t)) return 'arte';
  return null;
}

/** 'arte', 'video' ou null (em aberto). Use com o post já com o MKT Hub por cima (o nome da task vem de lá). */
function pecaDoPost(s) {
  if (!s) return null;
  if (s.peca === 'arte' || s.peca === 'video') return s.peca;
  const f = semAcento(s.formato);
  if (FMT_VIDEO.has(f)) return nomeDiz(s) === 'arte' ? 'arte' : 'video';
  if (FMT_ARTE.has(f)) return 'arte';
  if (s.banco) return 'arte';                                // material do banco: já existe, não tem captação
  const n = nomeDiz(s); if (n) return n;
  const m = semAcento(s.matrizSB && s.matrizSB.formato);     // na matriz, o formato é descritivo
  if (!m) return null;
  if (/carrossel|\bstor(y|ies)\b/.test(m) || SEM_CAPTACAO.test(m)) return 'arte';
  if (/video|reels|documentario|vlog|\bpov\b|react|trend|cinematico|fala direta|contando|bastidor/.test(m)) return 'video';
  if (/foto|print|card|numero|placar|meme|grid|colagem|callout|frase|notificacao|checklist|calendario|quadro|tier|selo|starter|estatic/.test(m)) return 'arte';
  return null;
}

module.exports = { pecaDoPost, semAcento };
