// Entregar e devolver: busca de quem vai usar e os QR de liberação e de devolução.
import { Router } from 'express';
import QRCode from 'qrcode';
import { db, registrar } from '../db.js';
import { config } from '../config.js';
import { aleatorio } from '../auth.js';
import { so, cpfValido, pessoa, aparelhoDaPessoa, bloqueioDaPessoa, comSituacao } from '../pessoas.js';
import { adm } from '../middlewares.js';
import { erro, chaveValida } from '../util.js';

export const rotas = Router();
const validadeQr = () => config.validadeQrSegundos * 1000;
// O QR leva só um código; os dados pessoais ficam no servidor
const qrSvg = texto => QRCode.toString(texto, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });

rotas.get('/funcionarios/:mat', adm, (req, res) => {
  const mat = so(req.params.mat);
  const p = mat && pessoa('CLT:' + mat);
  if (!p) return erro(res, 404, `Matrícula ${mat} não encontrada na base de RH. Confira o número no crachá.`);
  res.json(comSituacao(p));
});

rotas.get('/diaristas/:cpf', adm, (req, res) => {
  const cpf = so(req.params.cpf);
  if (!cpfValido(cpf)) return erro(res, 400, 'CPF inválido. Confira os números.');
  const p = pessoa('DIA:' + cpf);
  if (!p) return erro(res, 404, 'CPF novo. Preencha o nome para cadastrar.');
  res.json(comSituacao(p));
});

rotas.post('/diaristas', adm, (req, res) => {
  const cpf = so(req.body?.cpf), nome = String(req.body?.nome ?? '').trim().replace(/\s+/g, ' ');
  if (!cpfValido(cpf)) return erro(res, 400, 'CPF inválido. Confira os números.');
  if (nome.split(' ').length < 2 || nome.length > 120) return erro(res, 400, 'Digite o nome completo do diarista.');
  const novo = !pessoa('DIA:' + cpf);
  db.prepare('INSERT INTO diaristas (cpf, nome, criado) VALUES (?, ?, ?) ON CONFLICT(cpf) DO UPDATE SET nome = excluded.nome')
    .run(cpf, nome, Date.now());
  const p = pessoa('DIA:' + cpf);
  if (novo) registrar('info', `Diarista cadastrado: ${p.log}`, { pessoa: p.chave, adm: req.adm.id });
  res.json(comSituacao(p));
});

// QR de liberação: vale alguns minutos e libera um aparelho só
rotas.post('/qr', adm, async (req, res) => {
  const chave = String(req.body?.pessoa ?? '');
  if (!chaveValida(chave)) return erro(res, 400, 'Escolha quem vai usar o aparelho.');
  const p = pessoa(chave);
  if (!p) return erro(res, 404, 'Pessoa não encontrada.');
  const outro = aparelhoDaPessoa(chave);
  if (outro) return erro(res, 409, `${p.nome} já está com o ${outro}. Faça a devolução primeiro.`);
  const b = bloqueioDaPessoa(chave);
  if (b) return erro(res, 409, `${p.nome} está bloqueado para receber aparelho: ${b.motivo}. Desbloqueie na aba Pessoas.`);
  const token = aleatorio(10), expira = Date.now() + validadeQr();
  db.prepare('INSERT INTO qrs (token, pessoa, adm_id, expira) VALUES (?, ?, ?, ?)').run(token, chave, req.adm.id, expira);
  registrar('info', `QR de liberação gerado para ${p.log} por ${req.adm.nome}`, { pessoa: chave, adm: req.adm.id });
  res.json({ token, expira, svg: await qrSvg(`PDA|LIB|${token}`), pessoa: p });
});

rotas.get('/qr/:token', adm, (req, res) => {
  const q = db.prepare('SELECT q.expira, a.nome AS aparelho FROM qrs q LEFT JOIN aparelhos a ON a.id = q.usado_por WHERE q.token = ?').get(req.params.token);
  if (!q) return erro(res, 404, 'QR não encontrado.');
  res.json({ expira: q.expira, aparelho: q.aparelho ?? null });
});

// QR de devolução: no fim do turno, um QR só bloqueia vários aparelhos enquanto valer
rotas.post('/qr-devolucao', adm, async (req, res) => {
  const token = aleatorio(10), expira = Date.now() + validadeQr();
  db.prepare('INSERT INTO qrs_devolucao (token, adm_id, expira) VALUES (?, ?, ?)').run(token, req.adm.id, expira);
  registrar('info', `QR de devolução gerado por ${req.adm.nome}`, { adm: req.adm.id });
  res.json({ token, expira, svg: await qrSvg(`PDA|DEV|${token}`) });
});

rotas.get('/qr-devolucao/:token', adm, (req, res) => {
  const q = db.prepare('SELECT expira FROM qrs_devolucao WHERE token = ?').get(req.params.token);
  if (!q) return erro(res, 404, 'QR não encontrado.');
  const devolvidos = db.prepare(`SELECT a.nome, d.t FROM devolucoes_qr d JOIN aparelhos a ON a.id = d.aparelho_id
    WHERE d.token = ? ORDER BY d.t`).all(req.params.token);
  res.json({ expira: q.expira, devolvidos });
});
