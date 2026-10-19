// Aparelhos no painel: cadastro, registro, devolução, bloqueio remoto e manutenção.
import { Router } from 'express';
import { db, registrar, transacao } from '../db.js';
import { aleatorio } from '../auth.js';
import { pessoaJSON } from '../pessoas.js';
import { aparelhoJSON, buscarAparelho, desvincular, SITUACOES } from '../aparelhos.js';
import { adm } from '../middlewares.js';
import { erro } from '../util.js';

export const rotas = Router();
const VALIDADE_CODIGO = 30 * 60000;

rotas.get('/aparelhos', adm, (req, res) => {
  res.json(db.prepare('SELECT * FROM aparelhos ORDER BY nome').all().map(aparelhoJSON));
});

rotas.post('/aparelhos', adm, (req, res) => {
  const nome = String(req.body?.nome ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9 _-]{0,29}$/.test(nome)) return erro(res, 400, 'Dê um nome curto ao aparelho, por exemplo CT48-05.');
  if (db.prepare('SELECT 1 FROM aparelhos WHERE nome = ?').get(nome)) return erro(res, 409, `Já existe um aparelho chamado ${nome}.`);
  const r = db.prepare('INSERT INTO aparelhos (nome, codigo_registro, codigo_expira) VALUES (?, ?, ?)')
    .run(nome, aleatorio(8), Date.now() + VALIDADE_CODIGO);
  registrar('info', `${nome} cadastrado por ${req.adm.nome}`, { aparelho: Number(r.lastInsertRowid), adm: req.adm.id });
  res.json(aparelhoJSON(buscarAparelho(r.lastInsertRowid)));
});

// Novo código de registro: desconecta o app que estava registrado com este nome
rotas.post('/aparelhos/:id/codigo', adm, (req, res) => {
  const a = buscarAparelho(req.params.id);
  if (!a) return erro(res, 404, 'Aparelho não encontrado.');
  if (a.pessoa) return erro(res, 409, 'Faça a devolução antes de registrar o aparelho de novo.');
  db.prepare('UPDATE aparelhos SET codigo_registro = ?, codigo_expira = ?, token_hash = NULL WHERE id = ?')
    .run(aleatorio(8), Date.now() + VALIDADE_CODIGO, a.id);
  registrar('info', `Novo código de registro gerado para ${a.nome} por ${req.adm.nome}`, { aparelho: a.id, adm: req.adm.id });
  res.json(aparelhoJSON(buscarAparelho(a.id)));
});

function encerrarUso(tipo) {
  return (req, res) => {
    const a = buscarAparelho(req.params.id);
    if (!a) return erro(res, 404, 'Aparelho não encontrado.');
    const feito = a.pessoa && desvincular(a, (p, tempo) => tipo === 'devolucao'
      ? `${a.nome} devolvido por ${p.nome} após ${tempo} de uso. Recebido por ${req.adm.nome}`
      : `${a.nome} bloqueado remotamente por ${req.adm.nome}. Estava com ${p.nome} há ${tempo}`, req.adm.id);
    if (!feito) return erro(res, 409, 'Este aparelho já está bloqueado.');
    res.json(aparelhoJSON(buscarAparelho(a.id)));
  };
}
rotas.post('/aparelhos/:id/devolver', adm, encerrarUso('devolucao'));
rotas.post('/aparelhos/:id/bloquear', adm, encerrarUso('bloqueio'));

// situacao: manutencao | quebrado | perdido, ou null para voltar ao uso
rotas.post('/aparelhos/:id/manutencao', adm, (req, res) => {
  const a = buscarAparelho(req.params.id);
  if (!a) return erro(res, 404, 'Aparelho não encontrado.');
  const situacao = req.body?.situacao ?? null, obs = String(req.body?.obs ?? '').trim().slice(0, 300) || null;
  if (situacao !== null && !SITUACOES[situacao]) return erro(res, 400, 'Situação inválida.');
  if (situacao === null) {
    if (!a.manutencao) return erro(res, 409, 'Este aparelho não está em manutenção.');
    db.prepare('UPDATE aparelhos SET manutencao = NULL, manutencao_obs = NULL, manutencao_desde = NULL WHERE id = ?').run(a.id);
    registrar('info', `${a.nome} voltou a ficar disponível (saiu de ${SITUACOES[a.manutencao]}) por ${req.adm.nome}`, { aparelho: a.id, adm: req.adm.id });
    return res.json(aparelhoJSON(buscarAparelho(a.id)));
  }
  if (a.pessoa && situacao !== 'perdido') return erro(res, 409, `O ${a.nome} está com ${pessoaJSON(a.pessoa).nome}. Receba a devolução antes de mandar para manutenção.`);
  transacao(() => {
    // Perdido durante o uso: encerra o uso e bloqueia o aparelho
    if (a.pessoa) desvincular(a, (p, tempo) => `${a.nome} marcado como perdido por ${req.adm.nome}. Estava com ${p.nome} há ${tempo}`, req.adm.id);
    db.prepare('UPDATE aparelhos SET manutencao = ?, manutencao_obs = ?, manutencao_desde = ? WHERE id = ?').run(situacao, obs, Date.now(), a.id);
    if (!a.pessoa) registrar(situacao === 'perdido' ? 'bad' : 'info', `${a.nome} marcado como ${SITUACOES[situacao]} por ${req.adm.nome}${obs ? ': ' + obs : ''}`, { aparelho: a.id, adm: req.adm.id });
  });
  res.json(aparelhoJSON(buscarAparelho(a.id)));
});
