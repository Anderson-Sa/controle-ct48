'use strict';
/* Seção Áreas Wi-Fi: roteadores do galpão. */

function renderAreas(lista) {
  $('#tabela-areas').innerHTML = lista.length
    ? lista.map(a => `<tr><td class="mono">${esc(a.bssid)}</td><td>${esc(a.area)}</td><td><div class="acoes"><button type="button" class="btn mini perigo" data-remover="${esc(a.bssid)}">Remover</button></div></td></tr>`).join('')
    : '<tr><td colspan="3" class="muted">Nenhum roteador cadastrado.</td></tr>';
}
$('#f-area').addEventListener('submit', async e => {
  e.preventDefault();
  const msg = $('#msg-area');
  try {
    await api('POST', '/api/areas-wifi', { bssid: $('#area-bssid').value, area: $('#area-nome').value });
    $('#area-bssid').value = ''; $('#area-nome').value = '';
    msg.className = 'msg ok'; msg.textContent = 'Roteador salvo.';
    atualizar();
  } catch (err) { msg.className = 'msg err'; msg.textContent = err.message; }
});
$('#tabela-areas').addEventListener('click', async e => {
  const b = e.target.closest('[data-remover]');
  if (!b) return;
  await api('DELETE', '/api/areas-wifi/' + encodeURIComponent(b.dataset.remover)).catch(() => {});
  atualizar();
});
