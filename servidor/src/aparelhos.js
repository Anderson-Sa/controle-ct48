// Regras dos aparelhos usadas pelas rotas do painel e do CT48.
import { db, registrar } from './db.js';
import { pessoaJSON } from './pessoas.js';
import { prazoDevolucao } from './alertas.js';
import { dur } from './util.js';

/** Situações de manutenção: o aparelho não pode ser liberado enquanto estiver marcado. */
export const SITUACOES = { manutencao: 'em manutenção', quebrado: 'quebrado', perdido: 'perdido' };

export const buscarAparelho = id => db.prepare('SELECT * FROM aparelhos WHERE id = ?').get(Number(id));

/** Como o painel recebe cada aparelho. */
export function aparelhoJSON(a) {
  const pendente = !!a.codigo_registro && a.codigo_expira > Date.now();
  return {
    id: a.id, nome: a.nome, sn: a.sn, registrado: !!a.token_hash,
    pessoa: pessoaJSON(a.pessoa), desde: a.desde, visto: a.visto,
    lat: a.lat, lng: a.lng, precisao: a.precisao, area: a.area, fora: !!a.fora, posicaoEm: a.posicao_em,
    codigo: pendente ? a.codigo_registro : null, codigoExpira: pendente ? a.codigo_expira : null,
    manutencao: a.manutencao, manutencaoObs: a.manutencao_obs, manutencaoDesde: a.manutencao_desde,
    bateria: a.bateria, carregando: !!a.carregando, bateriaEm: a.bateria_em,
    prazo: a.pessoa && a.desde ? prazoDevolucao(a).limite : null
  };
}

/**
 * Desvincula a pessoa do aparelho (devolução, bloqueio, perda); o app se bloqueia na próxima consulta.
 * msg(pessoa, tempoDeUso) monta o texto do histórico. Devolve false se o aparelho já estava livre.
 */
export function desvincular(a, msg, admId) {
  const p = pessoaJSON(a.pessoa), tempo = dur(Date.now() - a.desde);
  const r = db.prepare('UPDATE aparelhos SET pessoa = NULL, desde = NULL WHERE id = ? AND pessoa IS NOT NULL').run(a.id);
  if (r.changes !== 1) return false;
  registrar('info', msg(p, tempo), { aparelho: a.id, pessoa: a.pessoa, adm: admId });
  return true;
}
