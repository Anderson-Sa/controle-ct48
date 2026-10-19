// Relatórios: monta as sessões de uso (entrega -> devolução) a partir do histórico e resume o período.
import { db } from './db.js';
import { pessoaJSON } from './pessoas.js';

const HORA = 3600000, DIA = 24 * HORA;
const diaLocal = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const inicioDoDia = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

/** Sessões de uso que encostam no intervalo [ini, fim]. Sessão aberta = aparelho ainda em uso. */
export function sessoes(ini, fim) {
  const eventos = db.prepare(`SELECT t, evento, aparelho_id, pessoa, msg FROM historico
    WHERE evento IN ('entrega', 'devolucao', 'bloqueio', 'manutencao') AND aparelho_id IS NOT NULL AND t <= ?
    ORDER BY t, id`).all(fim);
  const abertas = new Map(), lista = [];
  const fechar = (id, t, como) => {
    const s = abertas.get(id);
    if (s) { lista.push({ ...s, fim: t, como }); abertas.delete(id); }
  };
  for (const e of eventos) {
    if (e.evento === 'entrega') {
      fechar(e.aparelho_id, e.t, 'sem registro');
      abertas.set(e.aparelho_id, { aparelho_id: e.aparelho_id, pessoa: e.pessoa, inicio: e.t });
    } else if (e.evento === 'devolucao') {
      fechar(e.aparelho_id, e.t, /Devolução por QR/.test(e.msg) ? 'qr' : 'painel');
    } else if (e.evento === 'bloqueio') {
      fechar(e.aparelho_id, e.t, 'bloqueio');
    } else if (/marcado como perdido/.test(e.msg)) {
      fechar(e.aparelho_id, e.t, 'perdido');
    }
  }
  // Ainda abertas: só valem se o aparelho continua com a mesma pessoa
  for (const s of abertas.values()) {
    const a = db.prepare('SELECT pessoa, desde FROM aparelhos WHERE id = ?').get(s.aparelho_id);
    if (a?.pessoa === s.pessoa) lista.push({ ...s, fim: null, como: null });
  }
  return lista.filter(s => (s.fim ?? fim) >= ini && s.inicio <= fim);
}

export function relatorio(dias) {
  const fim = Date.now();
  const ini = dias === 1 ? inicioDoDia(fim) : inicioDoDia(fim - (dias - 1) * DIA);
  const lista = sessoes(ini, fim);
  const aparelhos = db.prepare('SELECT id, nome, manutencao, token_hash FROM aparelhos ORDER BY nome').all();
  const nomeAparelho = new Map(aparelhos.map(a => [a.id, a.nome]));
  const pessoas = new Map();
  const pessoa = chave => {
    if (!pessoas.has(chave)) {
      const p = pessoaJSON(chave);
      const setor = chave?.startsWith('CLT:') ? db.prepare('SELECT setor FROM funcionarios WHERE matricula = ?').get(chave.slice(4))?.setor : null;
      pessoas.set(chave, { nome: p?.nome ?? chave, ident: p?.ident ?? '', setor: chave?.startsWith('DIA:') ? 'Diaristas' : (setor || 'Sem setor') });
    }
    return pessoas.get(chave);
  };
  // Parte de cada sessão dentro do período
  const recorte = s => Math.max(0, Math.min(s.fim ?? fim, fim) - Math.max(s.inicio, ini));

  // Pico de aparelhos em uso ao mesmo tempo (varredura dos inícios e fins)
  const pontos = [];
  for (const s of lista) { pontos.push([Math.max(s.inicio, ini), 1]); pontos.push([Math.min(s.fim ?? fim, fim), -1]); }
  pontos.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let atual = 0, pico = { qtd: 0, t: null };
  const picoDia = {};
  for (const [t, d] of pontos) {
    atual += d;
    if (atual > pico.qtd) pico = { qtd: atual, t };
    const k = diaLocal(t);
    if (atual > (picoDia[k] ?? 0)) picoDia[k] = atual;
  }

  // Por dia
  const porDia = [];
  for (let d = ini; d <= fim; d += DIA) {
    const k = diaLocal(d), dIni = inicioDoDia(d), dFim = Math.min(dIni + DIA, fim);
    const horas = lista.reduce((soma, s) => soma + Math.max(0, Math.min(s.fim ?? fim, dFim) - Math.max(s.inicio, dIni)), 0) / HORA;
    porDia.push({ dia: k, entregas: lista.filter(s => s.inicio >= dIni && s.inicio < dIni + DIA).length, horas: +horas.toFixed(2), pico: picoDia[k] ?? 0 });
  }

  // Por hora do dia: média de aparelhos em uso na metade de cada hora
  const porHora = Array.from({ length: 24 }, (_, h) => {
    let soma = 0, n = 0;
    for (let d = ini; d <= fim; d += DIA) {
      const t = inicioDoDia(d) + h * HORA + HORA / 2;
      if (t > fim || t < ini) continue;
      n++;
      soma += lista.filter(s => s.inicio <= t && (s.fim ?? fim) >= t).length;
    }
    return { hora: h, media: n ? +(soma / n).toFixed(2) : 0 };
  });

  // Por aparelho
  const periodoH = (fim - ini) / HORA;
  const porAparelho = aparelhos.filter(a => a.token_hash || lista.some(s => s.aparelho_id === a.id)).map(a => {
    const minhas = lista.filter(s => s.aparelho_id === a.id);
    const horas = minhas.reduce((soma, s) => soma + recorte(s), 0) / HORA;
    return {
      nome: a.nome, manutencao: a.manutencao, usos: minhas.filter(s => s.inicio >= ini).length, horas: +horas.toFixed(2),
      ocupacao: periodoH ? Math.round(horas / periodoH * 100) : 0,
      ultimo: minhas.reduce((m, s) => Math.max(m, s.inicio), 0) || null
    };
  }).sort((a, b) => b.horas - a.horas);

  // Por pessoa e por setor
  const agrupar = chaveDe => {
    const m = new Map();
    for (const s of lista) {
      const k = chaveDe(s);
      const g = m.get(k) ?? { horas: 0, usos: 0 };
      g.horas += recorte(s) / HORA;
      if (s.inicio >= ini) g.usos++;
      m.set(k, g);
    }
    return m;
  };
  const porPessoa = [...agrupar(s => s.pessoa)].map(([k, g]) => ({ ...pessoa(k), horas: +g.horas.toFixed(2), usos: g.usos }))
    .sort((a, b) => b.horas - a.horas).slice(0, 10);
  const porSetor = [...agrupar(s => pessoa(s.pessoa).setor)].map(([setor, g]) => ({ setor, horas: +g.horas.toFixed(2), usos: g.usos }))
    .sort((a, b) => b.horas - a.horas);

  // Indicadores
  const doPeriodo = lista.filter(s => s.inicio >= ini);
  const fechadas = doPeriodo.filter(s => s.fim);
  const devolucoes = lista.filter(s => s.fim && s.fim >= ini && ['qr', 'painel'].includes(s.como));
  const conta = ev => db.prepare('SELECT COUNT(*) AS n FROM historico WHERE evento = ? AND t >= ?').get(ev, ini).n;

  return {
    ini, fim, dias,
    kpis: {
      entregas: doPeriodo.length,
      horasUso: +(lista.reduce((soma, s) => soma + recorte(s), 0) / HORA).toFixed(1),
      mediaUsoMin: fechadas.length ? Math.round(fechadas.reduce((soma, s) => soma + (s.fim - s.inicio), 0) / fechadas.length / 60000) : null,
      pico,
      devolucoesQrPct: devolucoes.length ? Math.round(devolucoes.filter(s => s.como === 'qr').length / devolucoes.length * 100) : null,
      saidasArea: conta('saiu_area'),
      qrFalsos: conta('recusado'),
      aparelhosParados: porAparelho.filter(a => a.usos === 0 && !a.manutencao).map(a => a.nome)
    },
    porDia, porHora, porAparelho, porPessoa, porSetor,
    sessoes: lista.sort((a, b) => b.inicio - a.inicio).slice(0, 5000).map(s => ({
      aparelho: nomeAparelho.get(s.aparelho_id) ?? '?', ...pessoa(s.pessoa), inicio: s.inicio, fim: s.fim, como: s.como
    }))
  };
}
