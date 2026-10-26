'use strict';
/* ---------- Pessoas ---------- */
const pes = { busca: '', filtro: '', tipo: '', sel: null, assinatura: '', timer: null };

async function carregarPessoas() {
  if (aba !== 'pessoas') return;
  const q = new URLSearchParams({ busca: pes.busca, filtro: pes.filtro, tipo: pes.tipo });
  let r;
  try { r = await api('GET', '/api/pessoas?' + q); } catch { return; }
  const assinatura = JSON.stringify(r);
  if (assinatura !== pes.assinatura) { pes.assinatura = assinatura; renderPessoas(r); }
  if (pes.sel) carregarDetalhe(pes.sel, true);
}
AO_ATUALIZAR.push(carregarPessoas);

function renderPessoas(r) {
  pes.ultima = r;
  const t = r.totais;
  const pg = paginar(r.itens, 'pessoas', 15);
  $('#pes-totais').textContent = `${t.clt} funcionários na base de RH · ${t.dia} diaristas · ${t.uso} com aparelho agora · ${t.bloqueados} bloqueado${t.bloqueados === 1 ? '' : 's'}`;
  $('#pes-lista').innerHTML = pg.itens.length ? pg.itens.map(p => `
    <button type="button" class="pes-item${p.chave === pes.sel ? ' sel' : ''}${p.bloqueio ? ' bloq' : ''}" data-pessoa="${esc(p.chave)}">
      <span class="avatar${p.tipo === 'DIA' ? ' dia' : ''}" aria-hidden="true">${esc(iniciais(p.nome))}</span>
      <span class="pes-txt"><b>${esc(p.nome)}</b><span class="muted">${esc(p.ident)}${p.setor ? ' · ' + esc(p.setor) : ''}${p.tipo === 'DIA' ? ' · diarista' : ''}</span></span>
      <span class="pes-status">
        ${p.aparelho ? `<span class="tag-aparelho">${esc(p.aparelho.nome)}</span>` : ''}
        ${p.bloqueio ? '<span class="pill bad">Bloqueado</span>' : ''}
        ${!p.aparelho && !p.bloqueio ? `<span class="muted pequeno-n">${p.usos ? `${p.usos} uso${p.usos > 1 ? 's' : ''}` : 'nunca usou'}</span>` : ''}
      </span>
    </button>`).join('')
    + (r.total > r.itens.length ? `<p class="muted pequeno pes-mais">A lista mostra as primeiras ${r.itens.length} de ${r.total}. Use a busca para achar quem falta.</p>` : '')
    : `<p class="muted h-vazio">${pes.busca || pes.filtro || pes.tipo ? 'Ninguém encontrado com esses filtros.' : 'Nenhuma pessoa cadastrada. Importe a base do RH.'}</p>`;
  $('#pes-pag').innerHTML = htmlPaginacao(pg, 'pessoas');
}
registrarPaginacao('pessoas', () => pes.ultima && renderPessoas(pes.ultima));

async function carregarDetalhe(chave, silencioso) {
  let p;
  try { p = await api('GET', '/api/pessoas/' + encodeURIComponent(chave)); }
  catch (err) { if (!silencioso) $('#pes-detalhe').innerHTML = `<p class="msg err">${esc(err.message)}</p>`; return; }
  const assinatura = JSON.stringify(p);
  if (silencioso && assinatura === $('#pes-detalhe').dataset.assinatura) return;
  $('#pes-detalhe').dataset.assinatura = assinatura;
  const ap = aparelhos.find(a => a.pessoa && a.nome === p.aparelho);
  const info = [p.cargo, p.setor, p.turnoRh].filter(Boolean).join(' · ') || (p.tipo === 'DIA' ? 'Diarista' : '');
  $('#pes-detalhe').innerHTML = `
    <div class="pd-cab">
      <span class="avatar grande${p.tipo === 'DIA' ? ' dia' : ''}" aria-hidden="true">${esc(iniciais(p.nome))}</span>
      <div><h2>${esc(p.nome)}</h2><span class="muted">${esc(p.ident)}${info ? ' · ' + esc(info) : ''}</span></div>
    </div>
    ${p.turnoRh && !p.turno ? `<p class="pd-aviso">O turno "${esc(p.turnoRh)}" não está nas Configurações. Os alertas de não devolvido usam o tempo máximo de uso.</p>` : ''}
    <div class="pd-numeros">
      <div><b>${p.usos}</b><span>vezes que pegou aparelho</span></div>
      <div><b>${p.primeiroUso ? new Date(p.primeiroUso).toLocaleDateString(LOCALE) : '—'}</b><span>primeiro uso</span></div>
      <div class="${p.atrasos ? 'tem-atraso' : ''}"><b>${p.atrasos}</b><span>devoluções atrasadas em 90 dias${p.atrasos ? ` (em média ${dur(p.atrasoMedioMin * 60000)})` : ''}</span></div>
      <div><b>${p.usos90 ? Math.round((1 - p.atrasos / p.usos90) * 100) + '%' : '—'}</b><span>devolvidas no prazo (90 dias)</span></div>
    </div>
    ${ap ? `<div class="pd-uso"><span class="tag-aparelho">${esc(ap.nome)}</span><span>Com o aparelho desde ${hora(ap.desde)} (há ${dur(Date.now() - ap.desde)})${ap.prazo ? ` · ${Date.now() > ap.prazo ? '<b class="prazo-vencido">devia ter voltado às ' + hora(ap.prazo) + '</b>' : 'devolver até ' + hora(ap.prazo)}` : ''}</span></div>` : ''}
    ${p.bloqueio
      ? `<div class="pd-bloqueio"><b>Bloqueado para receber aparelho</b><span>${esc(p.bloqueio.motivo)} · desde ${dataHora(p.bloqueio.desde)}</span><button type="button" class="btn mini" data-pd-desbloquear>Desbloquear</button></div>`
      : `<form class="pd-bloquear" id="f-bloquear"><input id="pd-motivo" placeholder="Motivo, ex.: perdeu o CT48-03" maxlength="200" aria-label="Motivo do bloqueio"><button class="btn mini perigo">Bloquear</button></form>`}
    <div class="pd-acoes">
      ${!ap && !p.bloqueio ? '<button type="button" class="btn mini" data-pd-entregar>Entregar aparelho</button>' : ''}
      <button type="button" class="btn mini ghost" data-pd-historico>Ver no histórico</button>
    </div>
    <p id="pd-msg" class="msg" role="status"></p>
    <h3>Últimos registros</h3>
    <ol class="pd-eventos">${p.eventos.length ? p.eventos.map(ev => {
      const e = infoEvento(ev);
      return `<li><span class="ic c-${e.cor}">${ICONES[e.ic]}</span><span><b>${esc(tituloEvento({ ...ev, pessoa: { nome: p.nome } }))}</b><span class="muted">${dataHora(ev.t)}${ev.aparelho ? ' · ' + esc(ev.aparelho) : ''}</span></span></li>`;
    }).join('') : '<li class="muted">Nenhum registro ainda.</li>'}</ol>`;
  $('#pes-detalhe').dataset.chave = chave;
  $('#pes-detalhe').dataset.nome = p.nome;
}

$('#pes-lista').addEventListener('click', e => {
  const b = e.target.closest('[data-pessoa]');
  if (!b) return;
  pes.sel = b.dataset.pessoa;
  $$('.pes-item').forEach(x => x.classList.toggle('sel', x === b));
  $('#pes-detalhe').dataset.assinatura = '';
  carregarDetalhe(pes.sel);
  if (matchMedia('(max-width: 900px)').matches) $('#pes-detalhe').scrollIntoView({ behavior: 'smooth' });
});

$('#pes-detalhe').addEventListener('submit', async e => {
  if (e.target.id !== 'f-bloquear') return;
  e.preventDefault();
  try {
    await api('POST', `/api/pessoas/${encodeURIComponent(pes.sel)}/bloquear`, { motivo: $('#pd-motivo').value });
    pes.assinatura = ''; $('#pes-detalhe').dataset.assinatura = '';
    carregarPessoas();
  } catch (err) { $('#pd-msg').className = 'msg err'; $('#pd-msg').textContent = err.message; }
});
$('#pes-detalhe').addEventListener('click', async e => {
  const det = $('#pes-detalhe');
  if (e.target.closest('[data-pd-desbloquear]')) {
    try {
      await api('POST', `/api/pessoas/${encodeURIComponent(pes.sel)}/desbloquear`);
      pes.assinatura = ''; det.dataset.assinatura = '';
      carregarPessoas();
    } catch (err) { $('#pd-msg').className = 'msg err'; $('#pd-msg').textContent = err.message; }
  } else if (e.target.closest('[data-pd-historico]')) {
    hist.busca = det.dataset.nome; $('#h-busca').value = hist.busca;
    hist.dias = 30; $$('[data-dias]').forEach(x => x.setAttribute('aria-pressed', x.dataset.dias === '30'));
    hist.assinatura = '';
    trocarAba('historico');
  } else if (e.target.closest('[data-pd-entregar]')) {
    // Abre a aba Entregar com a pessoa já buscada
    const [tipo, id] = det.dataset.chave.split(':');
    trocarAba('entregar');
    $(`[data-modo="${tipo}"]`).click();
    if (tipo === 'CLT') { $('#mat').value = id; $('#f-clt').requestSubmit(); }
    else { $('#cpf').value = cpfFmt(id); $('#cpf').dispatchEvent(new Event('input')); }
  }
});

$('#pes-busca').addEventListener('input', e => {
  clearTimeout(pes.timer);
  pes.timer = setTimeout(() => { pes.busca = e.target.value.trim(); primeiraPagina('pessoas'); carregarPessoas(); }, 250);
});
$$('[data-pes-filtro]').forEach(b => b.addEventListener('click', () => {
  pes.filtro = b.dataset.pesFiltro;
  primeiraPagina('pessoas');
  $$('[data-pes-filtro]').forEach(x => x.setAttribute('aria-pressed', x === b));
  carregarPessoas();
}));
$('#pes-tipo').addEventListener('change', e => { pes.tipo = e.target.value; primeiraPagina('pessoas'); carregarPessoas(); });

/* Importar base do RH */
let csvRh = null;
$('#pes-importar').addEventListener('click', () => {
  csvRh = null;
  $('#rh-arquivo').value = ''; $('#rh-previa').innerHTML = ''; $('#rh-msg').textContent = '';
  $('#rh-confirmar').disabled = true;
  $('#dlg-rh').showModal();
});
// Planilhas salvas pelo Excel em português costumam vir em Windows-1252, não UTF-8
function lerArquivo(arquivo) {
  return new Promise((ok, falha) => {
    const ler = cod => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = falha; r.readAsText(arquivo, cod); };
    const r = new FileReader();
    r.onload = () => (r.result.includes('�') ? ler('windows-1252') : ok(r.result));
    r.onerror = falha;
    r.readAsText(arquivo, 'utf-8');
  });
}
$('#rh-arquivo').addEventListener('change', async e => {
  const f = e.target.files[0];
  $('#rh-confirmar').disabled = true; $('#rh-previa').innerHTML = ''; $('#rh-msg').textContent = '';
  if (!f) return;
  try {
    csvRh = await lerArquivo(f);
    const r = await api('POST', '/api/rh/importar', { csv: csvRh, previa: true });
    $('#rh-previa').innerHTML = `<p><b>${r.total} funcionários</b> no arquivo (hoje há ${r.atuais} na base). Primeiras linhas:</p>
      <div class="tabela-rolagem"><table><thead><tr><th>Matrícula</th><th>Nome</th><th>Setor</th><th>Turno</th></tr></thead>
      <tbody>${r.exemplos.map(x => `<tr><td class="mono">${esc(x.matricula)}</td><td>${esc(x.nome)}</td><td>${esc(x.setor ?? '')}</td><td>${esc(x.turno ?? '')}</td></tr>`).join('')}</tbody></table></div>`;
    $('#rh-confirmar').disabled = false;
  } catch (err) { $('#rh-msg').className = 'msg err'; $('#rh-msg').textContent = err.message; }
});
$('#f-rh').addEventListener('submit', async e => {
  e.preventDefault();
  if (!csvRh) return;
  $('#rh-confirmar').disabled = true;
  try {
    const r = await api('POST', '/api/rh/importar', { csv: csvRh });
    $('#dlg-rh').close();
    pes.assinatura = '';
    carregarPessoas();
    $('#pes-totais').textContent = `${r.total} funcionários importados.`;
  } catch (err) { $('#rh-confirmar').disabled = false; $('#rh-msg').className = 'msg err'; $('#rh-msg').textContent = err.message; }
});
