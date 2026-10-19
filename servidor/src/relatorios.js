// Relatórios: monta as sessões de uso (entrega -> devolução) a partir do histórico e resume o período.
import { db } from './db.js';
import { pessoaJSON, turnoDaPessoa } from './pessoas.js';
import { prazoDevolucao } from './alertas.js';

const MIN = 60000, HORA = 60 * MIN, DIA = 24 * HORA;
const diaLocal = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const inicioDoDia = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const arred = (n, casas = 1) => +n.toFixed(casas);

/**
 * Sessões de uso que encostam no intervalo [ini, fim]. Sessão aberta = aparelho ainda em uso.
 * Lê só o histórico do período (mais 1 dia antes, para pegar quem pegou o aparelho na véspera),
 * em vez do histórico inteiro: o relatório não fica mais lento com o passar dos meses.
 */
export function sessoes(ini, fim) {
  const desde = ini - DIA;
  const eventos = db.prepare(`SELECT t, evento, aparelho_id, pessoa, msg FROM historico
    WHERE t >= ? AND t <= ? AND evento IN ('entrega', 'devolucao', 'bloqueio', 'manutencao') AND aparelho_id IS NOT NULL
    ORDER BY t, id`).all(desde, fim);
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
  const atual = db.prepare('SELECT pessoa, desde FROM aparelhos WHERE id = ?');
  for (const s of abertas.values()) {
    if (atual.get(s.aparelho_id)?.pessoa === s.pessoa) lista.push({ ...s, fim: null, como: null });
  }
  // Em uso há mais tempo que a janela lida (raro): a entrega fica antes do "desde"
  for (const a of db.prepare('SELECT id, pessoa, desde FROM aparelhos WHERE pessoa IS NOT NULL AND desde < ?').all(desde)) {
    lista.push({ aparelho_id: a.id, pessoa: a.pessoa, inicio: a.desde, fim: null, como: null });
  }
  return lista.filter(s => (s.fim ?? fim) >= ini && s.inicio <= fim);
}

/** Minutos de atraso da devolução em relação ao prazo (fim do turno + tolerância, ou tempo máximo). 0 = no prazo. */
function atrasoMin(s, agora) {
  const limite = prazoDevolucao({ desde: s.inicio, pessoa: s.pessoa }).limite;
  return Math.max(0, Math.round(((s.fim ?? agora) - limite) / MIN));
}

/** Atrasos de uma pessoa nos últimos 90 dias (aba Pessoas). */
export function atrasosDaPessoa(chave) {
  const agora = Date.now();
  const minhas = sessoes(agora - 90 * DIA, agora).filter(s => s.pessoa === chave);
  const atrasos = minhas.map(s => atrasoMin(s, agora)).filter(m => m > 0);
  return { usos90: minhas.length, atrasos: atrasos.length, atrasoMedioMin: atrasos.length ? Math.round(atrasos.reduce((a, b) => a + b, 0) / atrasos.length) : 0 };
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
      const turno = chave?.startsWith('DIA:') ? 'Diaristas' : (turnoDaPessoa(chave)?.nome ?? 'Sem turno');
      pessoas.set(chave, { nome: p?.nome ?? chave, ident: p?.ident ?? '', setor: chave?.startsWith('DIA:') ? 'Diaristas' : (setor || 'Sem setor'), turno });
    }
    return pessoas.get(chave);
  };
  // Parte de cada sessão dentro do período, e atraso de cada uma
  const recorte = s => Math.max(0, Math.min(s.fim ?? fim, fim) - Math.max(s.inicio, ini));
  for (const s of lista) s.atraso = atrasoMin(s, fim);

  // Quantos aparelhos em uso num instante: inícios até t menos fins até t (busca binária nas listas ordenadas)
  const inicios = lista.map(s => s.inicio).sort((a, b) => a - b);
  const fins = lista.map(s => s.fim ?? Infinity).sort((a, b) => a - b);
  const ate = (v, t) => { let lo = 0, hi = v.length; while (lo < hi) { const m = (lo + hi) >> 1; if (v[m] <= t) lo = m + 1; else hi = m; } return lo; };
  const emUsoEm = t => ate(inicios, t) - ate(fins, t);

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
    porDia.push({ dia: k, entregas: lista.filter(s => s.inicio >= dIni && s.inicio < dIni + DIA).length, horas: arred(horas, 2), pico: picoDia[k] ?? 0 });
  }

  // Por hora do dia e mapa de calor (dia da semana × hora): média de aparelhos em uso na metade de cada hora
  const somaHora = Array(24).fill(0), nHora = Array(24).fill(0);
  const somaMapa = Array.from({ length: 7 }, () => Array(24).fill(0)), nMapa = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (let d = ini; d <= fim; d += DIA) {
    const base = inicioDoDia(d), semana = new Date(base).getDay();
    for (let h = 0; h < 24; h++) {
      const t = base + h * HORA + HORA / 2;
      if (t > fim || t < ini) continue;
      const n = emUsoEm(t);
      somaHora[h] += n; nHora[h]++;
      somaMapa[semana][h] += n; nMapa[semana][h]++;
    }
  }
  const porHora = somaHora.map((s, h) => ({ hora: h, media: nHora[h] ? arred(s / nHora[h], 2) : 0 }));
  const mapaCalor = somaMapa.map((linha, semana) => linha.map((s, h) => (nMapa[semana][h] ? arred(s / nMapa[semana][h]) : null)));

  // Por aparelho, com os problemas registrados no período
  const periodoH = (fim - ini) / HORA;
  const problemas = new Map();
  for (const e of db.prepare(`SELECT aparelho_id AS id, evento, msg FROM historico
      WHERE t >= ? AND aparelho_id IS NOT NULL AND evento IN ('saiu_area', 'recusado', 'manutencao', 'bloqueio')`).all(ini)) {
    const p = problemas.get(e.id) ?? { saidas: 0, qrFalsos: 0, manutencoes: 0, bloqueios: 0 };
    if (e.evento === 'saiu_area') p.saidas++;
    else if (e.evento === 'recusado') p.qrFalsos++;
    else if (e.evento === 'bloqueio') p.bloqueios++;
    else if (/ marcado como /.test(e.msg)) p.manutencoes++;
    problemas.set(e.id, p);
  }
  const porAparelho = aparelhos.filter(a => a.token_hash || lista.some(s => s.aparelho_id === a.id)).map(a => {
    const minhas = lista.filter(s => s.aparelho_id === a.id);
    const horas = minhas.reduce((soma, s) => soma + recorte(s), 0) / HORA;
    return {
      nome: a.nome, manutencao: a.manutencao, usos: minhas.filter(s => s.inicio >= ini).length, horas: arred(horas, 2),
      ocupacao: periodoH ? Math.round(horas / periodoH * 100) : 0,
      ultimo: minhas.reduce((m, s) => Math.max(m, s.inicio), 0) || null
    };
  }).sort((a, b) => b.horas - a.horas);
  const comProblema = aparelhos.map(a => {
    const p = problemas.get(a.id) ?? { saidas: 0, qrFalsos: 0, manutencoes: 0, bloqueios: 0 };
    return { nome: a.nome, manutencao: a.manutencao, ...p, total: p.saidas + p.qrFalsos + p.manutencoes + p.bloqueios };
  }).filter(a => a.total > 0).sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome)).slice(0, 10);

  // Agrupamentos por pessoa, setor e turno
  const agrupar = chaveDe => {
    const m = new Map();
    for (const s of lista) {
      const k = chaveDe(s);
      const g = m.get(k) ?? { horas: 0, usos: 0, atrasos: 0, minAtraso: 0, durSoma: 0, durN: 0 };
      g.horas += recorte(s) / HORA;
      if (s.inicio >= ini) g.usos++;
      if (s.atraso > 0) { g.atrasos++; g.minAtraso += s.atraso; }
      if (s.fim) { g.durSoma += s.fim - s.inicio; g.durN++; }
      m.set(k, g);
    }
    return m;
  };
  const resumoGrupo = g => ({
    horas: arred(g.horas, 2), usos: g.usos, atrasos: g.atrasos,
    atrasoMedioMin: g.atrasos ? Math.round(g.minAtraso / g.atrasos) : 0,
    mediaUsoMin: g.durN ? Math.round(g.durSoma / g.durN / MIN) : null
  });
  const porPessoaTodos = [...agrupar(s => s.pessoa)].map(([k, g]) => ({ ...pessoa(k), ...resumoGrupo(g) }));
  const porPessoa = [...porPessoaTodos].sort((a, b) => b.horas - a.horas).slice(0, 10);
  const maisAtrasam = porPessoaTodos.filter(p => p.atrasos > 0).sort((a, b) => b.atrasos - a.atrasos || b.atrasoMedioMin - a.atrasoMedioMin).slice(0, 10);
  const porSetor = [...agrupar(s => pessoa(s.pessoa).setor)].map(([setor, g]) => ({ setor, ...resumoGrupo(g) })).sort((a, b) => b.horas - a.horas);
  const ORDEM_TURNO = t => (t === 'Diaristas' ? 'zz' : t === 'Sem turno' ? 'zzz' : t);
  const porTurno = [...agrupar(s => pessoa(s.pessoa).turno)].map(([turno, g]) => ({ turno, ...resumoGrupo(g) }))
    .sort((a, b) => ORDEM_TURNO(a.turno).localeCompare(ORDEM_TURNO(b.turno), 'pt-BR'));

  // Indicadores
  const doPeriodo = lista.filter(s => s.inicio >= ini);
  const fechadas = doPeriodo.filter(s => s.fim);
  const devolucoes = lista.filter(s => s.fim && s.fim >= ini && ['qr', 'painel'].includes(s.como));
  const conta = ev => db.prepare('SELECT COUNT(*) AS n FROM historico WHERE evento = ? AND t >= ?').get(ev, ini).n;
  const atrasadas = lista.filter(s => s.atraso > 0 && (s.fim ?? fim) >= ini);

  return {
    ini, fim, dias,
    kpis: {
      entregas: doPeriodo.length,
      horasUso: arred(lista.reduce((soma, s) => soma + recorte(s), 0) / HORA),
      mediaUsoMin: fechadas.length ? Math.round(fechadas.reduce((soma, s) => soma + (s.fim - s.inicio), 0) / fechadas.length / MIN) : null,
      pico,
      devolucoesQrPct: devolucoes.length ? Math.round(devolucoes.filter(s => s.como === 'qr').length / devolucoes.length * 100) : null,
      atrasos: atrasadas.length,
      atrasosPct: lista.length ? Math.round(atrasadas.length / lista.length * 100) : 0,
      saidasArea: conta('saiu_area'),
      qrFalsos: conta('recusado'),
      aparelhosParados: porAparelho.filter(a => a.usos === 0 && !a.manutencao).map(a => a.nome)
    },
    porDia, porHora, mapaCalor, porAparelho, comProblema, porPessoa, maisAtrasam, porSetor, porTurno,
    sessoes: lista.sort((a, b) => b.inicio - a.inicio).slice(0, 5000).map(s => ({
      aparelho: nomeAparelho.get(s.aparelho_id) ?? '?', ...pessoa(s.pessoa), inicio: s.inicio, fim: s.fim, como: s.como, atrasoMin: s.atraso
    }))
  };
}
