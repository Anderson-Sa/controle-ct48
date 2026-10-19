'use strict';
/* ---------- Relatórios ---------- */
const rel = { dias: 7, dados: null, carregadoEm: 0 };

const horasFmt = h => h >= 10 ? `${Math.round(h)} h` : h >= 1 ? `${h.toFixed(1).replace('.', ',')} h` : `${Math.round(h * 60)} min`;
const numFmt = n => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
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
    ? `Hoje, ${ini.toLocaleDateString('pt-BR')}, até ${hora(r.fim)}`
    : `De ${ini.toLocaleDateString('pt-BR')} a ${fim.toLocaleDateString('pt-BR')} (${r.dias} dias), até ${hora(r.fim)}`;

  const tile = (num, rot, extra = '', cls = '') => `<div class="stat ${cls}"><span class="stat-num">${num}</span><span class="stat-rot">${rot}</span>${extra ? `<span class="stat-extra">${extra}</span>` : ''}</div>`;
  const alertas = k.saidasArea + k.qrFalsos;
  $('#rel-kpis').innerHTML = [
    tile(k.entregas, 'Entregas'),
    tile(horasFmt(k.horasUso), 'Horas de uso somadas'),
    tile(k.mediaUsoMin != null ? dur(k.mediaUsoMin * 60000) : '–', 'Uso médio por entrega'),
    tile(k.pico.qtd, 'Pico ao mesmo tempo', k.pico.t ? `${new Date(k.pico.t).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${hora(k.pico.t)}` : ''),
    tile(k.devolucoesQrPct != null ? k.devolucoesQrPct + '%' : '–', 'Devoluções por QR'),
    tile(alertas, 'Alertas', `${k.saidasArea} saída${k.saidasArea === 1 ? '' : 's'} da área · ${k.qrFalsos} QR falso${k.qrFalsos === 1 ? '' : 's'}`, alertas ? 'bad' : '')
  ].join('');

  // Por dia (não faz sentido com 1 dia só)
  $('#rel-dia-card').hidden = r.dias === 1;
  if (r.dias > 1) {
    graficoBarras($('#rel-dia'), r.porDia.map(d => {
      const dt = new Date(d.dia + 'T12:00:00');
      return {
        valor: d.horas,
        rotulo: r.dias > 14 ? `${dt.getDate()}/${dt.getMonth() + 1}` : `${DIA_SEMANA[dt.getDay()]} ${dt.getDate()}`,
        rotuloLongo: dt.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' }),
        d
      };
    }), { formato: horasFmt, rotuloDica: i => `${horasFmt(i.valor)} de uso · ${i.d.entregas} entrega${i.d.entregas === 1 ? '' : 's'} · pico de ${i.d.pico}` });
  }

  graficoBarras($('#rel-hora'), r.porHora.map(h => ({
    valor: h.media, rotulo: `${h.hora}h`, rotuloLongo: `${String(h.hora).padStart(2, '0')}:00 às ${String(h.hora).padStart(2, '0')}:59`
  })), { formato: v => numFmt(v), rotuloDica: i => `${numFmt(i.valor)} aparelho${i.valor === 1 ? '' : 's'} em uso, em média` });

  listaBarras($('#rel-aparelhos'), r.porAparelho.map(a => ({
    valor: a.horas,
    nome: `<span class="tag-aparelho">${esc(a.nome)}</span>${a.manutencao ? ` <span class="pill warn">${MANUT[a.manutencao]}</span>` : a.usos === 0 ? ' <span class="pill">Parado</span>' : ''}`,
    texto: `<b>${horasFmt(a.horas)}</b><span class="muted">${a.usos} uso${a.usos === 1 ? '' : 's'} · ${a.ocupacao}% do tempo</span>`
  })), 'Nenhum aparelho registrado.');

  listaBarras($('#rel-setores'), r.porSetor.map(s => ({
    valor: s.horas, nome: esc(s.setor),
    texto: `<b>${horasFmt(s.horas)}</b><span class="muted">${s.usos} uso${s.usos === 1 ? '' : 's'}</span>`
  })), 'Nenhum uso no período.');

  listaBarras($('#rel-pessoas'), r.porPessoa.map((p, i) => ({
    valor: p.horas, nome: `<span class="lb-pos">${i + 1}</span><span><b>${esc(p.nome)}</b> <span class="muted">${esc(p.ident)} · ${esc(p.setor)}</span></span>`,
    texto: `<b>${horasFmt(p.horas)}</b><span class="muted">${p.usos} uso${p.usos === 1 ? '' : 's'}</span>`
  })), 'Nenhum uso no período.');
}

$$('[data-rel-dias]').forEach(b => b.addEventListener('click', () => {
  rel.dias = Number(b.dataset.relDias);
  $$('[data-rel-dias]').forEach(x => x.setAttribute('aria-pressed', x === b));
  carregarRelatorio(true);
}));
$('#rel-imprimir').addEventListener('click', () => window.print());
$('#rel-csv').addEventListener('click', () => {
  if (!rel.dados) return;
  const cel = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const COMO = { qr: 'QR de devolução', painel: 'Recebido no painel', bloqueio: 'Bloqueio remoto', perdido: 'Marcado como perdido', 'sem registro': 'Sem registro de devolução' };
  const linhas = [['Aparelho', 'Pessoa', 'Identificação', 'Setor', 'Entregue em', 'Devolvido em', 'Tempo de uso', 'Como terminou']]
    .concat(rel.dados.sessoes.map(s => [s.aparelho, s.nome, s.ident, s.setor, dataHora(s.inicio), s.fim ? dataHora(s.fim) : 'Ainda em uso',
      dur((s.fim ?? Date.now()) - s.inicio), s.fim ? COMO[s.como] ?? '' : '']));
  const csv = '﻿' + linhas.map(l => l.map(cel).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `usos-ct48-${rel.dias}dias-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
