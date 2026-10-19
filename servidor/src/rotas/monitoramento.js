// Acompanhamento: alertas, histórico e relatórios.
import { Router } from 'express';
import { db } from '../db.js';
import { pessoaJSON } from '../pessoas.js';
import { listarAlertas, resolverAlerta } from '../alertas.js';
import { relatorio } from '../relatorios.js';
import { adm } from '../middlewares.js';

export const rotas = Router();

rotas.get('/alertas', adm, (req, res) => res.json(listarAlertas()));

// { chaves: [...] } ou { chave }: tira essas ocorrências da lista de ativos
rotas.post('/alertas/resolver', adm, (req, res) => {
  const chaves = Array.isArray(req.body?.chaves) ? req.body.chaves : [req.body?.chave];
  for (const c of chaves.filter(Boolean).slice(0, 200)) resolverAlerta(c, req.adm.id);
  res.json({ ok: true });
});

// ?dias=N limita ao período (0 ou ausente = tudo). Devolução e bloqueio trazem quanto tempo o aparelho ficou em uso.
const LIMITE_HISTORICO = 5000;
rotas.get('/historico', adm, (req, res) => {
  const dias = Math.max(0, Math.min(3650, Number(req.query.dias) || 0));
  const desde = dias ? Date.now() - dias * 86400000 : 0;
  const linhas = db.prepare(`
    SELECT h.id, h.t, h.tipo, h.evento, h.msg, h.pessoa, a.nome AS aparelho, d.nome AS adm,
      CASE WHEN h.evento IN ('devolucao', 'bloqueio') THEN (
        SELECT MAX(e.t) FROM historico e WHERE e.aparelho_id = h.aparelho_id AND e.evento = 'entrega' AND e.t <= h.t
      ) END AS inicio
    FROM historico h LEFT JOIN aparelhos a ON a.id = h.aparelho_id LEFT JOIN adms d ON d.id = h.adm_id
    WHERE h.t >= ? ORDER BY h.t DESC, h.id DESC LIMIT ?`).all(desde, LIMITE_HISTORICO + 1);
  const pessoas = new Map();
  const itens = linhas.slice(0, LIMITE_HISTORICO).map(({ inicio, pessoa: chave, ...h }) => {
    if (chave && !pessoas.has(chave)) {
      const p = pessoaJSON(chave);
      pessoas.set(chave, { nome: p.nome, ident: p.ident, tipo: p.tipo });
    }
    return { ...h, pessoa: chave ? pessoas.get(chave) : null, duracao: inicio ? h.t - inicio : null };
  });
  res.json({ itens, cortado: linhas.length > LIMITE_HISTORICO });
});

rotas.get('/relatorios', adm, (req, res) => {
  const dias = [1, 7, 30, 90].includes(Number(req.query.dias)) ? Number(req.query.dias) : 7;
  res.json(relatorio(dias));
});
