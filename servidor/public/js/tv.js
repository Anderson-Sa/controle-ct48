'use strict';
/* Modo TV: tela cheia para um monitor na sala do ADM. Números grandes, áreas, alertas agrupados e movimento recente.
   Abre pelo botão "Modo TV" ou direto pelo endereço /#tv. */

let tvAberta = false, tvMov = [], tvMovVistos = new Set(), tvMovEm = 0;

function abrirTv() {
  tvAberta = true;
  $('#tv').hidden = false;
  document.body.classList.add('com-tv');
  document.documentElement.requestFullscreen?.().catch(() => { /* navegador pode negar; a tela continua cobrindo a janela */ });
  renderTv();
  carregarMovimento();
}
function fecharTv() {
  tvAberta = false;
  $('#tv').hidden = true;
  document.body.classList.remove('com-tv');
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  if (location.hash === '#tv') history.replaceState(null, '', '#' + aba);
}

const ICONES_TV = {
  uso: svg('<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/>'),
  livre: svg('<path d="m5 12.5 4.5 4.5L19 7"/>'),
  atraso: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  sinal: svg('<path d="M5 12.5a10 10 0 0 1 14 0M8 15.5a6 6 0 0 1 8 0M12 19h.01M3 3l18 18"/>'),
  fora: svg('<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><path d="M9.5 7.5l5 5M14.5 7.5l-5 5"/>'),
  bateria: svg('<rect x="2.5" y="7" width="17" height="10" rx="2"/><path d="M22 10.5v3M6 10v4"/>'),
  ok: svg('<circle cx="12" cy="12" r="9"/><path d="m8 12.5 3 3 5-6"/>')
};

// Como cada tipo de alerta aparece agrupado
const GRUPOS_TV = {
  nao_devolvido: ['não devolvido', 'não devolvidos', 'Passaram do fim do turno com o aparelho'],
  fora_area: ['fora da área', 'fora da área', 'Saíram da área da empresa'],
  perdido: ['perdido', 'perdidos', 'Marcados como perdidos'],
  sem_sinal: ['sem sinal', 'sem sinal', 'Não falam com o servidor'],
  bateria: ['com bateria baixa', 'com bateria baixa', 'Precisam trocar ou carregar'],
  qr_falso: ['QR falso', 'QR falsos', 'Tentativas com código que não é do painel']
};

function renderTv() {
  if (!tvAberta) return;
  const agora = Date.now();

  // Cabeçalho: turno com barra de progresso e relógio
  const t = turnoAgora();
  if (t) {
    const feito = Math.min(1, Math.max(0, (agora - t.ini) / (t.fim - t.ini)));
    $('#tv-turno').innerHTML = `
      <div class="tv-turno-topo"><b>${esc(t.nome)}</b><span>termina em ${dur(t.fim - agora)}</span></div>
      <div class="tv-turno-barra${t.fim - agora < 45 * 60000 ? ' acabando' : ''}"><span data-larg="${feito * 100}"></span></div>
      <div class="tv-turno-horas"><span>${hora(t.ini)}</span><span>${Math.round(feito * 100)}% do turno</span><span>${hora(t.fim)}</span></div>`;
    $('#tv-turno span[data-larg]').style.width = feito * 100 + '%';
  } else $('#tv-turno').innerHTML = '';
  $('#tv-relogio').innerHTML = `<b>${hora(agora)}</b><span>${esc(((d) => d[0].toUpperCase() + d.slice(1))(new Date().toLocaleDateString(LOCALE, { weekday: 'long', day: '2-digit', month: 'long' })))}</span>`;

  // Indicadores
  const reg = aparelhos.filter(a => a.registrado);
  const n = {
    uso: aparelhos.filter(a => a.pessoa).length,
    livres: reg.filter(a => !a.pessoa && !a.manutencao).length,
    atrasados: aparelhos.filter(a => a.prazo && agora > a.prazo).length,
    sinal: reg.filter(a => !a.manutencao && semSinal(a)).length,
    fora: aparelhos.filter(a => a.fora).length,
    bateria: aparelhos.filter(a => a.pessoa && bateriaBaixa(a)).length
  };
  const kpi = (v, rot, sub, cor, ic) => `<div class="tv-kpi ${v ? 'c-' + cor : 'zero'}">
    <b>${v}</b><span class="tv-kpi-ic">${ICONES_TV[ic]}</span><span class="tv-kpi-rot">${rot}</span><span class="tv-kpi-sub">${sub}</span></div>`;
  $('#tv-kpis').innerHTML = [
    kpi(n.uso, 'Em uso', `de ${reg.length} registrados`, 'ok', 'uso'),
    kpi(n.livres, 'Livres', 'prontos para entregar', 'azul', 'livre'),
    kpi(n.atrasados, 'Atrasados', 'passaram do prazo', 'bad', 'atraso'),
    kpi(n.sinal, 'Sem sinal', 'não falam com o servidor', 'warn', 'sinal'),
    kpi(n.fora, 'Fora da área', 'saíram da empresa', 'bad', 'fora'),
    kpi(n.bateria, 'Bateria baixa', 'em uso, sem carregar', 'warn', 'bateria')
  ].join('');

  // Barra da frota inteira
  const manut = aparelhos.filter(a => a.manutencao).length, semReg = aparelhos.filter(a => !a.registrado).length, total = aparelhos.length || 1;
  const partes = [['d-uso', 'Em uso', n.uso], ['d-livre', 'Livres', n.livres], ['f-manut', 'Manutenção', manut], ['f-off', 'Sem registro', semReg]];
  $('#tv-frota').innerHTML = `<div class="tv-frota-barra">${partes.map(([c, , v]) => (v ? `<span class="${c}" data-larg="${v / total * 100}"></span>` : '')).join('')}</div>
    <div class="tv-frota-leg">${partes.map(([c, r, v]) => `<span><i class="${c}"></i>${r}<b>${v}</b></span>`).join('')}<span>Frota<b>${aparelhos.length}</b></span></div>`;
  for (const s of $$('#tv-frota [data-larg]')) s.style.width = s.dataset.larg + '%';

  // Áreas: um pontinho por aparelho
  const grupos = new Map();
  for (const a of reg.filter(x => !x.manutencao)) {
    const k = areaDe(a);
    const g = grupos.get(k) ?? { nome: k, itens: [] };
    g.itens.push(a);
    grupos.set(k, g);
  }
  const problema = a => a.fora || (a.prazo && agora > a.prazo) || (a.pessoa && semSinal(a));
  $('#tv-areas').innerHTML = [...grupos.values()]
    .sort((a, b) => (b.nome === 'Fora da área') - (a.nome === 'Fora da área') || b.itens.length - a.itens.length)
    .map(g => {
      const uso = g.itens.filter(a => a.pessoa).length, alerta = g.itens.filter(problema).length;
      const pontos = [...g.itens].sort((a, b) => problema(b) - problema(a) || !!b.pessoa - !!a.pessoa)
        .map(a => `<i class="${problema(a) ? 'prob' : a.pessoa ? 'uso' : ''}" title="${esc(a.nome)}${a.pessoa ? ' · ' + esc(a.pessoa.nome) : ''}"></i>`).join('');
      return `<div class="tv-area${g.nome === 'Fora da área' ? ' fora' : ''}">
        <div class="tv-area-topo"><span>${esc(g.nome)}</span><b>${g.itens.length}</b></div>
        <div class="tv-pontos">${pontos}</div>
        <small>${uso} em uso · ${g.itens.length - uso} livre${g.itens.length - uso === 1 ? '' : 's'}${alerta ? ` · <b class="prazo-vencido">${alerta} com problema</b>` : ''}</small>
      </div>`;
    }).join('');

  // Alertas agrupados por tipo
  const ativos = (typeof al !== 'undefined' ? al.lista : []).filter(a => !a.resolvido);
  const porTipo = new Map();
  for (const a of ativos) { const g = porTipo.get(a.tipo) ?? []; g.push(a); porTipo.set(a.tipo, g); }
  const ORDEM = ['nao_devolvido', 'fora_area', 'perdido', 'sem_sinal', 'bateria', 'qr_falso'];
  const blocos = [...porTipo].sort((a, b) => ORDEM.indexOf(a[0]) - ORDEM.indexOf(b[0])).map(([tipo, lista]) => {
    const [um, varios, desc] = GRUPOS_TV[tipo] ?? ['alerta', 'alertas', ''];
    const grav = lista.some(a => a.gravidade === 'alta') ? 'alta' : lista.some(a => a.gravidade === 'media') ? 'media' : 'baixa';
    const nomes = lista.map(a => a.aparelho?.nome).filter(Boolean);
    const maisAntigo = Math.min(...lista.map(a => a.desde));
    return `<div class="tv-grupo g-${grav}">
      <span class="tv-grupo-ic">${ICONES_ALERTA[tipo] ?? ICONES.alerta}</span>
      <b><em>${lista.length}</em>${lista.length === 1 ? um : varios}</b>
      <p>${desc} · o mais antigo há ${dur(agora - maisAntigo)}</p>
      <div class="tv-chips">${nomes.slice(0, 12).map(x => `<span>${esc(x)}</span>`).join('')}${nomes.length > 12 ? `<span class="mais">+${nomes.length - 12}</span>` : ''}</div>
    </div>`;
  });
  $('#tv-alertas').innerHTML = blocos.join('') || `<div class="tv-tudo-certo">${ICONES_TV.ok}<b>Tudo certo por aqui</b><span>Nenhum aparelho precisa de atenção.</span></div>`;

  renderMovimento();
}

/* Movimento recente: entregas, devoluções e alertas do dia */
async function carregarMovimento() {
  if (!tvAberta) return;
  try {
    const d = await api('GET', '/api/historico?dias=1');
    tvMov = d.itens.filter(h => ['entrega', 'devolucao', 'bloqueio', 'saiu_area', 'voltou_area', 'recusado', 'manutencao'].includes(h.evento)).slice(0, 9);
    tvMovEm = Date.now();
    renderMovimento();
  } catch { /* tenta de novo no próximo ciclo */ }
}
function renderMovimento() {
  const el = $('#tv-mov');
  if (!tvMov.length) { el.innerHTML = '<p class="muted">Nenhum movimento hoje.</p>'; return; }
  const primeira = !tvMovVistos.size;
  el.innerHTML = tvMov.map(h => {
    const ev = infoEvento(h), novo = !primeira && !tvMovVistos.has(h.id);
    return `<div class="tv-mov-item${novo ? ' novo' : ''}">
      <time>${hora(h.t)}</time>
      <span class="ic c-${ev.cor}">${ICONES[ev.ic]}</span>
      <div><b>${esc(tituloEvento(h))}</b><span>${esc([h.aparelho, h.pessoa?.ident].filter(Boolean).join(' · '))}</span></div>
    </div>`;
  }).join('');
  tvMov.forEach(h => tvMovVistos.add(h.id));
}

$('#abrir-tv').addEventListener('click', abrirTv);
$('#fechar-tv').addEventListener('click', fecharTv);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && tvAberta) fecharTv(); });
AO_ATUALIZAR.push(() => { renderTv(); if (tvAberta && Date.now() - tvMovEm > 20000) carregarMovimento(); });
setInterval(() => { if (tvAberta) renderTv(); }, 15000);
