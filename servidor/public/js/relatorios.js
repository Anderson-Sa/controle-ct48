'use strict';
/* ---------- Relatórios ---------- */
const rel = { dias: 7, dados: null, carregadoEm: 0 };

const horasFmt = h => h >= 10 ? `${Math.round(h)} h` : h >= 1 ? `${h.toFixed(1).replace('.', ',')} h` : `${Math.round(h * 60)} min`;
const numFmt = n => n.toLocaleString(LOCALE, { maximumFractionDigits: 1 });
const DIA_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

async function carregarRelatorio(forcar) {
  if (aba !== 'relatorios') return;
  // O relatório é mais pesado: atualiza no máximo a cada 60 s enquanto a aba está aberta
  if (!forcar && rel.dados && Date.now() - rel.carregadoEm < 60000) return;
  try { rel.dados = await api('GET', '/api/relatorios?dias=' + rel.dias); } catch { return; }
  rel.carregadoEm = Date.now();
  renderRelatorio();
}
AO_ATUALIZAR.push(() => carregarRelatorio(false));
registrarPaginacao('rel-aparelhos', () => rel.dados && renderRelatorio());

// Escala "redonda" para o eixo: 0, metade e o topo
function topoEixo(max) {
  if (max <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(max)), n = max / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

/** Barras verticais em HTML: uma série, com grade discreta e dica ao passar o mouse. */
function graficoBarras(el, itens, { formato, rotuloDica }) {
  const max = topoEixo(Math.max(...itens.map(i => i.valor), 0));
  const marcar = Math.ceil(itens.length / 12);   // rótulos do eixo X sem encavalar
  el.innerHTML = `
    <div class="gb-area">
      <div class="gb-grade" aria-hidden="true">${[1, 0.5, 0].map(f => `<span><i>${formato(max * f)}</i></span>`).join('')}</div>
      <div class="gb-barras">${itens.map((i, k) => `
        <div class="gb-col" tabindex="0" data-k="${k}" aria-label="${esc(i.rotuloLongo)}: ${esc(formato(i.valor))}">
          <span class="gb-barra${i.valor ? '' : ' zero'}" data-alt="${i.valor / max * 100}"></span>
        </div>`).join('')}</div>
      <div class="gb-dica" hidden></div>
    </div>
    <div class="gb-eixo" aria-hidden="true">${itens.map((i, k) => `<span>${k % marcar === 0 ? esc(i.rotulo) : ''}</span>`).join('')}</div>`;
  for (const b of el.querySelectorAll('.gb-barra')) b.style.height = b.dataset.alt + '%';
  const dica = el.querySelector('.gb-dica'), area = el.querySelector('.gb-area');
  const mostrar = col => {
    const i = itens[col.dataset.k];
    dica.innerHTML = `<b>${esc(i.rotuloLongo)}</b>${esc(rotuloDica(i))}`;
    dica.hidden = false;
    const r = col.getBoundingClientRect(), base = area.getBoundingClientRect();
    const x = Math.min(Math.max(r.left - base.left + r.width / 2, 70), base.width - 70);
    dica.style.left = x + 'px';
    el.querySelectorAll('.gb-col').forEach(c => c.classList.toggle('ativo', c === col));
  };
  const esconder = () => { dica.hidden = true; el.querySelectorAll('.gb-col').forEach(c => c.classList.remove('ativo')); };
  el.querySelectorAll('.gb-col').forEach(c => {
    c.addEventListener('mouseenter', () => mostrar(c));
    c.addEventListener('focus', () => mostrar(c));
    c.addEventListener('blur', esconder);
  });
  area.addEventListener('mouseleave', esconder);
}

/** Barras horizontais em lista: nome, barra e números ao lado (servem de tabela). */
function listaBarras(el, itens, vazio) {
  if (!itens.length) { el.innerHTML = `<p class="muted h-vazio">${vazio}</p>`; return; }
  const max = Math.max(...itens.map(i => i.valor), 0) || 1;
  el.innerHTML = `<div class="lb">${itens.map(i => `
    <div class="lb-linha">
      <span class="lb-nome">${i.nome}</span>
      <span class="lb-trilho"><span class="lb-barra${i.valor ? '' : ' zero'}" data-larg="${i.valor / max * 100}"></span></span>
      <span class="lb-num">${i.texto}</span>
    </div>`).join('')}</div>`;
  for (const b of el.querySelectorAll('.lb-barra')) b.style.width = b.dataset.larg + '%';
}

function renderRelatorio() {
  const r = rel.dados, k = r.kpis;
  const ini = new Date(r.ini), fim = new Date(r.fim);
  $('#rel-periodo').textContent = r.dias === 1
    ? `Hoje, ${ini.toLocaleDateString(LOCALE)}, até ${hora(r.fim)}`
    : `De ${ini.toLocaleDateString(LOCALE)} a ${fim.toLocaleDateString(LOCALE)} (${r.dias} dias), até ${hora(r.fim)}`;

  const tile = (num, rot, extra = '', cls = '') => `<div class="stat ${cls}"><span class="stat-num">${num}</span><span class="stat-rot">${rot}</span>${extra ? `<span class="stat-extra">${extra}</span>` : ''}</div>`;
  const alertas = k.saidasArea + k.qrFalsos;
  $('#rel-kpis').innerHTML = [
    tile(k.entregas, 'Entregas'),
    tile(horasFmt(k.horasUso), 'Horas de uso somadas'),
    tile(k.mediaUsoMin != null ? dur(k.mediaUsoMin * 60000) : '–', 'Uso médio por entrega'),
    tile(k.pico.qtd, 'Pico ao mesmo tempo', k.pico.t ? `${new Date(k.pico.t).toLocaleDateString(LOCALE, { day: '2-digit', month: '2-digit' })} às ${hora(k.pico.t)}` : ''),
    tile(k.devolucoesQrPct != null ? k.devolucoesQrPct + '%' : '–', 'Devoluções por QR'),
    tile(k.atrasos, 'Devoluções atrasadas', `${k.atrasosPct}% das entregas`, k.atrasos ? 'warn' : ''),
    tile(alertas, 'Alertas', `${k.saidasArea} saída${k.saidasArea === 1 ? '' : 's'} da área · ${k.qrFalsos} QR falso${k.qrFalsos === 1 ? '' : 's'}`, alertas ? 'bad' : '')
  ].join('');

  // Por dia (não faz sentido com 1 dia só)
  $('#rel-dia-card').hidden = r.dias === 1;
  if (r.dias > 1) {
    graficoBarras($('#rel-dia'), r.porDia.map(d => {
      const dt = new Date(d.dia + 'T12:00:00');
      return {
        valor: d.horas,
        rotulo: r.dias > 14 ? `${dt.getDate()}/${dt.getMonth() + 1}` : `${t(DIA_SEMANA[dt.getDay()])} ${dt.getDate()}`,
        rotuloLongo: dt.toLocaleDateString(LOCALE, { weekday: 'long', day: '2-digit', month: '2-digit' }),
        d
      };
    }), { formato: horasFmt, rotuloDica: i => `${horasFmt(i.valor)} de uso · ${i.d.entregas} entrega${i.d.entregas === 1 ? '' : 's'} · pico de ${i.d.pico}` });
  }

  graficoBarras($('#rel-hora'), r.porHora.map(h => ({
    valor: h.media, rotulo: IDIOMA === 'zh' ? `${h.hora}时` : `${h.hora}h`, rotuloLongo: `${String(h.hora).padStart(2, '0')}:00 às ${String(h.hora).padStart(2, '0')}:59`
  })), { formato: v => numFmt(v), rotuloDica: i => `${numFmt(i.valor)} aparelho${i.valor === 1 ? '' : 's'} em uso, em média` });

  const pgAp = paginar(r.porAparelho, 'rel-aparelhos', 10);
  listaBarras($('#rel-aparelhos'), pgAp.itens.map(a => ({
    valor: a.horas,
    nome: `<span class="tag-aparelho">${esc(a.nome)}</span>${a.manutencao ? ` <span class="pill warn">${MANUT[a.manutencao]}</span>` : a.usos === 0 ? ' <span class="pill">Parado</span>' : ''}`,
    texto: `<b>${horasFmt(a.horas)}</b><span class="muted">${a.usos} uso${a.usos === 1 ? '' : 's'} · ${a.ocupacao}% do tempo</span>`
  })), 'Nenhum aparelho registrado.');
  // Escala das barras igual em todas as páginas (o mais usado do período = barra cheia)
  const maxAp = Math.max(...r.porAparelho.map(a => a.horas), 1);
  for (const [i, el] of [...$$('#rel-aparelhos .lb-barra')].entries()) el.style.width = (pgAp.itens[i].horas / maxAp * 100) + '%';
  $('#rel-aparelhos').insertAdjacentHTML('beforeend', htmlPaginacao(pgAp, 'aparelhos'));

  listaBarras($('#rel-setores'), r.porSetor.map(s => ({
    valor: s.horas, nome: esc(s.setor),
    texto: `<b>${horasFmt(s.horas)}</b><span class="muted">${s.usos} uso${s.usos === 1 ? '' : 's'}</span>`
  })), 'Nenhum uso no período.');

  listaBarras($('#rel-pessoas'), r.porPessoa.map((p, i) => ({
    valor: p.horas, nome: `<span class="lb-pos">${i + 1}</span><span><b>${esc(p.nome)}</b> <span class="muted">${esc(p.ident)} · ${esc(p.setor)}</span></span>`,
    texto: `<b>${horasFmt(p.horas)}</b><span class="muted">${p.usos} uso${p.usos === 1 ? '' : 's'}</span>`
  })), 'Nenhum uso no período.');

  renderTurnos(r.porTurno);
  renderMapaCalor(r.mapaCalor);

  listaBarras($('#rel-problemas'), r.comProblema.map(a => ({
    valor: a.total,
    nome: `<span class="tag-aparelho">${esc(a.nome)}</span>${a.manutencao ? ` <span class="pill warn">${MANUT[a.manutencao]}</span>` : ''}`,
    texto: `<b>${a.total} ocorrência${a.total === 1 ? '' : 's'}</b><span class="muted">${[
      a.saidas && `${a.saidas} saída${a.saidas > 1 ? 's' : ''} da área`, a.qrFalsos && `${a.qrFalsos} QR falso${a.qrFalsos > 1 ? 's' : ''}`,
      a.manutencoes && `${a.manutencoes} manutenção${a.manutencoes > 1 ? 'ões' : ''}`, a.bloqueios && `${a.bloqueios} bloqueio${a.bloqueios > 1 ? 's' : ''}`
    ].filter(Boolean).join(' · ')}</span>`
  })), 'Nenhum problema registrado no período.');

  listaBarras($('#rel-atrasos'), r.maisAtrasam.map((p, i) => ({
    valor: p.atrasos, nome: `<span class="lb-pos">${i + 1}</span><span><b>${esc(p.nome)}</b> <span class="muted">${esc(p.turno)} · ${esc(p.setor)}</span></span>`,
    texto: `<b>${p.atrasos} atraso${p.atrasos > 1 ? 's' : ''}</b><span class="muted">em média ${dur(p.atrasoMedioMin * 60000)} · ${p.usos} uso${p.usos === 1 ? '' : 's'}</span>`
  })), 'Ninguém devolveu atrasado no período. 👏');
}

/** Tabela dos turnos lado a lado, com barra das horas de uso. */
function renderTurnos(turnos) {
  const el = $('#rel-turnos');
  if (!turnos.length) { el.innerHTML = '<p class="muted h-vazio">Nenhum uso no período.</p>'; return; }
  const max = Math.max(...turnos.map(t => t.horas), 1);
  el.innerHTML = `<div class="tabela-rolagem"><table class="rel-turnos">
    <thead><tr><th>Turno</th><th>Horas de uso</th><th>Entregas</th><th>Uso médio</th><th>Atrasos</th><th>Atraso médio</th></tr></thead>
    <tbody>${turnos.map(t => `<tr>
      <td><b>${esc(t.turno)}</b></td>
      <td class="rt-horas"><span class="lb-trilho"><span class="lb-barra" data-larg="${t.horas / max * 100}"></span></span><b>${horasFmt(t.horas)}</b></td>
      <td>${t.usos}</td>
      <td>${t.mediaUsoMin != null ? dur(t.mediaUsoMin * 60000) : '–'}</td>
      <td>${t.atrasos ? `<b class="${t.atrasos / Math.max(t.usos, 1) > 0.08 ? 'prazo-vencido' : ''}">${t.atrasos}</b> <span class="muted">(${Math.round(t.atrasos / Math.max(t.usos, 1) * 100)}%)</span>` : '0'}</td>
      <td>${t.atrasos ? dur(t.atrasoMedioMin * 60000) : '–'}</td>
    </tr>`).join('')}</tbody></table></div>`;
  for (const b of el.querySelectorAll('.lb-barra')) b.style.width = b.dataset.larg + '%';
}

/** Mapa de calor: dias da semana (linhas) × horas (colunas), uma cor só, do claro ao escuro. */
function renderMapaCalor(mapa) {
  const el = $('#rel-mapa');
  const ordem = [1, 2, 3, 4, 5, 6, 0];   // segunda a domingo
  const NOMES_DIA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const valores = mapa.flat().filter(v => v != null);
  if (!valores.length) { el.innerHTML = '<p class="muted h-vazio">Período curto demais para o mapa.</p>'; return; }
  const max = Math.max(...valores, 1);
  el.innerHTML = `<div class="mapa-calor">
    <span></span>${Array.from({ length: 24 }, (_, h) => `<span class="mc-hora" translate="no">${h % 3 === 0 ? h + 'h' : ''}</span>`).join('')}
    ${ordem.map(d => `<span class="mc-dia">${NOMES_DIA[d]}</span>${mapa[d].map((v, h) => v == null
      ? `<span class="mc-cel vazia" title="${NOMES_DIA[d]} ${h}h: sem dados no período"></span>`
      : `<span class="mc-cel" data-int="${v / max}" title="${t(NOMES_DIA[d])}, ${String(h).padStart(2, '0')}h: ${numFmt(v)} aparelhos em uso em média"></span>`).join('')}`).join('')}
  </div>
  <div class="mc-legenda"><span>0</span><span class="mc-escala"></span><span>${numFmt(max)} aparelhos</span></div>`;
  for (const c of el.querySelectorAll('.mc-cel[data-int]')) {
    const i = Number(c.dataset.int);
    c.style.background = `color-mix(in srgb, var(--accent) ${Math.round(8 + i * 92)}%, var(--surface))`;
  }
}

$$('[data-rel-dias]').forEach(b => b.addEventListener('click', () => {
  rel.dias = Number(b.dataset.relDias);
  primeiraPagina('rel-aparelhos');
  $$('[data-rel-dias]').forEach(x => x.setAttribute('aria-pressed', x === b));
  carregarRelatorio(true);
}));
$('#rel-imprimir').addEventListener('click', () => window.print());
$('#rel-csv').addEventListener('click', () => {
  if (!rel.dados) return;
  const cel = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const COMO = { qr: 'QR de devolução', painel: 'Recebido no painel', bloqueio: 'Bloqueio remoto', perdido: 'Marcado como perdido', 'sem registro': 'Sem registro de devolução' };
  const linhas = [['Aparelho', 'Pessoa', 'Identificação', 'Setor', 'Turno', 'Entregue em', 'Devolvido em', 'Tempo de uso', 'Como terminou', 'Atraso']]
    .concat(rel.dados.sessoes.map(s => [s.aparelho, s.nome, s.ident, s.setor, s.turno, dataHora(s.inicio), s.fim ? dataHora(s.fim) : 'Ainda em uso',
      dur((s.fim ?? Date.now()) - s.inicio), s.fim ? COMO[s.como] ?? '' : '', s.atrasoMin ? dur(s.atrasoMin * 60000) : '']));
  const csv = '﻿' + linhas.map(l => l.map(cel).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `usos-ct48-${rel.dias}dias-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
