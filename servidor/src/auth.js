import { randomBytes, scryptSync, timingSafeEqual, createHash, randomInt } from 'node:crypto';
import { db } from './db.js';

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const aleatorio = n => Array.from({ length: n }, () => ALFABETO[randomInt(ALFABETO.length)]).join('');
const sha = s => createHash('sha256').update(s).digest('hex');

export function hashSenha(senha) {
  const sal = randomBytes(16).toString('hex');
  return `${sal}:${scryptSync(senha, sal, 64).toString('hex')}`;
}
export function conferirSenha(senha, guardado) {
  const [sal, h] = String(guardado ?? '').split(':');
  if (!sal || !h) return false;   // registro de senha mal formado: nunca confere
  const a = scryptSync(senha, sal, 64), b = Buffer.from(h, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

// Sessões do painel: o cookie leva o token, o banco guarda só o hash
const DURACAO_SESSAO = 12 * 3600 * 1000;
export const SEGUNDOS_SESSAO = DURACAO_SESSAO / 1000;

export function criarSessao(admId) {
  const token = randomBytes(32).toString('hex');
  db.prepare('DELETE FROM sessoes WHERE expira < ?').run(Date.now());
  db.prepare('INSERT INTO sessoes (token, adm_id, expira) VALUES (?, ?, ?)').run(sha(token), admId, Date.now() + DURACAO_SESSAO);
  return token;
}
export function admDaSessao(token) {
  if (!token) return null;
  return db.prepare('SELECT a.id, a.login, a.nome FROM sessoes s JOIN adms a ON a.id = s.adm_id WHERE s.token = ? AND s.expira > ?')
    .get(sha(token), Date.now()) ?? null;
}
export function encerrarSessao(token) {
  if (token) db.prepare('DELETE FROM sessoes WHERE token = ?').run(sha(token));
}

// Cada CT48 recebe um token próprio no registro; o banco guarda só o hash
export function novoTokenAparelho() {
  const token = randomBytes(32).toString('hex');
  return { token, hash: sha(token) };
}
export function aparelhoDoToken(token) {
  return token ? db.prepare('SELECT * FROM aparelhos WHERE token_hash = ?').get(sha(token)) ?? null : null;
}

// 5 erros seguidos bloqueiam o IP por 5 minutos (login do ADM e código de registro)
export function limitador() {
  const tentativas = new Map();
  return {
    bloqueado(ip) { const r = tentativas.get(ip); return !!r && r.n >= 5 && r.ate > Date.now(); },
    mensagem(ip) {
      const min = Math.max(1, Math.ceil(((tentativas.get(ip)?.ate ?? 0) - Date.now()) / 60000));
      return `Muitas tentativas erradas. Aguarde ${min} minuto${min > 1 ? 's' : ''} e tente de novo.`;
    },
    falhou(ip) {
      const r = tentativas.get(ip);
      tentativas.set(ip, { n: r && r.ate > Date.now() ? r.n + 1 : 1, ate: Date.now() + 5 * 60000 });
    },
    limpar(ip) { tentativas.delete(ip); }
  };
}
