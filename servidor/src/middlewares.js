// Quem está chamando a API: um ADM logado no painel ou um CT48 registrado.
import { db } from './db.js';
import { admDaSessao, aparelhoDoToken } from './auth.js';
import { erro, cookie } from './util.js';

/** Exige ADM logado (cookie de sessão). Deixa o ADM em req.adm. */
export function adm(req, res, next) {
  const a = admDaSessao(cookie(req, 'sessao'));
  if (!a) return erro(res, 401, 'Faça login para continuar.');
  req.adm = a;
  next();
}

/** Exige CT48 registrado (token no cabeçalho Authorization). Deixa o aparelho em req.aparelho e marca que ele falou com o servidor. */
export function aparelho(req, res, next) {
  const m = /^Bearer ([0-9a-f]{64})$/.exec(req.headers.authorization || '');
  const a = m && aparelhoDoToken(m[1]);
  if (!a) return erro(res, 401, 'Aparelho não registrado.');
  db.prepare('UPDATE aparelhos SET visto = ? WHERE id = ?').run(Date.now(), a.id);
  req.aparelho = a;
  next();
}
