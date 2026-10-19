'use strict';
/* ---------- Configurações ---------- */
let cfgCarregada = false, meuId = null;

// A configuração também serve às outras abas (ex.: limite de bateria baixa nos cartões)
async function carregarConfig() {
  if (configAtual && aba !== 'config') return;
  try { configAtual = await api('GET', '/api/config'); } catch { return; }
  if (aba === 'config' && !cfgCarregada) { preencherConfig(configAtual); carregarAdms(); cfgCarregada = true; }
}
AO_ATUALIZAR.push(carregarConfig);
// Ao sair e voltar para a aba, recarrega do servidor (descarta o que não foi salvo)
$$('[data-aba]').forEach(b => b.addEventListener('click', () => { if (b.dataset.aba !== 'config') cfgCarregada = false; }));

function linhaTurno(t = { nome: '', inicio: '', fim: '' }) {
  return `<div class="cfg-turno">
    <input class="t-nome" value="${esc(t.nome)}" placeholder="Nome, ex.: 1º turno" aria-label="Nome do turno" required>
    <input class="t-ini" type="time" value="${esc(t.inicio)}" aria-label="Início" required>
    <span class="muted">até</span>
    <input class="t-fim" type="time" value="${esc(t.fim)}" aria-label="Fim" required>
    <button type="button" class="btn mini ghost" data-tirar-turno aria-label="Remover turno">Remover</button>
  </div>`;
}

function preencherConfig(c) {
  $('#cfg-turnos').innerHTML = c.turnos.map(linhaTurno).join('') || '<p class="muted pequeno">Nenhum turno. Sem turno, vale só o tempo máximo de uso.</p>';
  $('#cfg-tolerancia').value = c.toleranciaTurnoMin;
  $('#cfg-horasmax').value = c.horasMaxUso;
  $('#cfg-semsinal').value = c.minutosSemSinal;
  $('#cfg-bateria').value = c.bateriaBaixa;
  $('#cfg-validade').value = c.validadeQrSegundos;
  $('#cfg-apps').value = c.appsPermitidos.join('\n');
  $('#cfg-cerca-on').checked = !!c.cerca;
  $('#cfg-lat').value = c.cerca?.lat ?? '';
  $('#cfg-lng').value = c.cerca?.lng ?? '';
  $('#cfg-raio').value = c.cerca?.raioMetros ?? 400;
  mostrarCerca();
  $('#cfg-msg').textContent = '';
}
function mostrarCerca() { $('#cfg-cerca').classList.toggle('desligada', !$('#cfg-cerca-on').checked); }
$('#cfg-cerca-on').addEventListener('change', mostrarCerca);

$('#cfg-add-turno').addEventListener('click', () => {
  $('#cfg-turnos').querySelector('p')?.remove();
  $('#cfg-turnos').insertAdjacentHTML('beforeend', linhaTurno());
  $('#cfg-turnos').lastElementChild.querySelector('input').focus();
});
$('#cfg-turnos').addEventListener('click', e => { if (e.target.closest('[data-tirar-turno]')) e.target.closest('.cfg-turno').remove(); });

$('#cfg-aqui').addEventListener('click', () => {
  const msg = $('#cfg-msg');
  if (!navigator.geolocation) { msg.className = 'msg err'; msg.textContent = 'Este navegador não informa a localização.'; return; }
  msg.className = 'msg'; msg.textContent = 'Pegando a localização…';
  navigator.geolocation.getCurrentPosition(p => {
    $('#cfg-cerca-on').checked = true; mostrarCerca();
    $('#cfg-lat').value = p.coords.latitude.toFixed(6);
    $('#cfg-lng').value = p.coords.longitude.toFixed(6);
    msg.className = 'msg ok'; msg.textContent = `Localização preenchida (precisão de ${Math.round(p.coords.accuracy)} m). Confira e salve.`;
  }, () => { msg.className = 'msg err'; msg.textContent = 'Não foi possível pegar a localização. Digite a latitude e a longitude.'; }, { enableHighAccuracy: true, timeout: 10000 });
});

$('#f-config').addEventListener('submit', async e => {
  e.preventDefault();
  const msg = $('#cfg-msg');
  const num = v => (v === '' ? NaN : Number(String(v).replace(',', '.')));
  const corpo = {
    turnos: [...$$('.cfg-turno')].map(l => ({ nome: l.querySelector('.t-nome').value, inicio: l.querySelector('.t-ini').value, fim: l.querySelector('.t-fim').value })),
    toleranciaTurnoMin: num($('#cfg-tolerancia').value),
    horasMaxUso: num($('#cfg-horasmax').value),
    minutosSemSinal: num($('#cfg-semsinal').value),
    bateriaBaixa: num($('#cfg-bateria').value),
    validadeQrSegundos: num($('#cfg-validade').value),
    appsPermitidos: $('#cfg-apps').value.split(/\s+/).filter(Boolean),
    cerca: $('#cfg-cerca-on').checked ? { lat: num($('#cfg-lat').value), lng: num($('#cfg-lng').value), raioMetros: num($('#cfg-raio').value) } : null
  };
  try {
    configAtual = await api('PUT', '/api/config', corpo);
    preencherConfig(configAtual);
    msg.className = 'msg ok'; msg.textContent = 'Configurações salvas. Já valem para os próximos QR e alertas.';
    ap.assinatura = '';
    atualizar();
  } catch (err) { msg.className = 'msg err'; msg.textContent = err.message; }
});

/* ADMs */
async function carregarAdms() {
  try {
    meuId = (await api('GET', '/api/me')).id;
    const lista = await api('GET', '/api/adms');
    $('#cfg-lista-adms').innerHTML = lista.map(a => `<tr>
      <td><b>${esc(a.nome)}</b>${a.id === meuId ? ' <span class="pill ok">Você</span>' : ''}</td>
      <td class="mono">${esc(a.login)}</td>
      <td class="muted">${a.ultimoAcesso ? dataHora(a.ultimoAcesso) : 'Nunca entrou'}</td>
      <td><div class="acoes">${a.id === meuId ? '' : `<button type="button" class="btn mini ghost" data-adm-senha="${a.id}" data-nome="${esc(a.nome)}">Trocar senha</button><button type="button" class="btn mini perigo" data-adm-remover="${a.id}" data-nome="${esc(a.nome)}">Remover</button>`}</div></td>
    </tr>`).join('');
  } catch (err) { $('#adm-msg').className = 'msg err'; $('#adm-msg').textContent = err.message; }
}

$('#f-novo-adm').addEventListener('submit', async e => {
  e.preventDefault();
  const msg = $('#adm-msg');
  try {
    await api('POST', '/api/adms', { nome: $('#na-nome').value, login: $('#na-login').value, senha: $('#na-senha').value });
    msg.className = 'msg ok'; msg.textContent = `ADM ${$('#na-nome').value} criado. Ele já pode entrar com o login ${$('#na-login').value.trim().toLowerCase()}.`;
    e.target.reset();
    carregarAdms();
  } catch (err) { msg.className = 'msg err'; msg.textContent = err.message; }
});

let senhaAdm = null;
$('#cfg-lista-adms').addEventListener('click', async e => {
  const s = e.target.closest('[data-adm-senha]'), r = e.target.closest('[data-adm-remover]');
  const msg = $('#adm-msg');
  if (s) {
    senhaAdm = Number(s.dataset.admSenha);
    $('#ds-titulo').textContent = `Trocar a senha de ${s.dataset.nome}`;
    $('#ds-senha').value = ''; $('#ds-msg').textContent = '';
    $('#dlg-senha').showModal();
  } else if (r) {
    if (!confirm(`Remover o acesso de ${r.dataset.nome} ao painel? O histórico continua com o nome dele.`)) return;
    try {
      await api('DELETE', '/api/adms/' + r.dataset.admRemover);
      msg.className = 'msg ok'; msg.textContent = `${r.dataset.nome} não tem mais acesso ao painel.`;
      carregarAdms();
    } catch (err) { msg.className = 'msg err'; msg.textContent = err.message; }
  }
});
$('#f-senha-adm').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    await api('POST', `/api/adms/${senhaAdm}/senha`, { senha: $('#ds-senha').value });
    $('#dlg-senha').close();
    $('#adm-msg').className = 'msg ok'; $('#adm-msg').textContent = 'Senha trocada.';
  } catch (err) { $('#ds-msg').textContent = err.message; }
});

$('#f-minha-senha').addEventListener('submit', async e => {
  e.preventDefault();
  const msg = $('#ms-msg');
  if ($('#ms-nova').value !== $('#ms-nova2').value) { msg.className = 'msg err'; msg.textContent = 'As duas senhas novas não são iguais.'; return; }
  try {
    meuId = (await api('GET', '/api/me')).id;
    await api('POST', `/api/adms/${meuId}/senha`, { atual: $('#ms-atual').value, senha: $('#ms-nova').value });
    e.target.reset();
    msg.className = 'msg ok'; msg.textContent = 'Sua senha foi trocada.';
  } catch (err) { msg.className = 'msg err'; msg.textContent = err.message; }
});
