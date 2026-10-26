'use strict';
/* Seção Histórico: linha do tempo com filtros e CSV. Também define ícones e títulos de eventos usados em Pessoas. */

const H_PAGINA = 50;
const hist = { dias: 1, busca: '', aparelho: '', cats: new Set(['entrega', 'devolucao', 'alerta']), dados: null, assinatura: '', carregando: false };

const ICONES = {
  entrega: svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  devolucao: svg('<path d="M19 12H5M11 6l-6 6 6 6"/>'),
  bloqueio: svg('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  alerta: svg('<path d="M12 4 2.5 20h19L12 4z"/><path d="M12 10v4M12 17.5v.01"/>'),
  ok: svg('<path d="m5 12.5 4.5 4.5L19 7"/>'),
  qr: svg('<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2z"/>'),
  cadastro: svg('<path d="M12 5v14M5 12h14"/>')
};
// evento do servidor -> categoria do filtro, ícone e cor
const EVENTO = {
  entrega:      { cat: 'entrega',   ic: 'entrega',   cor: 'ok' },
  devolucao:    { cat: 'devolucao', ic: 'devolucao', cor: 'accent' },
  bloqueio:     { cat: 'devolucao', ic: 'bloqueio',  cor: 'bad' },
  recusado:     { cat: 'alerta',    ic: 'alerta',    cor: 'bad' },
  saiu_area:    { cat: 'alerta',    ic: 'alerta',    cor: 'bad' },
  voltou_area:  { cat: 'alerta',    ic: 'ok',        cor: 'ok' },
  qr_liberacao: { cat: 'qr',        ic: 'qr',        cor: 'warn' },
  qr_devolucao: { cat: 'qr',        ic: 'qr',        cor: 'warn' },
  manutencao:   { cat: 'cadastro',  ic: 'bloqueio',  cor: 'warn' },
  pessoa:       { cat: 'cadastro',  ic: 'alerta',    cor: 'bad' },
  cadastro:     { cat: 'cadastro',  ic: 'cadastro',  cor: 'muted' }
};
const infoEvento = h => EVENTO[h.evento] ?? EVENTO.cadastro;

// Frase curta para o título; o texto completo do registro aparece ao passar o mouse
function tituloEvento(h) {
  const quem = h.pessoa?.nome;
  switch (h.evento) {
    case 'entrega': return quem ? `Entregue para ${quem}` : 'Aparelho entregue';
    case 'devolucao': return quem ? `Devolvido por ${quem}` : 'Aparelho devolvido';
    case 'bloqueio': return quem ? `Bloqueado remotamente (estava com ${quem})` : 'Bloqueado remotamente';
    case 'saiu_area': return quem ? `Saiu da área da empresa com ${quem}` : 'Saiu da área da empresa';
    case 'voltou_area': return 'Voltou para a área da empresa';
    case 'recusado': return /devolução/.test(h.msg) ? 'QR de devolução falso recusado' : 'QR falso recusado';
    case 'qr_liberacao': return quem ? `QR de liberação gerado para ${quem}` : 'QR de liberação gerado';
    case 'qr_devolucao': return 'QR de devolução gerado';
    default: return h.msg;
  }
}
function metaEvento(h) {
  const m = [];
  if (h.aparelho) m.push(`<span class="tag-aparelho">${esc(h.aparelho)}</span>`);
  if (h.pessoa?.ident) m.push(`<span>${esc(h.pessoa.ident)}${h.pessoa.tipo === 'DIA' ? ' · diarista' : ''}</span>`);
  if (h.duracao != null) m.push(`<span>usou por ${dur(h.duracao)}</span>`);
  if (h.evento === 'devolucao') m.push(`<span>${/Devolução por QR/.test(h.msg) ? 'via QR' : 'recebido no painel'}</span>`);
  if (h.adm) m.push(`<span>por ${esc(h.adm)}</span>`);
  return m.join('');
}

function diaRotulo(t) {
  const d = new Date(t), hoje = new Date();
  const zero = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dif = Math.round((zero(hoje) - zero(d)) / 86400000);
  if (dif === 0) return 'Hoje';
  if (dif === 1) return 'Ontem';
  const s = d.toLocaleDateString(LOCALE, { weekday: 'long', day: '2-digit', month: '2-digit' });
  return s[0].toUpperCase() + s.slice(1);
}

function filtrados() {
  const busca = semAcento(hist.busca.trim());
  return (hist.dados?.itens ?? []).filter(h =>
    hist.cats.has(infoEvento(h).cat)
    && (!hist.aparelho || h.aparelho === hist.aparelho)
    && (!busca || semAcento([h.msg, h.aparelho, h.pessoa?.nome, h.pessoa?.ident, h.adm].join(' ')).includes(busca)));
}

async function carregarHistorico() {
  if (hist.carregando) return;
  hist.carregando = true;
  try {
    const d = await api('GET', '/api/historico?dias=' + hist.dias);
    const assinatura = hist.dias + ':' + d.itens.length + ':' + (d.itens[0]?.id ?? '');
    hist.dados = d;
    if (assinatura !== hist.assinatura) { hist.assinatura = assinatura; renderHistorico(); }
  } catch (err) {
    if (err.status !== 401) $('#h-info').textContent = err.message;
  } finally { hist.carregando = false; }
}

function renderHistorico() {
  const todos = hist.dados?.itens ?? [];

  // Resumo do período (sem os filtros de tipo e busca)
  const conta = ev => todos.filter(h => ev.includes(h.evento)).length;
  const usos = todos.filter(h => h.duracao != null).map(h => h.duracao);
  const alertas = conta(['recusado', 'saiu_area']);
  $('#hs-entregas').textContent = conta(['entrega']);
  $('#hs-devolucoes').textContent = conta(['devolucao', 'bloqueio']);
  $('#hs-alertas').textContent = alertas;
  $('#hs-alertas').parentElement.className = 'stat' + (alertas ? ' bad' : '');
  $('#hs-media').textContent = usos.length ? dur(usos.reduce((a, b) => a + b, 0) / usos.length) : '–';

  // Aparelhos que aparecem no período, para o filtro
  const sel = $('#h-aparelho'), nomes = [...new Set(todos.map(h => h.aparelho).filter(Boolean))].sort();
  if (hist.aparelho && !nomes.includes(hist.aparelho)) nomes.unshift(hist.aparelho);
  const chaveSel = nomes.join('|');
  if (sel.dataset.nomes !== chaveSel) {
    sel.dataset.nomes = chaveSel;
    sel.innerHTML = '<option value="">Todos os aparelhos</option>' + nomes.map(n => `<option>${esc(n)}</option>`).join('');
  }
  sel.value = hist.aparelho;

  const lista = filtrados(), pg = paginar(lista, 'historico', H_PAGINA), parte = pg.itens;
  const porDia = {};
  for (const h of lista) { const r = diaRotulo(h.t); porDia[r] = (porDia[r] ?? 0) + 1; }
  let html = '', diaAtual = '';
  for (const h of parte) {
    const r = diaRotulo(h.t);
    if (r !== diaAtual) {
      diaAtual = r;
      html += `<div class="dia">${esc(r)}<span>${porDia[r]} evento${porDia[r] > 1 ? 's' : ''}</span></div>`;
    }
    const ev = infoEvento(h);
    html += `<div class="evento${h.tipo === 'bad' ? ' alerta' : ''}" title="${esc(h.msg)}">
      <time>${hora(h.t)}</time>
      <span class="ic c-${ev.cor}">${ICONES[ev.ic]}</span>
      <div class="txt"><span class="titulo">${esc(tituloEvento(h))}</span><div class="meta">${metaEvento(h)}</div></div>
    </div>`;
  }
  $('#historico').innerHTML = html || `<p class="muted h-vazio">${todos.length ? 'Nenhum evento com esses filtros.' : 'Nada registrado neste período.'}</p>`;
  $('#h-pag').innerHTML = htmlPaginacao(pg, 'eventos');
  $('#h-info').textContent = todos.length
    ? `${lista.length} de ${todos.length} eventos${hist.dados.cortado ? ' (só os mais recentes; escolha um período menor para ver tudo)' : ''}`
    : '';
}

$$('[data-dias]').forEach(b => b.addEventListener('click', () => {
  hist.dias = Number(b.dataset.dias);
  $$('[data-dias]').forEach(x => x.setAttribute('aria-pressed', x === b));
  primeiraPagina('historico'); hist.assinatura = '';
  carregarHistorico();
}));
$$('[data-cat]').forEach(b => b.addEventListener('click', () => {
  const c = b.dataset.cat, liga = !hist.cats.has(c);
  if (liga) hist.cats.add(c); else hist.cats.delete(c);
  b.setAttribute('aria-pressed', liga);
  primeiraPagina('historico');
  renderHistorico();
}));
$('#h-busca').addEventListener('input', e => { hist.busca = e.target.value; primeiraPagina('historico'); renderHistorico(); });
$('#h-aparelho').addEventListener('change', e => { hist.aparelho = e.target.value; primeiraPagina('historico'); renderHistorico(); });
registrarPaginacao('historico', renderHistorico);

$('#h-exportar').addEventListener('click', () => {
  const cel = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const linhas = [['Data e hora', 'Evento', 'Aparelho', 'Pessoa', 'Identificação', 'Tempo de uso', 'ADM', 'Registro completo']]
    .concat(filtrados().map(h => [dataHora(h.t), tituloEvento(h), h.aparelho, h.pessoa?.nome, h.pessoa?.ident,
      h.duracao != null ? dur(h.duracao) : '', h.adm, h.msg]));
  // ";" e BOM: o Excel em português abre direto, com os acentos certos
  const csv = '﻿' + linhas.map(l => l.map(cel).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `historico-ct48-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
