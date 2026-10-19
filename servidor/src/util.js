// Pequenas funções usadas em várias rotas.

/** Resposta de erro padrão da API: { erro: "mensagem para a pessoa" }. */
export const erro = (res, status, msg) => res.status(status).json({ erro: msg });

/** Duração legível: "45 min", "2h05". */
export const dur = ms => {
  const m = Math.max(0, Math.floor(ms / 60000)), h = Math.floor(m / 60);
  return h ? `${h}h${String(m % 60).padStart(2, '0')}` : `${m} min`;
};

/** Número dentro da faixa, ou null. */
export const num = (v, min, max) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max) ? v : null;

/** BSSID de roteador no formato aa:bb:cc:dd:ee:ff, ou null. */
export const normBssid = v => {
  const b = String(v ?? '').trim().toLowerCase().replace(/-/g, ':');
  return /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(b) ? b : null;
};

/** Distância em metros entre dois pontos de GPS. */
export function distancia(lat1, lng1, lat2, lng2) {
  const R = 6371000, r = Math.PI / 180, dLat = (lat2 - lat1) * r, dLng = (lng2 - lng1) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function cookie(req, nome) {
  const c = (req.headers.cookie || '').split(/;\s*/).find(x => x.startsWith(nome + '='));
  return c ? decodeURIComponent(c.slice(nome.length + 1)) : null;
}

/** Chave de pessoa: 'CLT:<matrícula>' ou 'DIA:<cpf>'. */
export const chaveValida = chave => /^(CLT|DIA):\d+$/.test(String(chave ?? ''));
