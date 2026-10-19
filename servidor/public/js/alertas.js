'use strict';
/* ---------- Alertas ---------- */
const al = { lista: [], ver: 'ativos', conhecidos: null, som: false, assinatura: '' };
try { al.som = localStorage.getItem('ct48-alerta-som') === '1'; } catch { /* sem armazenamento */ }

const ICONES_ALERTA = {
  nao_devolvido: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  fora_area: svg('<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><path d="M9.5 7.5l5 5M14.5 7.5l-5 5"/>'),
  sem_sinal: svg('<path d="M5 12.5a10 10 0 0 1 14 0M8 15.5a6 6 0 0 1 8 0M12 19h.01M3 3l18 18"/>'),
  bateria: svg('<rect x="2.5" y="7" width="17" height="10" rx="2"/><path d="M22 10.5v3M6 10v4"/>'),
  perdido: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M9 9l4 4M13 9l-4 4"/>'),
  qr_falso: svg('<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4z"/><path d="M14 14l6 6M20 14l-6 6"/>')
};
const ROTULO_GRAV = { alta: 'Urgente', media: 'Atenção', baixa: 'Aviso' };

async function carregarAlertas() {
  try { al.lista = await api('GET', '/api/alertas'); } catch { return; }
  const ativos = al.lista.filter(a => !a.resolvido);
  const b = $('#b-alertas');
  b.hidden = !ativos.length;
  b.textContent = ativos.length;

  // Alerta novo (não visto nesta sessão do painel): som e notificação do navegador
  const chaves = new Set(ativos.map(a => a.chave));
  if (al.conhecidos) {
    const novos = ativos.filter(a => !al.conhecidos.has(a.chave));
    if (novos.length && al.som) avisar(novos);
  }
  al.conhecidos = chaves;
  if (aba === 'alertas') renderAlertas();
}
AO_ATUALIZAR.push(carregarAlertas);

function avisar(novos) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.22].forEach((t, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = i ? 660 : 880;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.18);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.2);
    });
  } catch { /* sem áudio */ }
  if ('Notification' in window && Notification.permission === 'granted') {
    const a = novos[0];
    new Notification(novos.length > 1 ? `${novos.length} alertas novos no Controle de CT48` : a.titulo, { body: novos.length > 1 ? novos.map(x => x.titulo).join('\n') : a.detalhe, tag: 'ct48-alerta' });
  }
}

function renderAlertas() {
  const ativos = al.lista.filter(a => !a.resolvido), resolvidos = al.lista.filter(a => a.resolvido);
  $('#al-n-ativos').textContent = ativos.length;
  $('#al-n-resolvidos').textContent = resolvidos.length;
  $('#al-todos').hidden = al.ver !== 'ativos' || !ativos.length;
  const lista = al.ver === 'ativos' ? ativos : resolvidos;
  const assinatura = JSON.stringify([al.ver, lista.map(a => a.chave + a.titulo), Math.floor(Date.now() / 30000)]);
  if (assinatura === al.assinatura) return;
  al.assinatura = assinatura;
  $('#lista-alertas').innerHTML = lista.length ? lista.map(a => `
    <article class="alerta g-${a.gravidade}${a.resolvido ? ' resolvido' : ''}">
      <span class="al-ic">${ICONES_ALERTA[a.tipo] ?? ICONES.alerta}</span>
      <div class="al-txt">
        <div class="al-titulo"><span class="pill ${a.gravidade === 'alta' ? 'bad' : a.gravidade === 'media' ? 'warn' : ''}">${ROTULO_GRAV[a.gravidade]}</span><b>${esc(a.titulo)}</b></div>
        <p>${esc(a.detalhe)}</p>
        <div class="meta">${a.aparelho ? `<span class="tag-aparelho">${esc(a.aparelho.nome)}</span>` : ''}${a.pessoa ? `<span>${esc(a.pessoa.nome)} · ${esc(a.pessoa.ident)}</span>` : ''}<span>há ${dur(Date.now() - a.desde)}</span></div>
      </div>
      <div class="al-acoes">
        ${a.tipo === 'nao_devolvido' && !a.resolvido ? `<button type="button" class="btn mini" data-al-devolver="${a.aparelho.id}">Receber devolução</button>` : ''}
        ${a.aparelho ? `<button type="button" class="btn mini ghost" data-al-ver-ap="${esc(a.aparelho.nome)}">Ver aparelho</button>` : ''}
        ${a.resolvido ? '' : `<button type="button" class="btn mini ghost" data-al-resolver="${esc(a.chave)}">Resolver</button>`}
      </div>
    </article>`).join('')
    : `<div class="al-vazio">${svg('<circle cx="12" cy="12" r="9"/><path d="m8 12.5 3 3 5-6"/>')}<b>${al.ver === 'ativos' ? 'Tudo certo por aqui' : 'Nenhum alerta resolvido'}</b><span class="muted">${al.ver === 'ativos' ? 'Nenhum aparelho precisa de atenção agora.' : 'Os alertas que você resolver aparecem aqui enquanto a situação continuar.'}</span></div>`;
}

$$('[data-al-ver]').forEach(b => b.addEventListener('click', () => {
  al.ver = b.dataset.alVer;
  $$('[data-al-ver]').forEach(x => x.setAttribute('aria-pressed', x === b));
  renderAlertas();
}));

async function resolver(chaves) {
  try {
    await api('POST', '/api/alertas/resolver', { chaves });
    al.assinatura = '';
    await carregarAlertas();
    renderAlertas();
  } catch (err) { $('#al-msg').className = 'msg err'; $('#al-msg').textContent = err.message; }
}
$('#al-todos').addEventListener('click', () => {
  const ativos = al.lista.filter(a => !a.resolvido);
  if (confirm(`Marcar ${ativos.length} alerta${ativos.length > 1 ? 's' : ''} como resolvido${ativos.length > 1 ? 's' : ''}?`)) resolver(ativos.map(a => a.chave));
});
$('#lista-alertas').addEventListener('click', async e => {
  const r = e.target.closest('[data-al-resolver]');
  if (r) return resolver([r.dataset.alResolver]);
  const v = e.target.closest('[data-al-ver-ap]');
  if (v) {
    ap.busca = v.dataset.alVerAp; $('#ap-busca').value = ap.busca; ap.assinatura = '';
    return trocarAba('aparelhos');
  }
  const d = e.target.closest('[data-al-devolver]');
  if (d) {
    d.disabled = true;
    try {
      await api('POST', `/api/aparelhos/${d.dataset.alDevolver}/devolver`);
      $('#al-msg').className = 'msg ok'; $('#al-msg').textContent = 'Devolução recebida. O aparelho foi bloqueado.';
      al.assinatura = '';
      atualizar();
    } catch (err) { d.disabled = false; $('#al-msg').className = 'msg err'; $('#al-msg').textContent = err.message; }
  }
});

function mostrarSom() {
  const b = $('#al-som');
  b.setAttribute('aria-pressed', al.som);
  b.textContent = al.som ? 'Som e notificação: ligados' : 'Som e notificação: desligados';
}
mostrarSom();
$('#al-som').addEventListener('click', async () => {
  al.som = !al.som;
  try { localStorage.setItem('ct48-alerta-som', al.som ? '1' : '0'); } catch { /* sem armazenamento */ }
  if (al.som && 'Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
  mostrarSom();
  if (al.som) avisar([{ titulo: 'Alertas ligados', detalhe: 'Você vai ouvir este som quando aparecer um alerta novo.' }]);
});
