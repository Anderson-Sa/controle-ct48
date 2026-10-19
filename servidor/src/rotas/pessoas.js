// Pessoas: funcionários da base de RH e diaristas, com uso, bloqueio e importação do RH.
import { Router } from 'express';
import { db, registrar } from '../db.js';
import { pessoa, pessoaJSON, comSituacao } from '../pessoas.js';
import { lerCsvRh, importarRh } from '../rh.js';
import { adm } from '../middlewares.js';
import { erro, chaveValida } from '../util.js';

export const rotas = Router();

// ?busca= nome, matrícula, CPF ou setor · ?tipo= CLT | DIA · ?filtro= uso | bloqueados
rotas.get('/pessoas', adm, (req, res) => {
  const busca = String(req.query.busca ?? '').trim().toLowerCase();
  const tipo = String(req.query.tipo ?? ''), filtro = String(req.query.filtro ?? '');
  const usos = new Map(db.prepare("SELECT pessoa, COUNT(*) AS n, MAX(t) AS ultimo FROM historico WHERE evento = 'entrega' AND pessoa IS NOT NULL GROUP BY pessoa").all().map(r => [r.pessoa, r]));
  const comAparelho = new Map(db.prepare('SELECT pessoa, nome, desde FROM aparelhos WHERE pessoa IS NOT NULL').all().map(r => [r.pessoa, r]));
  const bloqueados = new Map(db.prepare('SELECT pessoa, motivo, desde FROM pessoas_bloqueadas').all().map(r => [r.pessoa, r]));
  const like = '%' + busca + '%', digitos = busca.replace(/\D/g, ''), likeNum = '%' + digitos + '%';

  const lista = [];
  if (tipo !== 'DIA') {
    for (const f of db.prepare(`SELECT * FROM funcionarios WHERE ? = '' OR lower(nome) LIKE ? OR (? <> '' AND matricula LIKE ?)
        OR lower(coalesce(setor, '')) LIKE ? ORDER BY nome LIMIT 500`).all(busca, like, digitos, likeNum, like)) {
      lista.push({ chave: 'CLT:' + f.matricula, tipo: 'CLT', nome: f.nome, ident: 'Matr. ' + f.matricula, cargo: f.cargo, setor: f.setor, turno: f.turno });
    }
  }
  if (tipo !== 'CLT') {
    for (const d of db.prepare(`SELECT * FROM diaristas WHERE ? = '' OR lower(nome) LIKE ? OR (? <> '' AND cpf LIKE ?) ORDER BY nome LIMIT 500`).all(busca, like, digitos, likeNum)) {
      const p = pessoaJSON('DIA:' + d.cpf);
      lista.push({ chave: p.chave, tipo: 'DIA', nome: d.nome, ident: p.ident, cargo: 'Diarista', setor: null, turno: null, criado: d.criado });
    }
  }

  const final = lista.map(p => {
    const u = usos.get(p.chave), ap = comAparelho.get(p.chave), b = bloqueados.get(p.chave);
    return {
      ...p, usos: u?.n ?? 0, ultimoUso: u?.ultimo ?? null,
      aparelho: ap ? { nome: ap.nome, desde: ap.desde } : null,
      bloqueio: b ? { motivo: b.motivo, desde: b.desde } : null
    };
  }).filter(p => filtro === 'uso' ? p.aparelho : filtro === 'bloqueados' ? p.bloqueio : true)
    .sort((a, b) => (b.aparelho ? 1 : 0) - (a.aparelho ? 1 : 0) || a.nome.localeCompare(b.nome, 'pt-BR'));

  res.json({
    itens: final.slice(0, 300), total: final.length,
    totais: {
      clt: db.prepare('SELECT COUNT(*) AS n FROM funcionarios').get().n,
      dia: db.prepare('SELECT COUNT(*) AS n FROM diaristas').get().n,
      uso: comAparelho.size, bloqueados: bloqueados.size
    }
  });
});

rotas.get('/pessoas/:chave', adm, (req, res) => {
  const chave = String(req.params.chave);
  if (!chaveValida(chave)) return erro(res, 400, 'Pessoa inválida.');
  const p = pessoaJSON(chave);
  const f = chave.startsWith('CLT:') ? db.prepare('SELECT * FROM funcionarios WHERE matricula = ?').get(chave.slice(4)) : null;
  const eventos = db.prepare(`SELECT h.t, h.evento, h.msg, a.nome AS aparelho FROM historico h LEFT JOIN aparelhos a ON a.id = h.aparelho_id
    WHERE h.pessoa = ? AND h.evento IN ('entrega', 'devolucao', 'bloqueio', 'saiu_area', 'manutencao', 'pessoa') ORDER BY h.t DESC LIMIT 60`).all(chave);
  const r = db.prepare("SELECT COUNT(*) AS n, MIN(t) AS primeiro FROM historico WHERE pessoa = ? AND evento = 'entrega'").get(chave);
  res.json({ ...comSituacao(p), cargo: f?.cargo ?? null, setor: f?.setor ?? null, turnoRh: f?.turno ?? null, usos: r.n, primeiroUso: r.primeiro, eventos });
});

// Bloqueio: quem perdeu ou quebrou aparelho fica sem receber outro até o ADM liberar
rotas.post('/pessoas/:chave/bloquear', adm, (req, res) => {
  const chave = String(req.params.chave), motivo = String(req.body?.motivo ?? '').trim().slice(0, 200);
  const p = chaveValida(chave) && pessoa(chave);
  if (!p) return erro(res, 404, 'Pessoa não encontrada.');
  if (!motivo) return erro(res, 400, 'Escreva o motivo do bloqueio, por exemplo "perdeu o CT48-03".');
  db.prepare('INSERT INTO pessoas_bloqueadas (pessoa, motivo, adm_id, desde) VALUES (?, ?, ?, ?) ON CONFLICT(pessoa) DO UPDATE SET motivo = excluded.motivo')
    .run(chave, motivo, req.adm.id, Date.now());
  registrar('bad', `Pessoa bloqueada: ${p.log}, por ${req.adm.nome}. Motivo: ${motivo}`, { pessoa: chave, adm: req.adm.id });
  res.json(comSituacao(p));
});

rotas.post('/pessoas/:chave/desbloquear', adm, (req, res) => {
  const chave = String(req.params.chave), p = pessoaJSON(chave);
  if (db.prepare('DELETE FROM pessoas_bloqueadas WHERE pessoa = ?').run(chave).changes) {
    registrar('info', `Pessoa desbloqueada: ${p.log}, por ${req.adm.nome}`, { pessoa: chave, adm: req.adm.id });
  }
  res.json(comSituacao(p));
});

// { csv, previa: true } só confere o arquivo; sem "previa" substitui a base de funcionários
rotas.post('/rh/importar', adm, (req, res) => {
  let registros;
  try { registros = lerCsvRh(String(req.body?.csv ?? '')); } catch (e) { return erro(res, 400, e.message); }
  if (req.body?.previa) {
    return res.json({ total: registros.length, exemplos: registros.slice(0, 5), atuais: db.prepare('SELECT COUNT(*) AS n FROM funcionarios').get().n });
  }
  let n;
  try { n = importarRh(registros); } catch (e) { return erro(res, 400, e.message); }
  registrar('info', `Base de RH importada pelo painel por ${req.adm.nome}: ${n} funcionários`, { adm: req.adm.id });
  res.json({ total: n });
});
