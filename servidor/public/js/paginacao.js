'use strict';
/* Paginação das listas longas: ‹ 1 2 3 … 7 › embaixo da lista. Cada lista tem uma chave e uma função que a redesenha. */

const PAG = { pagina: {}, redesenhar: {} };

/** Registra a função que redesenha a lista quando o usuário troca de página. */
function registrarPaginacao(chave, redesenhar) { PAG.redesenhar[chave] = redesenhar; }

/** Volta para a página 1 (use quando o filtro ou a busca mudar). */
function primeiraPagina(chave) { PAG.pagina[chave] = 1; }

/** Recorta a lista na página atual. Devolve os itens e os dados para montar a barra de páginas. */
function paginar(lista, chave, porPagina) {
  const total = Math.max(1, Math.ceil(lista.length / porPagina));
  const pagina = Math.min(Math.max(1, PAG.pagina[chave] ?? 1), total);
  PAG.pagina[chave] = pagina;
  const ini = (pagina - 1) * porPagina;
  return { itens: lista.slice(ini, ini + porPagina), chave, pagina, total, qtd: lista.length, de: lista.length ? ini + 1 : 0, ate: Math.min(ini + porPagina, lista.length) };
}

/** Números que aparecem na barra: 1 … 4 5 6 … 12 */
function numerosPagina(pagina, total) {
  const n = new Set([1, total, pagina - 1, pagina, pagina + 1]);
  if (pagina <= 3) [2, 3, 4].forEach(x => n.add(x));
  if (pagina >= total - 2) [total - 1, total - 2, total - 3].forEach(x => n.add(x));
  const lista = [...n].filter(x => x >= 1 && x <= total).sort((a, b) => a - b);
  const saida = [];
  lista.forEach((x, i) => { if (i && x - lista[i - 1] > 1) saida.push('…'); saida.push(x); });
  return saida;
}

/** Barra de páginas em HTML. rotulo: "aparelhos", "pessoas"… */
function htmlPaginacao(pg, rotulo) {
  if (!pg.qtd) return '';
  const info = `<span class="pag-info">${pg.de}–${pg.ate} de ${pg.qtd} ${rotulo}</span>`;
  if (pg.total <= 1) return `<nav class="paginacao" aria-label="Páginas">${info}</nav>`;
  const botao = (p, txt, rotuloAcessivel, extra = '') =>
    `<button type="button" class="pag-btn${extra}" data-pag="${pg.chave}" data-ir="${p}" aria-label="${rotuloAcessivel}"${p === pg.pagina ? ' aria-current="page"' : ''}>${txt}</button>`;
  return `<nav class="paginacao" aria-label="Páginas">
    ${info}
    <div class="pag-botoes">
      ${botao(pg.pagina - 1, '‹', 'Página anterior', pg.pagina === 1 ? ' desligado' : '')}
      ${numerosPagina(pg.pagina, pg.total).map(x => (x === '…' ? '<span class="pag-reticencias">…</span>' : botao(x, x, `Página ${x}`))).join('')}
      ${botao(pg.pagina + 1, '›', 'Próxima página', pg.pagina === pg.total ? ' desligado' : '')}
    </div>
  </nav>`;
}

document.addEventListener('click', e => {
  const b = e.target.closest('[data-pag]');
  if (!b || b.classList.contains('desligado')) return;
  const chave = b.dataset.pag;
  PAG.pagina[chave] = Number(b.dataset.ir);
  PAG.redesenhar[chave]?.();
  // Volta ao topo da lista ao trocar de página
  b.closest('.card, section')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
});
