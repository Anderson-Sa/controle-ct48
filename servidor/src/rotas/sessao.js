// Login e logout do painel do ADM.
import { Router } from 'express';
import { db, DEMO } from '../db.js';
import { conferirSenha, criarSessao, encerrarSessao, limitador, SEGUNDOS_SESSAO } from '../auth.js';
import { adm } from '../middlewares.js';
import { erro, cookie } from '../util.js';

export const rotas = Router();
const limiteLogin = limitador();

rotas.post('/login', (req, res) => {
  if (limiteLogin.bloqueado(req.ip)) return erro(res, 429, limiteLogin.mensagem(req.ip));
  const { login, senha } = req.body ?? {};
  const a = db.prepare('SELECT * FROM adms WHERE login = ?').get(String(login ?? '').trim().toLowerCase());
  if (!a || !conferirSenha(String(senha ?? ''), a.senha)) {
    limiteLogin.falhou(req.ip);
    return erro(res, 401, 'Login ou senha incorretos.');
  }
  limiteLogin.limpar(req.ip);
  db.prepare('UPDATE adms SET ultimo_acesso = ? WHERE id = ?').run(Date.now(), a.id);
  const token = criarSessao(a.id);
  res.set('Set-Cookie', `sessao=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SEGUNDOS_SESSAO}${req.secure ? '; Secure' : ''}`);
  res.json({ nome: a.nome });
});

rotas.post('/logout', (req, res) => {
  encerrarSessao(cookie(req, 'sessao'));
  res.set('Set-Cookie', 'sessao=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
  res.json({ ok: true });
});

rotas.get('/me', adm, (req, res) => res.json({ id: req.adm.id, nome: req.adm.nome, login: req.adm.login, demo: DEMO }));
