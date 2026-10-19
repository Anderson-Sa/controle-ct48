'use strict';
/* Estrutura: login, troca de seção, atualização periódica, menu lateral (frota e atalhos) e relógio. */

/* ---------- Login ---------- */
function mostrarLogin() {
  clearInterval(timerAtualizar); clearInterval(timerQr); clearInterval(timerQrDev);
  $('#tela-painel').hidden = true;
  $('#tela-login').hidden = false;
  $('#f-login [name=login]').focus();
}
async function entrarNoPainel(nome) {
  $('#adm-nome').textContent = nome;
  $('#adm-ini').textContent = iniciais(nome);
  $('#tela-login').hidden = true;
  $('#tela-painel').hidden = false;
  api('GET', '/api/me').then(r => { $('#selo-demo').hidden = !r.demo; }).catch(() => {});
  // O endereço guarda a aba aberta (/#relatorios): F5 e links voltam para ela
  const pedida = location.hash.slice(1);
  if (PAGINAS[pedida] && pedida !== aba) trocarAba(pedida); else await atualizar();
  if (pedida === 'tv') abrirTv();
  clearInterval(timerAtualizar);
  timerAtualizar = setInterval(atualizar, 5000);
}
$('#f-login').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target;
  $('#login-msg').textContent = '';
  try {
    const r = await api('POST', '/api/login', { login: f.login.value, senha: f.senha.value });
    f.senha.value = '';
    entrarNoPainel(r.nome);
  } catch (err) { $('#login-msg').textContent = err.message; }
});
$('#sair').addEventListener('click', async () => {
  await api('POST', '/api/logout').catch(() => {});
  mostrarLogin();
});

/* ---------- Abas ---------- */
$$('[data-aba]').forEach(b => b.addEventListener('click', () => trocarAba(b.dataset.aba)));
const PAGINAS = {
  entregar: ['Entregar aparelho', 'Libere um CT48 para um funcionário ou diarista.'],
  devolver: ['Devolver aparelhos', 'Receba os CT48 de volta com o QR de devolução ou direto pelo painel.'],
  aparelhos: ['Aparelhos', 'Situação, local e sinal de cada CT48.'],
  historico: ['Histórico', 'Tudo o que aconteceu com os aparelhos, com filtros e exportação.'],
  areas: ['Áreas Wi-Fi', 'Roteadores do galpão que dizem em que área cada aparelho está.'],
  alertas: ['Alertas', 'Aparelhos não devolvidos, fora da área, sem sinal, com bateria baixa e QR falsos.'],
  pessoas: ['Pessoas', 'Funcionários e diaristas: quem está com aparelho, histórico e bloqueios.'],
  relatorios: ['Relatórios', 'Quanto os aparelhos são usados, horários de pico e aparelhos parados.'],
  config: ['Configurações', 'Turnos, alertas, cerca virtual, apps do aparelho e ADMs.']
};
function trocarAba(a) {
  aba = a;
  if (location.hash !== '#' + a) history.replaceState(null, '', '#' + a);
  $('#titulo-pagina').textContent = PAGINAS[a][0];
  $('#sub-pagina').textContent = PAGINAS[a][1];
  $$('[data-aba]').forEach(b => b.setAttribute('aria-selected', b.dataset.aba === a));
  $$('[data-painel]').forEach(p => { p.hidden = p.dataset.painel !== a; });
  $('#card-em-uso').hidden = a !== 'entregar' && a !== 'devolver';
  atualizar();
}

// Cada seção em js/*.js que precisa de dados próprios se inscreve aqui para atualizar junto com o painel
const AO_ATUALIZAR = [];

async function atualizar() {
  try {
    aparelhos = await api('GET', '/api/aparelhos');
    renderEmUso();
    renderAparelhos();
    for (const f of AO_ATUALIZAR) await f();
    if (aba === 'historico') carregarHistorico();
    if (aba === 'areas') renderAreas(await api('GET', '/api/areas-wifi'));
    $('#status-vivo').className = 'status-vivo ok';
    $('#conexao').textContent = 'Ao vivo · ' + new Date().toLocaleTimeString('pt-BR');
  } catch (err) {
    if (err.status !== 401) { $('#status-vivo').className = 'status-vivo err'; $('#conexao').textContent = err.message; }
  }
}

// Widget "Frota agora" do menu lateral
function renderFrota() {
  const total = aparelhos.length, agora = Date.now();
  const partes = {
    uso: aparelhos.filter(a => a.pessoa).length,
    livre: aparelhos.filter(a => a.registrado && !a.pessoa && !a.manutencao).length,
    manut: aparelhos.filter(a => a.registrado && !a.pessoa && a.manutencao).length,
    off: aparelhos.filter(a => !a.registrado).length
  };
  $('#fr-total').textContent = total;
  for (const k in partes) {
    $('#fr-' + k).textContent = partes[k];
    $('#fb-' + k).style.width = total ? (partes[k] / total * 100) + '%' : '0';
  }
  const sinal = aparelhos.filter(a => a.registrado && !a.manutencao && (!a.visto || agora - a.visto >= ONLINE_MS)).length;
  const fora = aparelhos.filter(a => a.fora).length;
  const alerta = [sinal && `${sinal} sem sinal`, fora && `${fora} fora da área`].filter(Boolean).join(' · ');
  $('#fr-alerta').hidden = !alerta;
  $('#fr-alerta').textContent = '⚠ ' + alerta;
}
$('#fr-alerta').addEventListener('click', () => trocarAba('aparelhos'));

// Atalhos: teclas 1 a 5 trocam de seção (fora de campos de texto)
const ORDEM_ABAS = ['entregar', 'devolver', 'alertas', 'aparelhos', 'pessoas', 'historico', 'relatorios', 'areas', 'config'];
document.addEventListener('keydown', e => {
  if ($('#tela-painel').hidden || e.ctrlKey || e.altKey || e.metaKey) return;
  if (e.target.closest('input, textarea, select, [contenteditable]')) return;
  const i = Number(e.key) - 1;
  if (ORDEM_ABAS[i]) { e.preventDefault(); trocarAba(ORDEM_ABAS[i]); }
});

/* ---------- Relógio do cabeçalho ---------- */
function relogio() {
  const d = new Date();
  const dia = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  $('#relogio').innerHTML = `<b>${hora(d)}</b>${esc(dia)}`;
}
relogio();
setInterval(relogio, 15000);
