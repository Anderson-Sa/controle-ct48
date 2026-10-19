'use strict';
/* Seção Aparelhos: cartões com mini CT48, filtros, ações e manutenção. */

const ap = { filtro: 'todos', busca: '', assinatura: '' };

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

function renderAparelhos() {
  for (const b of $$('[data-filtro]')) b.querySelector('b').textContent = aparelhos.filter(FILTROS[b.dataset.filtro]).length;
  const busca = semAcento(ap.busca.trim());
  const lista = aparelhos.filter(FILTROS[ap.filtro]).filter(a => !busca
    || semAcento([a.nome, a.sn, a.area, a.pessoa?.nome, a.pessoa?.ident].join(' ')).includes(busca));
  // Redesenha só quando algo muda (ou a cada 30 s, para os "há X min"), sem tirar o foco dos botões à toa
  const assinatura = JSON.stringify([ap.filtro, busca, lista, Math.floor(Date.now() / 30000)]);
  if (assinatura === ap.assinatura) return;
  ap.assinatura = assinatura;
  const grade = $('#grade-aparelhos');
  grade.innerHTML = lista.length
    ? lista.map(cartaoAparelho).join('')
    : `<div class="card"><p class="muted ap-nada">${aparelhos.length ? 'Nenhum aparelho com esse filtro.' : 'Nenhum aparelho cadastrado. Cadastre o primeiro acima.'}</p></div>`;
  for (const i of grade.querySelectorAll('.mp-bat i')) i.style.width = i.dataset.nivel + '%';
}

$$('[data-filtro]').forEach(b => b.addEventListener('click', () => {
  ap.filtro = b.dataset.filtro;
  $$('[data-filtro]').forEach(x => x.setAttribute('aria-pressed', x === b));
  renderAparelhos();
}));
$('#ap-busca').addEventListener('input', e => { ap.busca = e.target.value; renderAparelhos(); });

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
