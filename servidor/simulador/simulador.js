'use strict';
// Faz o papel do app Android: usa as mesmas rotas /api/dispositivo/* que o CT48 real.
// O desenho das telas é o mesmo do protótipo (prototipo/controle-ct48.html).

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hora = t => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

const APPS = [['W', 'WMS'], ['I', 'Inventário'], ['C', 'Conferência'], ['E', 'Etiquetas']];
const ICON = {
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/><path d="M12 14.5v2.5"/></svg>',
  ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m7.5 12.5 3 3 6-6.5"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/></svg>'
};
const CHAVE = 'simulador-ct48-token';

let token = null, estado = null, online = false;
let ui = null, timerUi = null;   // tela passageira: leitura, recusado, liberado, bloqueado pelo ADM
let assinatura = '';             // evita redesenhar (e apagar o que foi digitado no registro) sem necessidade
let semSinal = false;            // teste: para de falar com o servidor, como um aparelho sem Wi-Fi
let bateria = 86, carregando = false;   // bateria de mentira: descarrega com o uso, vai para o servidor a cada 30 s

/* Registro de eventos do painel de controle */
function log(tipo, texto) {
  const lista = $('#log');
  lista.querySelector('.vazio')?.remove();
  const li = document.createElement('li');
  li.className = tipo;
  li.innerHTML = `<time>${new Date().toLocaleTimeString(LOCALE)}</time><i></i><span>${esc(texto)}</span>`;
  lista.prepend(li);
  while (lista.children.length > 80) lista.lastChild.remove();
}
$('#limpar-log').addEventListener('click', () => { $('#log').innerHTML = '<li class="vazio">Nada ainda. Os eventos do aparelho aparecem aqui.</li>'; });

try { token = localStorage.getItem(CHAVE); } catch { /* sem armazenamento: registra de novo a cada visita */ }
const guardar = t => { token = t; try { t ? localStorage.setItem(CHAVE, t) : localStorage.removeItem(CHAVE); } catch {} };

async function chamar(metodo, url, corpo) {
  const r = await fetch(url, {
    method: metodo,
    headers: { ...(corpo ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.erro || `Erro ${r.status}`), { status: r.status });
  return j;
}

async function consultar() {
  if (!token) { estado = null; render(); return; }
  if (semSinal) { online = false; render(); return; }
  const antes = estado, estavaOnline = online;
  try {
    estado = await chamar('GET', '/api/dispositivo/estado');
    online = true;
    if (!estavaOnline) log('ok', `Conectado ao servidor como ${estado.nome}.`);
    // Devolução ou bloqueio remoto pelo painel: avisa na tela, como o app vai fazer
    if (antes && antes.liberado && !estado.liberado && !ui) {
      mostrar({ mode: 'ok', msg: 'Bloqueado pelo ADM', icon: 'lock' }, 1800);
      log('info', 'O ADM devolveu ou bloqueou o aparelho pelo painel.');
    }
  } catch (e) {
    if (e.status === 401) { guardar(null); estado = null; log('bad', 'O servidor não reconhece mais este aparelho. Registre de novo.'); }
    else if (estavaOnline) log('bad', 'Sem conexão com o servidor.');
    online = false;
  }
  render();
}

function mostrar(estadoUi, ms) {
  clearTimeout(timerUi);
  ui = estadoUi;
  render();
  if (ms) timerUi = setTimeout(() => { ui = null; render(); }, ms);
}

function corpoTela() {
  if (!token) {
    return ['reg', `<div class="reg">
      <div class="eyebrow">Registrar aparelho</div>
      <p>Digite o código de 8 letras que aparece no painel, ao lado do nome do aparelho.</p>
      <form id="f-registro">
        <label class="campo">Código de registro
          <input id="codigo" maxlength="10" placeholder="ex.: 5773GW99" autocomplete="off">
        </label>
      </form>
      <button type="button" id="registrar">Registrar</button>
      <div class="erro" id="msg-registro"></div>
    </div>`];
  }
  if (ui && ui.mode === 'scan') return ['s-scan', `<div class="laser"></div><div class="scr-c"><div class="scr-msg">${esc(ui.msg)}</div></div>`];
  if (ui && ui.mode === 'erro') return ['s-erro', `<div class="scr-c">${ICON.x}<div class="scr-h">Recusado</div><div class="scr-msg">${esc(ui.msg)}</div></div>`];
  if (ui && ui.mode === 'ok') return ['s-ok', `<div class="scr-c">${ui.icon === 'lock' ? ICON.lock : ICON.ok}<div class="scr-h">${esc(ui.msg)}</div></div>`];
  if (estado && estado.liberado) {
    return ['s-on', `<div class="on-head"><div class="eyebrow">Liberado para</div>
        <div class="on-name">${esc(estado.pessoa?.nome)}</div>
        <div class="on-meta">${esc(estado.pessoa?.ident)}</div>
        ${estado.desde ? `<div class="on-meta">desde ${hora(estado.desde)}</div>` : ''}</div>
      <div class="apps">${APPS.map(a => `<div class="app"><span>${a[0]}</span>${a[1]}</div>`).join('')}</div>
      <div class="on-foot">Devolução: tecla laranja no QR de devolução</div>`];
  }
  if (!estado) return ['s-lock', `<div class="scr-c">${ICON.lock}<div class="scr-h">Conectando…</div><div class="scr-msg">Procurando o servidor.</div></div>`];
  if (estado.manutencao) {
    const nome = { manutencao: 'Em manutenção', quebrado: 'Quebrado', perdido: 'Perdido' }[estado.manutencao] ?? 'Em manutenção';
    return ['s-lock', `<div class="scr-c">${ICON.lock}<div class="scr-h">${nome}</div><div class="scr-msg">O ADM tirou este aparelho de uso. Ele não pode ser liberado.</div></div>`];
  }
  return ['s-lock', `<div class="scr-c">${ICON.lock}<div class="scr-h">Bloqueado</div><div class="scr-msg">Peça ao ADM o QR de liberação e aperte a tecla laranja.</div></div>`];
}

function render() {
  const [cls, corpo] = corpoTela();
  const sinal = online ? `Wi-Fi · ${carregando ? '⚡' : ''}${bateria}%` : (token ? 'Sem sinal' : '');
  const nova = cls + corpo + sinal;
  if (nova !== assinatura) {
    assinatura = nova;
    $('#screen').className = 'screen ' + cls;
    $('#screen').innerHTML = `<div class="sbar"><span class="clk">${hora(Date.now())}</span><span>${sinal}</span></div><div class="scr">${corpo}</div>`;
    if (cls === 'reg') ligarRegistro();
  } else {
    const clk = $('#screen .clk');
    if (clk) clk.textContent = hora(Date.now());
  }
  const podeLer = !!token && !!estado && !ui && !semSinal;
  $('#ler').disabled = !podeLer;
  $('#ler2').disabled = !podeLer;
  $('#ler2-texto').textContent = !token ? 'Registre o aparelho primeiro' : semSinal ? 'Sem sinal'
    : ui?.mode === 'scan' ? 'Lendo…' : estado?.liberado ? 'Ler QR de devolução' : 'Ler QR de liberação';
  renderEstado();
  $('#giro').classList.toggle('lendo', ui?.mode === 'scan');
  $('#cap').innerHTML = estado ? `<b>${esc(estado.nome)}</b>${online ? '' : '<span>sem conexão</span>'}` : '';
  ajustarTela();
}

function renderEstado() {
  const e = estado;
  $('.estado').className = 'cartao estado ' + (!token ? '' : !online ? 'offline' : e?.liberado ? 'liberado' : 'bloqueado');
  $('#st-titulo').textContent = !token ? 'Sem registro' : !e ? 'Conectando…' : e.liberado ? 'Liberado' : e.manutencao ? 'Em manutenção' : 'Bloqueado';
  $('#st-bateria').innerHTML = `<span class="${bateria <= 20 && !carregando ? 'bad' : carregando ? 'ok' : ''}">${bateria}%${carregando ? ' · carregando' : ''}</span>`;
  $('#st-nome').textContent = e?.nome ?? '—';
  $('#st-conexao').innerHTML = !token ? '—' : semSinal ? '<span class="bad">Sem sinal (simulado)</span>'
    : online ? '<span class="ok">Online</span>' : '<span class="bad">Sem conexão</span>';
  $('#st-pessoa').textContent = e?.liberado ? `${e.pessoa?.nome ?? ''}${e.pessoa?.ident ? ' · ' + e.pessoa.ident : ''}` : '—';
  $('#st-desde').textContent = e?.liberado && e.desde ? hora(e.desde) : '—';
}

function ajustarTela() {
  const slot = $('.screen-slot');
  if (slot.clientWidth) $('#screen').style.setProperty('--k', (slot.clientWidth / 165).toFixed(4));
}
window.addEventListener('resize', ajustarTela);
$('.ct48-img').addEventListener('load', ajustarTela);

function ligarRegistro() {
  const enviar = async () => {
    const msg = $('#msg-registro');
    const codigo = $('#codigo').value.trim().toUpperCase();
    if (/^CT48/.test(codigo)) { msg.textContent = 'Esse é o nome do aparelho. Digite o código de 8 letras que aparece ao lado dele no painel.'; $('#codigo').select(); return; }
    if (!/^[A-Z0-9]{8}$/.test(codigo)) { msg.textContent = 'O código tem 8 letras e números, sem traço.'; $('#codigo').select(); return; }
    msg.textContent = '';
    // Número de série de mentira, para o painel mostrar algo como no aparelho real
    const sn = 'SIM' + Math.random().toString(36).slice(2, 9).toUpperCase();
    try {
      const r = await chamar('POST', '/api/dispositivo/registrar', { codigo, sn });
      guardar(r.token);
      log('ok', `Registrado no servidor como ${r.nome} (SN ${sn}).`);
      consultar();
    } catch (err) { msg.textContent = err.message; }
  };
  $('#registrar').addEventListener('click', enviar);
  $('#f-registro').addEventListener('submit', e => { e.preventDefault(); enviar(); });
  $('#codigo').focus();
}

async function ler(conteudo) {
  if (!token || !estado || ui) return;
  if (semSinal) return;
  mostrar({ mode: 'scan', msg: 'Lendo código…' });
  const espera = ms => new Promise(r => setTimeout(r, ms));
  try {
    if (conteudo == null) {
      const q = await chamar('GET', '/api/simulador/qr-aberto');
      if (!q.conteudo) { mostrar({ mode: 'erro', msg: 'Nada para ler. Gere um QR no painel do ADM.' }, 3000); log('bad', 'Tecla de leitura: nenhum QR aberto no painel.'); return; }
      conteudo = q.conteudo;
    }
    log('info', `QR lido: ${conteudo}`);
    await espera(650);
    mostrar({ mode: 'scan', msg: 'Validando no servidor…' });
    await espera(750);
    const devolucao = conteudo.startsWith('PDA|DEV|');
    if (devolucao !== !!estado.liberado) {
      const msg = estado.liberado ? 'Já está liberado. Para devolver, leia o QR de devolução.' : 'Este é o QR de devolução. Peça o QR de liberação.';
      mostrar({ mode: 'erro', msg }, 3800);
      log('bad', msg);
      return;
    }
    if (devolucao) {
      const r = await chamar('POST', '/api/dispositivo/devolver', { conteudo });
      if (r.ok) {
        estado = { ...estado, liberado: false, pessoa: null, desde: null };
        mostrar({ mode: 'ok', msg: 'Devolvido', icon: 'lock' }, 1800);
        log('ok', 'Devolvido pelo QR de devolução. Aparelho bloqueado.');
        consultar();
      } else { mostrar({ mode: 'erro', msg: r.msg }, 3800); log('bad', 'Devolução recusada: ' + r.msg); }
      return;
    }
    const r = await chamar('POST', '/api/dispositivo/liberar', { conteudo });
    if (r.ok) {
      estado = { ...estado, liberado: true, pessoa: r.pessoa, desde: Date.now() };
      mostrar({ mode: 'ok', msg: 'Liberado' }, 1400);
      log('ok', `Liberado para ${r.pessoa?.nome}.`);
      consultar();
    } else {
      mostrar({ mode: 'erro', msg: r.msg }, 3800);
      log('bad', 'Liberação recusada: ' + r.msg);
    }
  } catch (e) {
    mostrar({ mode: 'erro', msg: e.message }, 3800);
    log('bad', e.message);
  }
}

$('#ler').addEventListener('click', () => ler(null));
$('#falso').addEventListener('click', () => ler('MATRICULA:10871'));

async function posicao(corpo, texto) {
  if (!token) return log('bad', 'Registre o aparelho antes de enviar posição.');
  if (semSinal) return log('bad', 'Sem sinal: a posição não foi enviada.');
  try { await chamar('POST', '/api/dispositivo/posicao', { ...corpo, bateria, carregando }); log('info', texto); }
  catch (e) { log('bad', 'Posição não enviada: ' + e.message); }
}
$('#mover-dentro').addEventListener('click', () => posicao({ bssid: 'aa:bb:cc:dd:ee:01', lat: -23.5, lng: -46.7, precisao: 6 }, 'Posição enviada: conectado ao roteador aa:bb:cc:dd:ee:01.'));
$('#mover-fora').addEventListener('click', () => posicao({ lat: -23.53, lng: -46.73, precisao: 8 }, 'Posição enviada: GPS fora da cerca da empresa.'));
$('#esquecer').addEventListener('click', () => {
  if (token && !confirm('Esquecer o registro? O simulador volta para a tela de registro e precisa de um código novo do painel.')) return;
  guardar(null); estado = null; ui = null; render();
  log('info', 'Registro esquecido. Digite um código novo para registrar.');
});
$('#sem-sinal').addEventListener('click', e => {
  semSinal = !semSinal;
  e.currentTarget.setAttribute('aria-pressed', semSinal);
  e.currentTarget.textContent = semSinal ? 'Voltar o sinal' : 'Simular sem sinal';
  log(semSinal ? 'bad' : 'ok', semSinal
    ? 'Sem sinal simulado: o aparelho parou de falar com o servidor. Em 1 minuto o painel mostra "Sem sinal".'
    : 'Sinal de volta.');
  consultar();
});
// Bateria: descarrega 1% por ciclo com o aparelho liberado, carrega 5% no carregador
async function enviarBateria() {
  if (!token || semSinal) return;
  try { await chamar('POST', '/api/dispositivo/posicao', { bateria, carregando }); } catch { /* tenta no próximo ciclo */ }
}
setInterval(() => {
  if (carregando) bateria = Math.min(100, bateria + 5);
  else if (estado?.liberado) bateria = Math.max(1, bateria - 1);
  render();
  enviarBateria();
}, 30000);
$('#bateria-baixa').addEventListener('click', () => {
  bateria = 12; carregando = false;
  $('#carregar').textContent = 'Colocar para carregar';
  log('bad', 'Bateria em 12%. O painel deve mostrar o alerta de bateria baixa.');
  render(); enviarBateria();
});
$('#carregar').addEventListener('click', e => {
  carregando = !carregando;
  e.currentTarget.textContent = carregando ? 'Tirar do carregador' : 'Colocar para carregar';
  log(carregando ? 'ok' : 'info', carregando ? 'No carregador.' : 'Fora do carregador.');
  render(); enviarBateria();
});
$('#ler2').addEventListener('click', () => ler(null));
$('#f-manual').addEventListener('submit', e => {
  e.preventDefault();
  const c = $('#manual').value.trim();
  if (c) ler(c);
});
// Espaço = tecla de leitura (fora de campos e botões, para não atrapalhar a digitação)
document.addEventListener('keydown', e => {
  if (e.code !== 'Space' || e.target.closest('input, textarea, button, a')) return;
  e.preventDefault();
  ler(null);
});

/* Aparelho em 3D: arrastar gira (com inércia), setas giram de 15°, duplo clique volta para a frente */
const giro3d = (() => {
  const palco = $('#palco'), giro = $('#giro'), sombra = $('#sombra');
  const calmo = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const CAMADAS = 32;
  let rx = -6, ry = -22, vx = 0, vy = 0, alvo = null, auto = false, quadro = 0;

  // Corpo: fatias com o contorno da foto empilhadas em Z, assim a espessura tem o mesmo formato arredondado.
  // As duas das pontas são a própria foto escurecida (mostram os botões laterais laranja).
  const pilha = $('#camadas');
  for (let i = 0; i < CAMADAS; i++) {
    const ponta = i === 0 || i === CAMADAS - 1;
    const fatia = document.createElement(ponta ? 'img' : 'div');
    if (ponta) { fatia.src = '/img/ct48.png'; fatia.alt = ''; fatia.draggable = false; }
    pilha.append(fatia);
  }
  function espessura() {
    const esp = Math.round(giro.offsetWidth * 0.16);
    giro.style.setProperty('--esp', esp + 'px');
    [...pilha.children].forEach((fatia, i) => { fatia.style.transform = `translateZ(${(-esp / 2 + (esp * (i + .5)) / CAMADAS).toFixed(2)}px)`; });
  }

  const limitarX = v => Math.max(-60, Math.min(60, v));
  function aplicar() {
    giro.style.transform = `rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
    // Sombra no chão: estreita quando o aparelho está de lado
    sombra.style.setProperty('--sx', (0.32 + 0.68 * Math.abs(Math.cos(ry * Math.PI / 180))).toFixed(3));
  }
  function passo() {
    quadro = 0;
    if (alvo) {
      rx += (alvo.rx - rx) * .14; ry += (alvo.ry - ry) * .14;
      if (Math.abs(alvo.rx - rx) < .05 && Math.abs(alvo.ry - ry) < .05) { rx = alvo.rx; ry = alvo.ry; alvo = null; }
    } else if (auto) {
      ry += .45;
    } else if (Math.abs(vx) > .02 || Math.abs(vy) > .02) {
      ry += vy; rx = limitarX(rx + vx); vx *= .93; vy *= .93;
    } else return aplicar();
    aplicar();
    animar();
  }
  const animar = () => { if (!quadro) quadro = requestAnimationFrame(passo); };

  function ligarAuto(sim) {
    auto = sim && !calmo;
    $('#v-auto').setAttribute('aria-pressed', String(auto));
    if (auto) { alvo = null; animar(); }
  }
  // Vai para um ângulo pelo caminho mais curto
  function irPara(x, y) {
    ligarAuto(false); vx = vy = 0;
    const destino = ry + ((((y - ry) % 360) + 540) % 360 - 180);
    if (calmo) { rx = x; ry = destino; aplicar(); return; }
    alvo = { rx: x, ry: destino }; animar();
  }

  // Arrastar (não começa em botões nem nos campos da tela de registro)
  let arrasto = null;
  palco.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest('button, input, a, label, form')) return;
    arrasto = { x: e.clientX, y: e.clientY, t: performance.now() };
    alvo = null; vx = vy = 0; ligarAuto(false);
    palco.setPointerCapture(e.pointerId);
    palco.classList.add('arrastando');
  });
  palco.addEventListener('pointermove', e => {
    if (!arrasto) return;
    const dx = e.clientX - arrasto.x, dy = e.clientY - arrasto.y, agora = performance.now();
    const dt = Math.max(8, agora - arrasto.t);
    ry += dx * .5; rx = limitarX(rx - dy * .4);
    vy = (dx * .5) / dt * 16; vx = (-dy * .4) / dt * 16;
    arrasto = { x: e.clientX, y: e.clientY, t: agora };
    aplicar();
  });
  const soltar = () => {
    if (!arrasto) return;
    if (performance.now() - arrasto.t > 80 || calmo) vx = vy = 0;   // parou antes de soltar: sem inércia
    arrasto = null; palco.classList.remove('arrastando'); animar();
  };
  palco.addEventListener('pointerup', soltar);
  palco.addEventListener('pointercancel', soltar);
  palco.addEventListener('dblclick', e => { if (!e.target.closest('button, input, form')) irPara(0, 0); });
  palco.addEventListener('keydown', e => {
    const d = { ArrowLeft: [0, -15], ArrowRight: [0, 15], ArrowUp: [10, 0], ArrowDown: [-10, 0] }[e.key];
    if (!d) return;
    e.preventDefault(); ligarAuto(false); vx = vy = 0;
    alvo = { rx: limitarX((alvo?.rx ?? rx) + d[0]), ry: (alvo?.ry ?? ry) + d[1] };
    if (calmo) { rx = alvo.rx; ry = alvo.ry; alvo = null; aplicar(); } else animar();
  });

  $('#v-frente').addEventListener('click', () => irPara(0, 0));
  $('#v-lado').addEventListener('click', () => irPara(-8, -72));
  $('#v-verso').addEventListener('click', () => irPara(-6, 180));
  $('#v-auto').addEventListener('click', () => ligarAuto(!auto));

  window.addEventListener('resize', espessura);
  $('.ct48-img').addEventListener('load', espessura);
  espessura(); aplicar();
  return { irPara };
})();

render();
consultar().then(enviarBateria);
setInterval(consultar, 3000);
