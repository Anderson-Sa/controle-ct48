'use strict';
/* Seção Entregar: quem vai usar, QR de liberação, resumo e "Em uso agora". */

$$('[data-modo]').forEach(b => b.addEventListener('click', () => {
  modo = b.dataset.modo;
  $$('[data-modo]').forEach(x => x.setAttribute('aria-pressed', x === b));
  $('#f-clt').hidden = modo !== 'CLT';
  $('#f-dia').hidden = modo !== 'DIA';
  selecionar(null);
  msgPessoa('');
  (modo === 'CLT' ? $('#mat') : $('#cpf')).focus();
}));

function msgPessoa(texto, cls = '') { const m = $('#msg-pessoa'); m.textContent = texto; m.className = 'msg ' + cls; }

function selecionar(p) {
  pessoaSel = p;
  const box = $('#pessoa');
  box.hidden = !p;
  if (p) {
    box.innerHTML = `<span class="avatar" aria-hidden="true">${esc(iniciais(p.nome))}</span><b>${esc(p.nome)}</b><span>${esc(p.ident)}</span><span class="muted">${esc(p.det)}${p.turno && !p.det.includes(p.turno) ? ' · ' + esc(p.turno) : ''}</span>`
      + (p.aparelho ? `<span class="pill warn">Já está com o ${esc(p.aparelho)}. Faça a devolução primeiro.</span>` : '')
      + (p.bloqueio ? `<span class="pill bad">Bloqueado: ${esc(p.bloqueio.motivo)}. Desbloqueie na aba Pessoas.</span>` : '');
  }
  const impedido = !p || !!p.aparelho || !!p.bloqueio;
  $('#gerar').disabled = impedido;
  const dica = $('#dica-gerar');
  dica.hidden = !impedido;
  dica.textContent = p?.bloqueio ? 'Esta pessoa está impedida de receber aparelho.'
    : p?.aparelho ? 'Receba a devolução em “Em uso agora” para liberar outro aparelho.'
    : modo === 'CLT' ? 'Busque a pessoa pela matrícula para liberar um aparelho.' : 'Digite o CPF do diarista para liberar um aparelho.';
}

$('#f-clt').addEventListener('submit', async e => {
  e.preventDefault();
  const mat = so($('#mat').value);
  if (!mat) return msgPessoa('Digite a matrícula do crachá.', 'err');
  try { selecionar(await api('GET', '/api/funcionarios/' + mat)); msgPessoa(''); }
  catch (err) { selecionar(null); msgPessoa(err.message, 'err'); }
});

$('#cpf').addEventListener('input', async e => {
  e.target.value = cpfFmt(e.target.value);
  selecionar(null);
  const cpf = so(e.target.value);
  if (cpf.length < 11) return msgPessoa('');
  try {
    const p = await api('GET', '/api/diaristas/' + cpf);
    $('#nome-dia').value = p.nome;
    selecionar(p);
    msgPessoa('Diarista já cadastrado.', 'ok');
  } catch (err) {
    msgPessoa(err.message, err.status === 404 ? '' : 'err');
    if (err.status === 404) $('#nome-dia').focus();
  }
});

$('#f-dia').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    const p = await api('POST', '/api/diaristas', { cpf: so($('#cpf').value), nome: $('#nome-dia').value });
    selecionar(p);
    msgPessoa('Diarista confirmado.', 'ok');
  } catch (err) { msgPessoa(err.message, 'err'); }
});

$('#gerar').addEventListener('click', async () => {
  if (!pessoaSel) return;
  try {
    qr = await api('POST', '/api/qr', { pessoa: pessoaSel.chave });
    qr.total = Math.max(1, qr.expira - Date.now());
    renderQr();
    clearInterval(timerQr);
    timerQr = setInterval(checarQr, 1500);
  } catch (err) { msgPessoa(err.message, 'err'); }
});

async function checarQr() {
  if (!qr) return;
  if (!qr.aparelho && qr.expira > Date.now()) {
    try {
      const s = await api('GET', '/api/qr/' + qr.token);
      if (s.aparelho) { qr.aparelho = s.aparelho; atualizar(); }
    } catch { /* tenta de novo no próximo ciclo */ }
  }
  renderQr();
}

function renderQr() {
  const box = $('#qr'), st = $('#qr-status'), barra = $('#qr-barra'), nova = $('#nova-entrega');
  barra.hidden = true; nova.hidden = true;
  if (!qr) { box.className = 'qr vazio'; box.dataset.token = ''; box.innerHTML = QR_VAZIO; st.textContent = ''; return; }
  if (qr.aparelho) {
    box.className = 'qr feito'; box.dataset.token = '';
    box.innerHTML = `${ICONE_OK}<b>${esc(qr.aparelho)} liberado</b><span>para ${esc(qr.pessoa.nome)}</span>`;
    st.className = 'msg'; st.textContent = '';
    nova.hidden = false;
    clearInterval(timerQr);
    selecionar(null); $('#mat').value = ''; $('#cpf').value = ''; $('#nome-dia').value = '';
    return;
  }
  const resta = qr.expira - Date.now();
  if (resta <= 0) {
    box.className = 'qr vazio'; box.dataset.token = ''; box.innerHTML = '<span>QR expirado.</span>';
    st.className = 'msg err'; st.textContent = 'Ninguém leu a tempo. Gere outro QR.';
    nova.hidden = false;
    clearInterval(timerQr);
    return;
  }
  if (box.dataset.token !== qr.token) { box.className = 'qr ativo'; box.dataset.token = qr.token; box.innerHTML = qr.svg; }
  barra.hidden = false;
  barra.classList.toggle('fim', resta < 30000);
  barra.firstElementChild.style.width = `${Math.min(100, (resta / qr.total) * 100)}%`;
  const seg = Math.ceil(resta / 1000);
  st.className = 'msg';
  st.textContent = `Para ${qr.pessoa.nome} · vale mais ${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`;
}

$('#nova-entrega').addEventListener('click', () => {
  qr = null; clearInterval(timerQr); renderQr();
  (modo === 'CLT' ? $('#mat') : $('#cpf')).focus();
});

function renderResumo() {
  const reg = aparelhos.filter(a => a.registrado), agora = Date.now();
  const n = {
    livres: reg.filter(a => !a.pessoa && !a.manutencao).length,
    uso: aparelhos.filter(a => a.pessoa).length,
    sinal: reg.filter(a => !a.visto || agora - a.visto >= ONLINE_MS).length,
    fora: aparelhos.filter(a => a.fora).length
  };
  const tom = { livres: n.livres ? 'ok' : 'warn', uso: '', sinal: n.sinal ? 'warn' : '', fora: n.fora ? 'bad' : '' };
  const badge = (id, v) => { const b = $(id); b.hidden = !v; b.textContent = v; };
  badge('#b-devolver', n.uso);
  badge('#b-aparelhos', aparelhos.filter(a => a.fora || (a.registrado && (!a.visto || agora - a.visto >= ONLINE_MS))).length);
  renderFrota();
  for (const k in n) {
    const el = $('#st-' + k);
    el.textContent = n[k];
    el.parentElement.className = 'stat ' + tom[k];
  }
}

function renderEmUso() {
  renderResumo();
  const uso = aparelhos.filter(a => a.pessoa).sort((a, b) => a.desde - b.desde);
  $('#uso-contagem').textContent = uso.length === 1 ? '1 aparelho' : `${uso.length} aparelhos`;
  $('#em-uso').innerHTML = uso.length
    ? uso.map(a => `<div class="linha-uso">
        <span class="avatar" aria-hidden="true">${esc(iniciais(a.pessoa.nome))}</span>
        <span class="quem-usa"><b>${esc(a.pessoa.nome)}</b><span class="muted">${esc(a.pessoa.ident)} · há ${dur(Date.now() - a.desde)}</span></span>
        <span class="tag-aparelho">${esc(a.nome)}</span>
        <button type="button" class="btn mini" data-devolver="${a.id}">Receber devolução</button>
      </div>`).join('')
    : '<p class="muted vazio-uso">Nenhum aparelho em uso. Todos estão guardados.</p>';
}

$('#em-uso').addEventListener('click', async e => {
  const b = e.target.closest('[data-devolver]');
  if (!b) return;
  const a = aparelhos.find(x => x.id === Number(b.dataset.devolver));
  const msg = $('#msg-uso');
  b.disabled = true;
  try {
    await api('POST', `/api/aparelhos/${a.id}/devolver`);
    msg.className = 'msg ok'; msg.textContent = `${a.nome} devolvido e bloqueado.`;
    atualizar();
  } catch (err) { b.disabled = false; msg.className = 'msg err'; msg.textContent = err.message; }
});
