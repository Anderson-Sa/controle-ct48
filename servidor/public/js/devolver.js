'use strict';
/* Seção Devolver: QR de devolução e lista do que já voltou. */

const QR_DEV_VAZIO = $('#qr-dev').innerHTML;

$('#gerar-dev').addEventListener('click', async () => {
  const st = $('#qr-dev-status');
  try {
    qrDev = await api('POST', '/api/qr-devolucao');
    qrDev.total = Math.max(1, qrDev.expira - Date.now());
    qrDev.devolvidos = [];
    renderQrDev();
    clearInterval(timerQrDev);
    timerQrDev = setInterval(checarQrDev, 1500);
  } catch (err) { st.className = 'msg err'; st.textContent = err.message; }
});

async function checarQrDev() {
  if (!qrDev) return;
  if (qrDev.expira > Date.now()) {
    try {
      const s = await api('GET', '/api/qr-devolucao/' + qrDev.token);
      if (s.devolvidos.length !== qrDev.devolvidos.length) { qrDev.devolvidos = s.devolvidos; atualizar(); }
    } catch { /* tenta de novo no próximo ciclo */ }
  }
  renderQrDev();
}

function renderQrDev() {
  const box = $('#qr-dev'), st = $('#qr-dev-status'), barra = $('#qr-dev-barra'), botao = $('#gerar-dev');
  barra.hidden = true;
  const lista = qrDev?.devolvidos ?? [];
  $('#devolvidos').innerHTML = lista.map(d => `<li><span><b>${esc(d.nome)}</b> devolvido</span><span class="pill ok">${hora(d.t)}</span></li>`).join('');
  if (!qrDev) { box.className = 'qr vazio'; box.dataset.token = ''; box.innerHTML = QR_DEV_VAZIO; st.textContent = ''; return; }
  const resta = qrDev.expira - Date.now();
  if (resta <= 0) {
    box.className = 'qr vazio'; box.dataset.token = ''; box.innerHTML = '<span>QR de devolução encerrado.</span>';
    st.className = 'msg';
    st.textContent = lista.length ? `${lista.length} aparelho${lista.length > 1 ? 's' : ''} devolvido${lista.length > 1 ? 's' : ''} com este QR.` : 'Nenhum aparelho leu este QR.';
    botao.textContent = 'Gerar outro QR de devolução';
    clearInterval(timerQrDev);
    return;
  }
  if (box.dataset.token !== qrDev.token) { box.className = 'qr ativo'; box.dataset.token = qrDev.token; box.innerHTML = qrDev.svg; }
  botao.textContent = 'Gerar QR de devolução';
  barra.hidden = false;
  barra.classList.toggle('fim', resta < 30000);
  barra.firstElementChild.style.width = `${Math.min(100, (resta / qrDev.total) * 100)}%`;
  const seg = Math.ceil(resta / 1000);
  st.className = 'msg';
  st.textContent = `Vale mais ${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')} · ${lista.length ? `${lista.length} devolvido${lista.length > 1 ? 's' : ''}` : 'aguardando leitura'}`;
}
