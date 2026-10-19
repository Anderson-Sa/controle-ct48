// Importação da base de RH (CSV). Usada pelo comando npm run importar-rh e pelo painel.
// Colunas: matricula;nome;cargo;setor;turno (aceita ; ou , como separador)
import { db, transacao } from './db.js';

export function lerCsvRh(texto) {
  const linhas = String(texto).replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  if (!linhas.length) throw new Error('O arquivo está vazio.');
  const sep = linhas[0].includes(';') ? ';' : ',';
  const cab = linhas[0].split(sep).map(c => c.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''));
  const col = n => cab.indexOf(n);
  if (col('matricula') < 0 || col('nome') < 0) throw new Error('O arquivo precisa das colunas matricula e nome na primeira linha.');
  return linhas.slice(1).map(l => l.split(sep).map(c => c.trim()))
    .map(c => ({ matricula: c[col('matricula')]?.replace(/\D/g, ''), nome: c[col('nome')], cargo: c[col('cargo')], setor: c[col('setor')], turno: c[col('turno')] }))
    .filter(r => r.matricula && r.nome);
}

/** Substitui a cópia local da base de RH. Devolve quantos funcionários entraram. */
export function importarRh(registros) {
  if (!registros.length) throw new Error('Nenhum funcionário válido no arquivo (precisa de matrícula e nome).');
  transacao(() => {
    db.exec('DELETE FROM funcionarios');
    const ins = db.prepare('INSERT OR REPLACE INTO funcionarios (matricula, nome, cargo, setor, turno) VALUES (?, ?, ?, ?, ?)');
    for (const r of registros) ins.run(r.matricula, r.nome, r.cargo || null, r.setor || null, r.turno || null);
  });
  return registros.length;
}
