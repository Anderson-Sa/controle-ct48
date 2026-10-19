// Sistema: configurações editáveis, ADMs e áreas Wi-Fi.
import { Router } from 'express';
import { db, registrar } from '../db.js';
import { configEditavel, salvarConfig } from '../config.js';
import { conferirSenha, hashSenha } from '../auth.js';
import { adm } from '../middlewares.js';
import { erro, normBssid } from '../util.js';

export const rotas = Router();

rotas.get('/config', adm, (req, res) => res.json(configEditavel()));
rotas.put('/config', adm, (req, res) => {
  try {
    const c = salvarConfig(req.body ?? {});
    registrar('info', `Configurações alteradas por ${req.adm.nome}`, { adm: req.adm.id });
    res.json(c);
  } catch (e) { erro(res, 400, e.message); }
});

/* ADMs (todos têm o mesmo acesso) */
const loginValido = l => /^[a-z0-9._-]{3,40}$/.test(l);
const buscarAdm = id => db.prepare('SELECT * FROM adms WHERE id = ?').get(Number(id));

rotas.get('/adms', adm, (req, res) => {
  res.json(db.prepare('SELECT id, login, nome, criado, ultimo_acesso AS ultimoAcesso FROM adms ORDER BY nome').all());
});

rotas.post('/adms', adm, (req, res) => {
  const login = String(req.body?.login ?? '').trim().toLowerCase(), nome = String(req.body?.nome ?? '').trim(), senha = String(req.body?.senha ?? '');
  if (!loginValido(login)) return erro(res, 400, 'Login inválido: use de 3 a 40 letras minúsculas, números, ponto ou hífen.');
  if (!nome || nome.length > 80) return erro(res, 400, 'Informe o nome do ADM.');
  if (senha.length < 8) return erro(res, 400, 'A senha precisa ter pelo menos 8 caracteres.');
  if (db.prepare('SELECT 1 FROM adms WHERE login = ?').get(login)) return erro(res, 409, `Já existe um ADM com o login ${login}.`);
  db.prepare('INSERT INTO adms (login, nome, senha, criado) VALUES (?, ?, ?, ?)').run(login, nome, hashSenha(senha), Date.now());
  registrar('info', `ADM ${nome} (${login}) criado por ${req.adm.nome}`, { adm: req.adm.id });
  res.json({ ok: true });
});

rotas.post('/adms/:id/senha', adm, (req, res) => {
  const alvo = buscarAdm(req.params.id);
  if (!alvo) return erro(res, 404, 'ADM não encontrado.');
  const senha = String(req.body?.senha ?? '');
  if (senha.length < 8) return erro(res, 400, 'A senha precisa ter pelo menos 8 caracteres.');
  // A própria senha exige a senha atual
  if (alvo.id === req.adm.id && !conferirSenha(String(req.body?.atual ?? ''), alvo.senha)) return erro(res, 403, 'Senha atual incorreta.');
  db.prepare('UPDATE adms SET senha = ? WHERE id = ?').run(hashSenha(senha), alvo.id);
  // Senha trocada por outro ADM derruba as sessões abertas do dono
  if (alvo.id !== req.adm.id) db.prepare('DELETE FROM sessoes WHERE adm_id = ?').run(alvo.id);
  registrar('info', alvo.id === req.adm.id ? `${req.adm.nome} trocou a própria senha` : `Senha do ADM ${alvo.nome} trocada por ${req.adm.nome}`, { adm: req.adm.id });
  res.json({ ok: true });
});

rotas.delete('/adms/:id', adm, (req, res) => {
  const alvo = buscarAdm(req.params.id);
  if (!alvo) return erro(res, 404, 'ADM não encontrado.');
  if (alvo.id === req.adm.id) return erro(res, 409, 'Você não pode remover o seu próprio acesso.');
  db.prepare('DELETE FROM adms WHERE id = ?').run(alvo.id);
  registrar('info', `ADM ${alvo.nome} (${alvo.login}) removido por ${req.adm.nome}`, { adm: req.adm.id });
  res.json({ ok: true });
});

/* Áreas Wi-Fi: cada roteador do galpão é uma área */
rotas.get('/areas-wifi', adm, (req, res) => {
  res.json(db.prepare('SELECT bssid, area FROM areas_wifi ORDER BY area, bssid').all());
});
rotas.post('/areas-wifi', adm, (req, res) => {
  const bssid = normBssid(req.body?.bssid), area = String(req.body?.area ?? '').trim();
  if (!bssid) return erro(res, 400, 'BSSID inválido. Use o formato aa:bb:cc:dd:ee:ff.');
  if (!area || area.length > 60) return erro(res, 400, 'Dê um nome à área, por exemplo Recebimento.');
  db.prepare('INSERT INTO areas_wifi (bssid, area) VALUES (?, ?) ON CONFLICT(bssid) DO UPDATE SET area = excluded.area').run(bssid, area);
  res.json({ bssid, area });
});
rotas.delete('/areas-wifi/:bssid', adm, (req, res) => {
  db.prepare('DELETE FROM areas_wifi WHERE bssid = ?').run(normBssid(req.params.bssid));
  res.json({ ok: true });
});
