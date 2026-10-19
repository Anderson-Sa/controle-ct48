'use strict';
/* Base do painel: atalhos de DOM, formatação, estado compartilhado e chamada à API. Carrega primeiro. */

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const so = s => String(s).replace(/\D/g, '');
const hora = t => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const dataHora = t => new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
function dur(ms) { const m = Math.max(0, Math.floor(ms / 60000)), h = Math.floor(m / 60); return h ? `${h}h${String(m % 60).padStart(2, '0')}` : `${m} min`; }
function iniciais(n) { const p = String(n ?? '').trim().split(/\s+/).filter(Boolean); return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() || '?'; }
function cpfFmt(c) { c = so(c).slice(0, 11); return c.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2'); }

const ONLINE_MS = 60000;
let configAtual = null;
let aparelhos = [], aba = 'entregar', modo = 'CLT', pessoaSel = null, qr = null, qrDev = null;
let timerAtualizar = null, timerQr = null, timerQrDev = null;
const QR_VAZIO = $('#qr').innerHTML;
const ICONE_OK = '<svg viewBox="0 0 24 24" width="56" height="56" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M7.5 12.5l3 3 6-6.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

async function api(metodo, url, corpo) {
  let r;
  try {
    r = await fetch(url, {
      method: metodo,
      headers: corpo ? { 'Content-Type': 'application/json' } : {},
      body: corpo ? JSON.stringify(corpo) : undefined
    });
  } catch {
    throw Object.assign(new Error('Sem conexão com o servidor.'), { status: 0 });
  }
  const dados = await r.json().catch(() => ({}));
  if (r.status === 401 && url !== '/api/login') mostrarLogin();
  if (!r.ok) throw Object.assign(new Error(dados.erro || `Erro ${r.status} no servidor.`), { status: r.status });
  return dados;
}

// Ícone em SVG com o traço padrão do painel
const svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
// Busca sem acento: "joao" acha "João"
const semAcento = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Botões "Cancelar" ([data-fechar]) fecham o diálogo em que estão
document.addEventListener('click', e => { if (e.target.closest('[data-fechar]')) e.target.closest('dialog')?.close(); });
