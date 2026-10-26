'use strict';
/* Idioma do painel: português (padrão) ou chinês, igual à Torre de Controle.
   O texto em português é a própria chave (js/i18n-zh.js); o que ainda não tem tradução aparece em português.
   Carregado sem defer no <head>, depois do dicionário. No chinês, um observador traduz o que as seções
   desenham na tela (textos, placeholder, title, aria-label), então as seções continuam escrevendo em português.
   Textos com números usam {chaves}: "{n} em uso" → "使用中 {n}". O que vem dentro das chaves também é traduzido. */

const IDIOMAS = { pt: { nome: 'Português', sigla: 'PT', locale: 'pt-BR' }, zh: { nome: '中文', sigla: '中文', locale: 'zh-CN' } };
const CHAVE_IDIOMA = 'ct48-idioma';
const IDIOMA = (() => { try { const v = localStorage.getItem(CHAVE_IDIOMA); return IDIOMAS[v] ? v : 'pt'; } catch { return 'pt'; } })();
/** Para datas e números (toLocaleString). Em chinês "1.234" seria lido como decimal. */
const LOCALE = IDIOMAS[IDIOMA].locale;
document.documentElement.lang = LOCALE;

const DICIONARIO = IDIOMA === 'zh' && typeof ZH === 'object' ? ZH : {};

/** Tradução direta, para quem monta texto no código: t('Dom'), t('{n} pessoas', { n: 3 }). */
function t(texto, vars) {
  const base = DICIONARIO[texto] ?? texto;
  return vars ? base.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`)) : base;
}

const traduzir = (() => {
  if (IDIOMA === 'pt') return s => s;

  // Chaves com {variáveis} viram expressões; a parte fixa mais longa serve de filtro rápido
  const MODELOS = Object.keys(DICIONARIO).filter(k => /\{\w+\}/.test(k)).map(k => {
    const partes = k.split(/\{(\w+)\}/);
    const fixos = partes.filter((_, i) => i % 2 === 0);
    const nomes = partes.filter((_, i) => i % 2 === 1);
    const re = new RegExp('^' + partes.map((p, i) => (i % 2 ? '(.+?)' : p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('') + '$', 's');
    return { re, nomes, destino: DICIONARIO[k], filtro: fixos.reduce((a, b) => (b.length > a.length ? b : a), ''), tamanho: fixos.join('').length };
  }).sort((a, b) => b.tamanho - a.tamanho);

  // Durações do painel (dur, horasFmt): 2h05, 3h, 15 min, 1,5 h
  function duracao(s) {
    let m;
    if ((m = /^(\d+)h(\d{2})$/.exec(s))) return `${m[1]}小时${m[2]}分`;
    if ((m = /^(\d+)h$/.exec(s))) return `${m[1]}小时`;
    if ((m = /^(\d+) min$/.exec(s))) return `${m[1]}分钟`;
    if ((m = /^(\d+(?:,\d+)?) h$/.exec(s))) return `${m[1].replace(',', '.')} 小时`;
    return null;
  }

  function simples(s, nivel) {
    if (!/[A-Za-zÀ-ú]/.test(s)) return s;
    const d = duracao(s);
    if (d) return d;
    if (s in DICIONARIO) return DICIONARIO[s];
    if (nivel > 2) return s;
    for (const m of MODELOS) {
      if (!s.includes(m.filtro)) continue;
      const r = m.re.exec(s);
      if (!r) continue;
      const vals = {};
      m.nomes.forEach((n, i) => { vals[n] = simples(r[i + 1].trim(), nivel + 1); });
      return m.destino.replace(/\{(\w+)\}/g, (_, k) => vals[k] ?? `{${k}}`);
    }
    // "Matr. 123 · 1º turno · há 2h": traduz cada pedaço entre os pontos
    if (s.includes('·')) return s.split(/\s*·\s*/).map(p => simples(p, nivel + 1)).join(' · ').trim();
    return s;
  }

  const cache = new Map();
  return texto => {
    const m = /^([\s·]*)([\s\S]*?)([\s·]*)$/.exec(texto);   // pontos soltos nas pontas ficam de fora
    const miolo = m[2];
    if (!miolo || !/[A-Za-zÀ-ú]/.test(miolo)) return texto;
    let tr = cache.get(miolo);
    if (tr === undefined) {
      tr = simples(miolo, 0);
      if (cache.size > 8000) cache.clear();
      cache.set(miolo, tr);
    }
    return tr === miolo ? texto : m[1] + tr + m[3];
  };
})();

if (IDIOMA !== 'pt') {
  const ATRIBUTOS = ['placeholder', 'title', 'aria-label', 'alt'];
  const PULAR = /^(SCRIPT|STYLE|CODE)$/;

  const textoNo = no => { const novo = traduzir(no.data); if (novo !== no.data) no.data = novo; };
  const atributo = (el, a) => { const v = el.getAttribute(a); if (v) { const novo = traduzir(v); if (novo !== v) el.setAttribute(a, novo); } };
  const pular = el => PULAR.test(el.tagName) || el.getAttribute('translate') === 'no';

  function percorrer(raiz) {
    if (raiz.nodeType === 3) { if (raiz.parentElement && !raiz.parentElement.closest('[translate="no"], script, style, textarea')) textoNo(raiz); return; }
    if (raiz.nodeType !== 1 || raiz.closest('[translate="no"], script, style, textarea')) return;
    ATRIBUTOS.forEach(a => atributo(raiz, a));
    const w = document.createTreeWalker(raiz, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: n => (n.nodeType === 1 && pular(n) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT)
    });
    while (w.nextNode()) {
      const n = w.currentNode;
      if (n.nodeType === 3) { if (n.parentElement?.tagName !== 'TEXTAREA') textoNo(n); } else ATRIBUTOS.forEach(a => n.hasAttribute(a) && atributo(n, a));
    }
  }

  new MutationObserver(lista => {
    for (const m of lista) {
      if (m.type === 'childList') m.addedNodes.forEach(percorrer);
      else if (m.type === 'characterData') { if (!m.target.parentElement?.closest('[translate="no"], script, style, textarea')) textoNo(m.target); }
      else if (!m.target.closest('[translate="no"]')) atributo(m.target, m.attributeName);
    }
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATRIBUTOS });
  document.addEventListener('DOMContentLoaded', () => percorrer(document.documentElement));

  // Caixas do navegador e notificações também
  const confirmar = window.confirm.bind(window), avisar = window.alert.bind(window);
  window.confirm = m => confirmar(traduzir(String(m)));
  window.alert = m => avisar(traduzir(String(m)));
  if ('Notification' in window) {
    const N = window.Notification;
    window.Notification = class extends N {
      constructor(titulo, op = {}) { super(traduzir(String(titulo)), { ...op, body: op.body && String(op.body).split('\n').map(traduzir).join('\n') }); }
    };
  }
}

/* Seletor com as bandeiras (onde houver [data-idioma-seletor]). A troca recarrega a página. */
document.addEventListener('DOMContentLoaded', () => {
  const BANDEIRA = {
    pt: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect width="20" height="20" fill="#009c3b"/><polygon points="10,2.5 18.5,10 10,17.5 1.5,10" fill="#ffdf00"/><circle cx="10" cy="10" r="4.2" fill="#002776"/><path d="M6 9.3 Q10 7.8 14 10.2" stroke="#fff" stroke-width=".9" fill="none"/></svg>',
    zh: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect width="20" height="20" fill="#de2910"/><g fill="#ffde00"><polygon points="7,3.2 8.1,6.4 11.5,6.4 8.8,8.4 9.8,11.6 7,9.7 4.2,11.6 5.2,8.4 2.5,6.4 5.9,6.4"/><circle cx="12.6" cy="3.6" r=".8"/><circle cx="14.4" cy="5.6" r=".8"/><circle cx="14.4" cy="8.4" r=".8"/><circle cx="12.6" cy="10.4" r=".8"/></g></svg>'
  };
  document.querySelectorAll('[data-idioma-seletor]').forEach(caixa => {
    caixa.setAttribute('translate', 'no');
    caixa.setAttribute('role', 'group');
    caixa.setAttribute('aria-label', 'Idioma / 语言');
    caixa.innerHTML = Object.entries(IDIOMAS).map(([id, i]) =>
      `<button type="button" data-idioma="${id}" title="${i.nome}" aria-label="${i.nome}" aria-pressed="${id === IDIOMA}"><span class="bandeira">${BANDEIRA[id]}</span><span class="sigla">${i.sigla}</span></button>`).join('');
  });
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-idioma]');
    if (!b || b.dataset.idioma === IDIOMA) return;
    try { localStorage.setItem(CHAVE_IDIOMA, b.dataset.idioma); } catch { /* sem armazenamento */ }
    location.reload();
  });
});
