'use strict';
/* Seção Aparelhos: cartões com mini CT48, filtros, ações e manutenção. */

const ap = { filtro: 'todos', busca: '', assinatura: '', vista: 'lista', ordem: 'situacao', area: null };
try { ap.vista = localStorage.getItem('ct48-ap-vista') || 'lista'; } catch { /* sem armazenamento */ }
const POR_PAGINA_AP = { lista: 20, cartoes: 12 };

const semSinal = a => a.registrado && (!a.visto || Date.now() - a.visto >= ONLINE_MS);
const FILTROS = {
  todos: () => true,
  uso: a => !!a.pessoa,
  livre: a => a.registrado && !a.pessoa && !a.manutencao,
  manut: a => !!a.manutencao,
  sinal: semSinal,
  fora: a => a.fora,
  registro: a => !a.registrado
};

// Situação principal do cartão: define a cor da borda e o selo
const MANUT = { manutencao: 'Em manutenção', quebrado: 'Quebrado', perdido: 'Perdido' };

function estadoAparelho(a) {
  if (!a.registrado) return a.codigo ? { cls: 'pendente', selo: 'Aguardando registro', pill: 'warn' } : { cls: 'inativo', selo: 'Não registrado', pill: '' };
  if (a.pessoa) return { cls: 'uso', selo: 'Em uso', pill: 'ok' };
  if (a.manutencao) return { cls: 'manut', selo: MANUT[a.manutencao], pill: a.manutencao === 'perdido' ? 'bad' : 'warn' };
  return { cls: 'livre', selo: 'Livre', pill: '' };
}

const ICONE_LOCAL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>';
const ICONE_SINAL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 12.5a10 10 0 0 1 14 0M8 15.5a6 6 0 0 1 8 0M12 19h.01"/></svg>';

function blocoPessoa(a) {
  if (a.pessoa) {
    return `<div class="ap-pessoa">
      <span class="avatar" aria-hidden="true">${esc(iniciais(a.pessoa.nome))}</span>
      <div><b>${esc(a.pessoa.nome)}</b><span class="muted">${esc(a.pessoa.ident)}</span><span class="muted">desde ${hora(a.desde)} · há ${dur(Date.now() - a.desde)}</span>${a.prazo ? `<span class="${Date.now() > a.prazo ? 'prazo-vencido' : 'muted'}">${Date.now() > a.prazo ? 'Devia ter voltado às ' : 'Devolver até '}${hora(a.prazo)}</span>` : ''}</div>
    </div>`;
  }
  if (a.manutencao) {
    return `<div class="ap-manut ${a.manutencao}"><b>${MANUT[a.manutencao]} desde ${dataHora(a.manutencaoDesde)}</b><span>${esc(a.manutencaoObs || 'Sem observação.')}</span></div>`;
  }
  if (!a.registrado) {
    return a.codigo
      ? `<div class="ap-codigo"><span class="muted">Digite no app do aparelho</span><b>${esc(a.codigo)}</b><span class="muted">vale até ${hora(a.codigoExpira)}</span></div>`
      : '<p class="muted ap-vazio">O código de registro venceu. Gere um novo para registrar o aparelho.</p>';
  }
  return '<p class="muted ap-vazio">Bloqueado e pronto para entregar.</p>';
}

function linhaLocal(a) {
  if (!a.registrado) return '';
  let onde;
  if (a.area) onde = `<b>${esc(a.area)}</b> <span class="muted">· Wi-Fi</span>`;
  else if (a.lat != null) {
    const url = `https://www.google.com/maps?q=${a.lat.toFixed(6)},${a.lng.toFixed(6)}`;
    onde = `<a href="${url}" target="_blank" rel="noopener noreferrer" class="mono">${a.lat.toFixed(5)}, ${a.lng.toFixed(5)}</a> <span class="muted">±${Math.round(a.precisao ?? 0)} m</span>`;
  } else onde = '<span class="muted">Sem posição ainda</span>';
  const quando = a.posicaoEm ? ` <span class="muted">· há ${dur(Date.now() - a.posicaoEm)}</span>` : '';
  return `<div class="ap-linha">${ICONE_LOCAL}<span>${onde}${quando}${a.fora ? ' <span class="pill bad">Fora da área</span>' : ''}</span></div>`;
}

function linhaSinal(a) {
  if (!a.registrado) return '';
  const t = !a.visto ? '<span class="muted">Nunca conectou</span>'
    : semSinal(a) ? `<span class="aviso">Sem sinal há ${dur(Date.now() - a.visto)}</span>`
    : '<span class="online">Online</span>';
  return `<div class="ap-linha">${ICONE_SINAL}<span>${t}</span></div>` + linhaBateria(a);
}

const ICONE_BATERIA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="2.5" y="7" width="17" height="10" rx="2"/><path d="M22 10.5v3"/></svg>';
const bateriaBaixa = a => a.bateria != null && !a.carregando && a.bateria <= (configAtual?.bateriaBaixa ?? 20);
function linhaBateria(a) {
  if (a.bateria == null) return '';
  const cls = a.carregando ? 'online' : bateriaBaixa(a) ? 'bat-baixa' : '';
  return `<div class="ap-linha">${ICONE_BATERIA}<span><span class="${cls}">${a.bateria}%</span>${a.carregando ? ' <span class="muted">· carregando</span>' : bateriaBaixa(a) ? ' <span class="muted">· bateria baixa</span>' : ''}${a.bateriaEm ? ` <span class="muted">· há ${dur(Date.now() - a.bateriaEm)}</span>` : ''}</span></div>`;
}

function botoesAparelho(a) {
  const b = [];
  if (a.pessoa) {
    b.push(`<button type="button" class="btn mini" data-acao="devolver" data-id="${a.id}">Receber devolução</button>`);
    b.push(`<button type="button" class="btn mini perigo" data-acao="bloquear" data-id="${a.id}">Bloquear agora</button>`);
    b.push(`<button type="button" class="btn mini ghost" data-manut="${a.id}">Marcar como perdido</button>`);
  } else if (a.manutencao) {
    b.push(`<button type="button" class="btn mini" data-voltar="${a.id}">Voltar ao uso</button>`);
    b.push(`<button type="button" class="btn mini ghost" data-manut="${a.id}">Editar</button>`);
  } else {
    if (a.registrado) b.push(`<button type="button" class="btn mini ghost" data-manut="${a.id}">Manutenção…</button>`);
    b.push(`<button type="button" class="btn mini ghost" data-acao="codigo" data-id="${a.id}">${a.registrado ? 'Registrar de novo' : 'Novo código'}</button>`);
  }
  if (a.registrado) b.push(`<button type="button" class="btn mini ghost" data-historico="${esc(a.nome)}">Ver histórico</button>`);
  return b.join('');
}

// Desenho do CT48 com a tela no estado atual do aparelho
const ICONE_CADEADO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
const ICONE_DESLIGADO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 4v7M7.5 7a7 7 0 1 0 9 0"/></svg>';
const ICONE_CHAVE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/></svg>';
function miniPda(a) {
  let tela;
  if (!a.registrado && a.codigo) {
    tela = `<span class="mp-rot">Registro</span><span class="mp-cod">${esc(a.codigo.slice(0, 4))}<br>${esc(a.codigo.slice(4))}</span>`;
  } else if (!a.registrado) {
    tela = `<span class="mp-off">${ICONE_DESLIGADO}</span>`;
  } else if (a.manutencao) {
    tela = `<span class="mp-chave">${ICONE_CHAVE}</span><span class="mp-rot">${a.manutencao === 'manutencao' ? 'Manutenção' : MANUT[a.manutencao]}</span>`;
  } else if (a.pessoa) {
    tela = `<span class="mp-rot">Liberado</span><span class="mp-ini">${esc(iniciais(a.pessoa.nome))}</span><span class="mp-apps"><i></i><i></i><i></i><i></i></span>`;
  } else {
    tela = `<span class="mp-cadeado">${ICONE_CADEADO}</span><span class="mp-rot">Bloqueado</span>`;
  }
  const sinal = !a.registrado ? '' : semSinal(a) ? ' sem-sinal' : ' online';
  // Mesma foto do simulador; a tela fica por cima, no lugar da tela do aparelho
  return `<div class="mini-pda${sinal}${a.fora ? ' fora' : ''}" aria-hidden="true">
    <img src="img/ct48.png" alt="" draggable="false">
    <div class="mp-tela${a.manutencao ? ' manut ' + a.manutencao : ''}"><span class="mp-led"></span>${a.bateria != null ? `<span class="mp-bat${bateriaBaixa(a) ? ' baixa' : ''}"><i data-nivel="${a.bateria}"></i></span>` : ''}${tela}</div>
  </div>`;
}

function cartaoAparelho(a) {
  const e = estadoAparelho(a);
  return `<article class="ap-card ${e.cls}${a.fora ? ' fora' : ''}">
    <header>
      <div><h3>${esc(a.nome)}</h3><span class="muted mono pequeno-sn">${a.sn ? 'SN ' + esc(a.sn) : 'SN ainda não informado'}</span></div>
      <span class="pill ${e.pill}">${e.selo}</span>
    </header>
    <div class="ap-corpo">
      ${miniPda(a)}
      <div class="ap-detalhes">
        ${blocoPessoa(a)}
        <div class="ap-info">${linhaLocal(a)}${linhaSinal(a)}</div>
      </div>
    </div>
    <footer>${botoesAparelho(a)}</footer>
  </article>`;
}

const areaDe = a => (a.fora ? 'Fora da área' : a.area || (a.lat != null ? 'Só GPS (sem Wi-Fi cadastrado)' : 'Sem posição'));
const vencido = a => a.prazo && Date.now() > a.prazo;

// Ordem "Situação": o que precisa de atenção vem primeiro
function pesoSituacao(a) {
  if (a.fora) return 0;
  if (vencido(a)) return 1;
  if (a.pessoa && semSinal(a)) return 2;
  if (a.pessoa && bateriaBaixa(a)) return 3;
  if (a.manutencao === 'perdido') return 4;
  if (a.manutencao) return 5;
  if (a.pessoa) return 6;
  if (a.registrado) return 7;
  return a.codigo ? 8 : 9;
}
const ORDENS = {
  situacao: (a, b) => pesoSituacao(a) - pesoSituacao(b) || a.nome.localeCompare(b.nome),
  nome: (a, b) => a.nome.localeCompare(b.nome),
  bateria: (a, b) => (a.bateria ?? 999) - (b.bateria ?? 999) || a.nome.localeCompare(b.nome),
  tempo: (a, b) => (a.desde ?? Infinity) - (b.desde ?? Infinity) || a.nome.localeCompare(b.nome),
  area: (a, b) => areaDe(a).localeCompare(areaDe(b), 'pt-BR') || a.nome.localeCompare(b.nome)
};

/** Quadro por área: quantos CT48 em cada área do galpão (clicar filtra). */
function renderAreasAparelhos() {
  const grupos = new Map();
  for (const a of aparelhos.filter(x => x.registrado && !x.manutencao)) {
    const k = areaDe(a);
    const g = grupos.get(k) ?? { nome: k, total: 0, uso: 0, livres: 0, alerta: 0 };
    g.total++;
    if (a.pessoa) g.uso++; else g.livres++;
    if (a.fora || (a.pessoa && semSinal(a)) || vencido(a)) g.alerta++;
    grupos.set(k, g);
  }
  const lista = [...grupos.values()].sort((a, b) => (b.nome === 'Fora da área') - (a.nome === 'Fora da área') || b.total - a.total);
  $('#ap-areas').innerHTML = lista.map(g => `
    <button type="button" class="ap-area${g.nome === 'Fora da área' ? ' fora' : ''}${ap.area === g.nome ? ' ativa' : ''}" data-ap-area="${esc(g.nome)}">
      <span class="ap-area-nome">${esc(g.nome)}</span>
      <b>${g.total}</b>
      <span class="ap-area-det">${g.uso} em uso · ${g.livres} livre${g.livres === 1 ? '' : 's'}${g.alerta ? ` · <em>${g.alerta} com alerta</em>` : ''}</span>
    </button>`).join('') || '<p class="muted">Nenhum aparelho com posição ainda.</p>';
  $('#ap-area-limpar').hidden = !ap.area;
}

/** Na lista: só a ação principal aparece; as outras ficam no menu "⋯". */
function botoesLista(a) {
  const html = botoesAparelho(a);
  const t = document.createElement('div');
  t.innerHTML = html;
  const todos = [...t.children];
  const principal = todos.find(b => ['devolver'].includes(b.dataset.acao) || b.dataset.voltar || (!a.registrado && b.dataset.acao === 'codigo'));
  const resto = todos.filter(b => b !== principal);
  return (principal ? principal.outerHTML : '')
    + (resto.length ? `<details class="mais-acoes"><summary class="btn mini ghost" aria-label="Mais ações">⋯</summary><div class="mais-menu">${resto.map(b => b.outerHTML).join('')}</div></details>` : '');
}

/** Uma linha da vista em lista. */
function linhaAparelho(a) {
  const e = estadoAparelho(a);
  const quem = a.pessoa
    ? `<b>${esc(a.pessoa.nome)}</b><span class="muted">${esc(a.pessoa.ident)} · há ${dur(Date.now() - a.desde)}</span>${a.prazo ? `<span class="${vencido(a) ? 'prazo-vencido' : 'muted'}">${vencido(a) ? 'Devia ter voltado às ' : 'Até '}${hora(a.prazo)}</span>` : ''}`
    : a.manutencao ? `<span class="muted">${esc(a.manutencaoObs || MANUT[a.manutencao])}</span>`
    : !a.registrado ? (a.codigo ? `<span class="muted">Código </span><b class="mono">${esc(a.codigo)}</b>` : '<span class="muted">Código vencido</span>') : '<span class="muted">—</span>';
  const bat = a.bateria == null ? '<span class="muted">—</span>'
    : `<span class="bat-mini${bateriaBaixa(a) ? ' baixa' : ''}${a.carregando ? ' carregando' : ''}"><i data-nivel="${a.bateria}"></i></span> <span class="${bateriaBaixa(a) ? 'bat-baixa' : ''}">${a.bateria}%${a.carregando ? ' ⚡' : ''}</span>`;
  const sinal = !a.registrado ? '<span class="muted">—</span>' : !a.visto ? '<span class="muted">Nunca</span>'
    : semSinal(a) ? `<span class="aviso">Sem sinal há ${dur(Date.now() - a.visto)}</span>` : '<span class="online">Online</span>';
  return `<tr class="ap-tr ${e.cls}${a.fora ? ' fora' : ''}">
    <td><b class="mono">${esc(a.nome)}</b><span class="muted mono pequeno-sn">${a.sn ? esc(a.sn) : '—'}</span></td>
    <td class="ap-td-sit"><span class="pill ${e.pill}">${e.selo}</span>${a.fora ? ' <span class="pill bad">Fora da área</span>' : ''}</td>
    <td class="ap-td-quem">${quem}</td>
    <td>${a.registrado && !a.manutencao ? esc(areaDe(a)) : '<span class="muted">—</span>'}</td>
    <td class="ap-td-bat">${bat}</td>
    <td class="ap-td-sinal">${sinal}</td>
    <td><div class="acoes">${botoesLista(a)}</div></td>
  </tr>`;
}

function renderAparelhos() {
  for (const b of $$('[data-filtro]')) b.querySelector('b').textContent = aparelhos.filter(FILTROS[b.dataset.filtro]).length;
  renderAreasAparelhos();
  const busca = semAcento(ap.busca.trim());
  const lista = aparelhos.filter(FILTROS[ap.filtro])
    .filter(a => !ap.area || (a.registrado && !a.manutencao && areaDe(a) === ap.area))
    .filter(a => !busca || semAcento([a.nome, a.sn, a.area, a.pessoa?.nome, a.pessoa?.ident].join(' ')).includes(busca))
    .sort(ORDENS[ap.ordem]);
  const pg = paginar(lista, 'aparelhos', POR_PAGINA_AP[ap.vista]);
  // Redesenha só quando algo muda (ou a cada 30 s, para os "há X min"), sem tirar o foco dos botões à toa
  const assinatura = JSON.stringify([ap.filtro, busca, ap.vista, ap.ordem, ap.area, pg.pagina, pg.itens, Math.floor(Date.now() / 30000)]);
  if (assinatura === ap.assinatura) return;
  ap.assinatura = assinatura;
  const grade = $('#grade-aparelhos');
  grade.classList.toggle('vista-lista', ap.vista === 'lista');
  if (!lista.length) {
    grade.innerHTML = `<div class="card"><p class="muted ap-nada">${aparelhos.length ? 'Nenhum aparelho com esse filtro.' : 'Nenhum aparelho cadastrado. Cadastre o primeiro acima.'}</p></div>`;
  } else if (ap.vista === 'lista') {
    grade.innerHTML = `<div class="card ap-tabela-card"><div class="tabela-rolagem"><table class="ap-tabela">
      <thead><tr><th>Aparelho</th><th>Situação</th><th>Com quem / observação</th><th>Área</th><th>Bateria</th><th>Sinal</th><th></th></tr></thead>
      <tbody>${pg.itens.map(linhaAparelho).join('')}</tbody></table></div></div>`;
  } else {
    grade.innerHTML = pg.itens.map(cartaoAparelho).join('');
  }
  $('#ap-pag').innerHTML = htmlPaginacao(pg, 'aparelhos');
  for (const i of grade.querySelectorAll('.mp-bat i, .bat-mini i')) i.style.width = i.dataset.nivel + '%';
}
registrarPaginacao('aparelhos', () => { ap.assinatura = ''; renderAparelhos(); });

$$('[data-filtro]').forEach(b => b.addEventListener('click', () => {
  ap.filtro = b.dataset.filtro;
  $$('[data-filtro]').forEach(x => x.setAttribute('aria-pressed', x === b));
  primeiraPagina('aparelhos');
  renderAparelhos();
}));
$('#ap-busca').addEventListener('input', e => { ap.busca = e.target.value; primeiraPagina('aparelhos'); renderAparelhos(); });
$('#ap-ordem').addEventListener('change', e => { ap.ordem = e.target.value; primeiraPagina('aparelhos'); renderAparelhos(); });
function mostrarVista() { $$('[data-ap-vista]').forEach(x => x.setAttribute('aria-pressed', x.dataset.apVista === ap.vista)); }
mostrarVista();
$$('[data-ap-vista]').forEach(b => b.addEventListener('click', () => {
  ap.vista = b.dataset.apVista;
  try { localStorage.setItem('ct48-ap-vista', ap.vista); } catch { /* sem armazenamento */ }
  mostrarVista(); primeiraPagina('aparelhos'); renderAparelhos();
}));
$('#ap-areas').addEventListener('click', e => {
  const b = e.target.closest('[data-ap-area]');
  if (!b) return;
  ap.area = ap.area === b.dataset.apArea ? null : b.dataset.apArea;
  primeiraPagina('aparelhos'); renderAparelhos();
});
$('#ap-area-limpar').addEventListener('click', () => { ap.area = null; primeiraPagina('aparelhos'); renderAparelhos(); });

$('#grade-aparelhos').addEventListener('click', async e => {
  const m = e.target.closest('[data-manut]');
  if (m) return abrirManutencao(aparelhos.find(x => x.id === Number(m.dataset.manut)));
  const v = e.target.closest('[data-voltar]');
  if (v) {
    const a = aparelhos.find(x => x.id === Number(v.dataset.voltar));
    try {
      await api('POST', `/api/aparelhos/${a.id}/manutencao`, { situacao: null });
      $('#msg-aparelho').className = 'msg ok'; $('#msg-aparelho').textContent = `${a.nome} voltou a ficar disponível.`;
      atualizar();
    } catch (err) { $('#msg-aparelho').className = 'msg err'; $('#msg-aparelho').textContent = err.message; }
    return;
  }
  const h = e.target.closest('[data-historico]');
  if (h) {
    hist.aparelho = h.dataset.historico; hist.assinatura = '';
    trocarAba('historico');
    return;
  }
  const b = e.target.closest('[data-acao]');
  if (!b) return;
  const a = aparelhos.find(x => x.id === Number(b.dataset.id));
  const msg = $('#msg-aparelho');
  if (b.dataset.acao === 'bloquear' && !confirm(`Bloquear o ${a.nome} agora? ${a.pessoa.nome} perde o acesso na hora.`)) return;
  if (b.dataset.acao === 'codigo' && a.registrado && !confirm(`Registrar o ${a.nome} de novo? O app que está registrado com esse nome vai ser desconectado.`)) return;
  b.disabled = true;
  try {
    await api('POST', `/api/aparelhos/${a.id}/${b.dataset.acao}`);
    msg.className = 'msg ok';
    msg.textContent = { devolver: `${a.nome} devolvido e bloqueado.`, bloquear: `${a.nome} bloqueado.`, codigo: `Novo código gerado para o ${a.nome}.` }[b.dataset.acao];
    atualizar();
  } catch (err) { b.disabled = false; msg.className = 'msg err'; msg.textContent = err.message; }
});

// Diálogo de manutenção (em manutenção, quebrado, perdido)
let manutAparelho = null;
function abrirManutencao(a) {
  manutAparelho = a;
  $('#dm-titulo').textContent = `Manutenção do ${a.nome}`;
  const sel = $('#dm-situacao');
  sel.value = a.manutencao || (a.pessoa ? 'perdido' : 'manutencao');
  for (const o of sel.options) o.disabled = !!a.pessoa && o.value !== 'perdido';
  $('#dm-obs').value = a.manutencaoObs || '';
  $('#dm-aviso').textContent = a.pessoa ? `O ${a.nome} está com ${a.pessoa.nome}. Marcar como perdido encerra o uso e bloqueia o aparelho.` : 'Enquanto estiver marcado, o aparelho não pode ser entregue.';
  $('#dm-msg').textContent = '';
  $('#dlg-manut').showModal();
}
$('#f-manut').addEventListener('submit', async e => {
  e.preventDefault();
  const a = manutAparelho;
  try {
    await api('POST', `/api/aparelhos/${a.id}/manutencao`, { situacao: $('#dm-situacao').value, obs: $('#dm-obs').value });
    $('#dlg-manut').close();
    $('#msg-aparelho').className = 'msg ok';
    $('#msg-aparelho').textContent = `${a.nome} marcado como ${MANUT[$('#dm-situacao').value].toLowerCase()}.`;
    atualizar();
  } catch (err) { $('#dm-msg').textContent = err.message; }
});

$('#f-aparelho').addEventListener('submit', async e => {
  e.preventDefault();
  const msg = $('#msg-aparelho');
  try {
    const a = await api('POST', '/api/aparelhos', { nome: $('#novo-aparelho').value });
    $('#novo-aparelho').value = '';
    msg.className = 'msg ok';
    msg.textContent = `${a.nome} cadastrado. Digite o código ${a.codigo} no app do aparelho.`;
    atualizar();
  } catch (err) { msg.className = 'msg err'; msg.textContent = err.message; }
});

// Fecha o menu "⋯" ao clicar fora dele ou depois de escolher uma ação
document.addEventListener('click', e => {
  for (const d of $$('details.mais-acoes[open]')) if (!d.contains(e.target) || e.target.closest('.mais-menu button')) d.open = false;
});
