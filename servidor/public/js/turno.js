'use strict';
/* Turno atual (no cabeçalho) e "Fim de turno" guiado na seção Devolver. Usa os turnos das Configurações. */

const ft = { escolhido: null, maximo: {} };

const minutosDoDia = hhmm => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

/** Início e fim (em ms) de um turno que contém o instante t, ou que acabou de terminar antes dele. */
function janelaTurno(t, turno, base = t) {
  const d = new Date(base); d.setHours(0, 0, 0, 0);
  const ini = d.getTime() + minutosDoDia(turno.inicio) * 60000;
  let fim = d.getTime() + minutosDoDia(turno.fim) * 60000;
  if (fim <= ini) fim += 86400000;
  return { ini, fim };
}

/** Turno em andamento agora (considera turno que passa da meia-noite). */
function turnoAgora() {
  const turnos = configAtual?.turnos ?? [];
  const agora = Date.now();
  for (const t of turnos) {
    for (const base of [agora, agora - 86400000]) {
      const j = janelaTurno(agora, t, base);
      if (agora >= j.ini && agora < j.fim) return { ...t, ...j };
    }
  }
  return null;
}

/** Turno que acabou há menos de 1 hora (é a hora de cobrar as devoluções). */
function turnoQueAcabou() {
  const agora = Date.now();
  for (const t of configAtual?.turnos ?? []) {
    for (const base of [agora, agora - 86400000]) {
      const j = janelaTurno(agora, t, base);
      if (agora >= j.fim && agora - j.fim < 3600000) return { ...t, ...j };
    }
  }
  return null;
}

function renderTurnoAtual() {
  const t = turnoAgora(), el = $('#turno-atual');
  el.hidden = !t;
  if (!t) return;
  const falta = t.fim - Date.now();
  const doTurno = aparelhos.filter(a => a.pessoa && a.turno === t.nome).length;
  el.innerHTML = `<b>${esc(t.nome)}</b><span>termina às ${hora(t.fim)} (em ${dur(falta)})</span><span>${doTurno} aparelho${doTurno === 1 ? '' : 's'} do turno para voltar</span>`;
  el.classList.toggle('acabando', falta < 45 * 60000);
}

/* ---------- Fim de turno ---------- */
function opcoesFimTurno() {
  const nomes = [...(configAtual?.turnos ?? []).map(t => t.nome), 'Diaristas'];
  const sel = $('#ft-turno');
  if (sel.dataset.nomes !== nomes.join('|')) {
    sel.dataset.nomes = nomes.join('|');
    sel.innerHTML = nomes.map(n => `<option>${esc(n)}</option>`).join('');
  }
  // Sugere o turno que acabou de terminar; senão, o que está em andamento
  const sugerido = turnoQueAcabou()?.nome ?? turnoAgora()?.nome ?? nomes[0];
  sel.value = ft.escolhido ?? sugerido;
}

function renderFimTurno() {
  if (!configAtual) return;
  opcoesFimTurno();
  const nome = $('#ft-turno').value;
  const lista = aparelhos.filter(a => a.pessoa && a.turno === nome).sort((a, b) => (a.prazo ?? Infinity) - (b.prazo ?? Infinity) || a.desde - b.desde);
  ft.maximo[nome] = Math.max(ft.maximo[nome] ?? 0, lista.length);
  const total = ft.maximo[nome], voltaram = total - lista.length;
  const atrasados = lista.filter(a => a.prazo && Date.now() > a.prazo).length;
  $('#ft-numeros').innerHTML = lista.length
    ? `<b>Faltam ${lista.length}</b> <span class="muted">de ${total} com aparelho${voltaram ? ` · ${voltaram} já devolveram` : ''}</span>${atrasados ? ` <span class="pill bad">${atrasados} atrasado${atrasados > 1 ? 's' : ''}</span>` : ''}`
    : `<b class="online">Todos do ${esc(nome)} devolveram</b>`;
  $('#ft-barra').style.width = total ? `${voltaram / total * 100}%` : '100%';
  const pg = paginar(lista, 'fim-turno', 12);
  $('#ft-lista').innerHTML = pg.itens.map(a => {
    const atrasado = a.prazo && Date.now() > a.prazo;
    return `<div class="ft-item${atrasado ? ' atrasado' : ''}">
      <span class="avatar" aria-hidden="true">${esc(iniciais(a.pessoa.nome))}</span>
      <span class="quem-usa"><b>${esc(a.pessoa.nome)}</b><span class="muted">${esc(a.pessoa.ident)} · ${a.area ? esc(a.area) : 'sem área'}</span>${a.prazo ? (atrasado ? `<b class="prazo-vencido">Atrasado ${dur(Date.now() - a.prazo)}</b>` : `<span class="muted">devolver até ${hora(a.prazo)}</span>`) : ''}</span>
      <span class="tag-aparelho">${esc(a.nome)}</span>
      <button type="button" class="btn mini" data-ft-devolver="${a.id}">Receber</button>
    </div>`;
  }).join('');
  $('#ft-pag').innerHTML = htmlPaginacao(pg, 'pessoas');
}
registrarPaginacao('fim-turno', renderFimTurno);

$('#ft-turno').addEventListener('change', e => { ft.escolhido = e.target.value; primeiraPagina('fim-turno'); renderFimTurno(); });
$('#ft-lista').addEventListener('click', async e => {
  const b = e.target.closest('[data-ft-devolver]');
  if (!b) return;
  const a = aparelhos.find(x => x.id === Number(b.dataset.ftDevolver));
  b.disabled = true;
  try {
    await api('POST', `/api/aparelhos/${a.id}/devolver`);
    $('#ft-msg').className = 'msg ok'; $('#ft-msg').textContent = `${a.nome} devolvido por ${a.pessoa.nome}.`;
    atualizar();
  } catch (err) { b.disabled = false; $('#ft-msg').className = 'msg err'; $('#ft-msg').textContent = err.message; }
});

AO_ATUALIZAR.push(() => { renderTurnoAtual(); if (aba === 'devolver') renderFimTurno(); });
