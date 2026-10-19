import { db } from './db.js';
import { config } from './config.js';

export const so = s => String(s ?? '').replace(/\D/g, '');
export const cpfMask = c => `***.${c.slice(3, 6)}.${c.slice(6, 9)}-**`;

export function cpfValido(c) {
  c = so(c);
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  for (let t = 9; t < 11; t++) {
    let s = 0;
    for (let i = 0; i < t; i++) s += +c[i] * (t + 1 - i);
    if ((s * 10) % 11 % 10 !== +c[t]) return false;
  }
  return true;
}

// Mesma chave do protótipo: 'CLT:<matrícula>' ou 'DIA:<cpf>'
export function pessoa(chave) {
  if (!chave) return null;
  const [tipo, id] = chave.split(':');
  if (tipo === 'CLT') {
    const f = db.prepare('SELECT * FROM funcionarios WHERE matricula = ?').get(id);
    return f ? {
      chave, tipo, nome: f.nome, ident: 'Matr. ' + f.matricula,
      det: [f.cargo, f.setor, f.turno].filter(Boolean).join(' · '),
      log: `${f.nome}, matr. ${f.matricula}`
    } : null;
  }
  if (tipo === 'DIA') {
    const d = db.prepare('SELECT * FROM diaristas WHERE cpf = ?').get(id);
    return d ? {
      chave, tipo, nome: d.nome, ident: 'CPF ' + cpfMask(d.cpf), det: 'Diarista',
      log: `${d.nome}, diarista, CPF ${cpfMask(d.cpf)}`
    } : null;
  }
  return null;
}

// Para exibir: se a pessoa saiu da base de RH, ainda mostra a chave em vez de quebrar
export function pessoaJSON(chave) {
  if (!chave) return null;
  const p = pessoa(chave);
  if (!p) return { chave, tipo: chave.split(':')[0], nome: chave, ident: '', det: 'Fora da base de RH', log: chave };
  return p;
}

export const aparelhoDaPessoa = chave =>
  db.prepare('SELECT nome FROM aparelhos WHERE pessoa = ?').get(chave)?.nome ?? null;

/** Turno da pessoa (pelo nome que vem do RH), conforme os turnos das Configurações. Diarista não tem turno. */
export function turnoDaPessoa(chave) {
  if (!chave?.startsWith('CLT:')) return null;
  const nome = db.prepare('SELECT turno FROM funcionarios WHERE matricula = ?').get(chave.slice(4))?.turno;
  if (!nome) return null;
  return config.turnos.find(t => t.nome.trim().toLowerCase() === nome.trim().toLowerCase()) ?? null;
}

/** Bloqueio para receber aparelho (quem perdeu ou quebrou), ou null. */
export const bloqueioDaPessoa = chave =>
  db.prepare('SELECT motivo, desde FROM pessoas_bloqueadas WHERE pessoa = ?').get(chave) ?? null;

/** Pessoa com o que o painel precisa saber antes de entregar: aparelho atual, bloqueio e turno. */
export const comSituacao = p => ({
  ...p, aparelho: aparelhoDaPessoa(p.chave), bloqueio: bloqueioDaPessoa(p.chave), turno: turnoDaPessoa(p.chave)?.nome ?? null
});
