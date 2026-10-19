// Rotas que o app do CT48 chama: registro, estado, leitura dos QR e posição/bateria.
import { Router } from 'express';
import { db, registrar, transacao } from '../db.js';
import { config } from '../config.js';
import { novoTokenAparelho, limitador } from '../auth.js';
import { pessoa, pessoaJSON, aparelhoDaPessoa, bloqueioDaPessoa } from '../pessoas.js';
import { buscarAparelho, desvincular, SITUACOES } from '../aparelhos.js';
import { aparelho } from '../middlewares.js';
import { erro, num, normBssid, distancia } from '../util.js';

export const rotas = Router();
const limiteRegistro = limitador();

// Primeiro uso: o app manda o código de 8 letras que aparece no painel e recebe o token do aparelho
rotas.post('/dispositivo/registrar', (req, res) => {
  const codigo = String(req.body?.codigo ?? '').trim().toUpperCase();
  // Campo vazio ou mal digitado não conta como tentativa: só códigos no formato certo
  if (!/^[A-Z2-9]{8}$/.test(codigo)) return erro(res, 400, 'Digite o código de 8 letras e números que aparece no painel do ADM.');
  if (limiteRegistro.bloqueado(req.ip)) return erro(res, 429, limiteRegistro.mensagem(req.ip));
  const a = db.prepare('SELECT * FROM aparelhos WHERE codigo_registro = ? AND codigo_expira > ?').get(codigo, Date.now());
  if (!a) {
    limiteRegistro.falhou(req.ip);
    return erro(res, 404, 'Código inválido ou vencido. Gere um novo no painel do ADM.');
  }
  limiteRegistro.limpar(req.ip);
  const sn = String(req.body?.sn ?? '').trim().slice(0, 64) || null;
  if (sn && db.prepare('SELECT 1 FROM aparelhos WHERE sn = ? AND id <> ?').get(sn, a.id)) {
    return erro(res, 409, `O SN ${sn} já está registrado em outro aparelho do painel.`);
  }
  const { token, hash } = novoTokenAparelho();
  db.prepare('UPDATE aparelhos SET token_hash = ?, sn = COALESCE(?, sn), codigo_registro = NULL, codigo_expira = NULL, visto = ? WHERE id = ?')
    .run(hash, sn, Date.now(), a.id);
  registrar('info', `${a.nome} registrado no servidor${sn ? ` (SN ${sn})` : ''}`, { aparelho: a.id });
  res.json({ token, nome: a.nome });
});

// Consultado a cada poucos segundos: liberado ou bloqueado, e quais apps podem abrir
rotas.get('/dispositivo/estado', aparelho, (req, res) => {
  const a = req.aparelho, p = pessoaJSON(a.pessoa);
  res.json({
    nome: a.nome,
    liberado: !!a.pessoa,
    manutencao: a.manutencao,
    pessoa: p && { nome: p.nome, ident: p.ident },
    desde: a.desde,
    apps: config.appsPermitidos,
    intervaloEstadoSegundos: config.intervaloEstadoSegundos,
    intervaloPosicaoSegundos: config.intervaloPosicaoSegundos
  });
});

// Leitura do QR de liberação (PDA|LIB|<token>)
rotas.post('/dispositivo/liberar', aparelho, (req, res) => {
  const a = req.aparelho;
  const m = /^PDA\|LIB\|([A-Z0-9]{10})$/.exec(String(req.body?.conteudo ?? '').trim());
  const q = m && db.prepare('SELECT * FROM qrs WHERE token = ?').get(m[1]);
  if (!q) {
    registrar('bad', `${a.nome}: QR recusado, não foi gerado pelo sistema`, { aparelho: a.id });
    return res.json({ ok: false, msg: 'QR inválido. Este código não foi gerado pelo sistema.' });
  }
  if (q.usado_por) {
    const usado = buscarAparelho(q.usado_por)?.nome ?? 'outro aparelho';
    return res.json({ ok: false, msg: `Este QR já liberou o ${usado}. Cada QR libera um aparelho só.` });
  }
  if (Date.now() > q.expira) return res.json({ ok: false, msg: 'QR expirado. Peça ao ADM um QR novo.' });
  if (a.pessoa) return res.json({ ok: false, msg: `Aparelho em uso por ${pessoaJSON(a.pessoa).nome}. Faça a devolução primeiro.` });
  if (a.manutencao) return res.json({ ok: false, msg: `Este aparelho está marcado como ${SITUACOES[a.manutencao]}. Use outro CT48.` });
  const p = pessoa(q.pessoa);
  if (!p) return res.json({ ok: false, msg: 'A pessoa deste QR não está mais cadastrada. Peça ao ADM um QR novo.' });
  const outro = aparelhoDaPessoa(q.pessoa);
  if (outro) return res.json({ ok: false, msg: `${p.nome} já está com o ${outro}.` });
  if (bloqueioDaPessoa(q.pessoa)) return res.json({ ok: false, msg: `${p.nome} está bloqueado para receber aparelho. Fale com o ADM.` });

  const agora = Date.now();
  const usou = transacao(() => {
    const r = db.prepare('UPDATE qrs SET usado_por = ?, usado_em = ? WHERE token = ? AND usado_por IS NULL').run(a.id, agora, q.token);
    if (r.changes !== 1) return false;
    db.prepare('UPDATE aparelhos SET pessoa = ?, desde = ? WHERE id = ? AND pessoa IS NULL').run(q.pessoa, agora, a.id);
    return true;
  });
  if (!usou) return res.json({ ok: false, msg: 'Este QR acabou de ser usado. Peça ao ADM um QR novo.' });

  registrar('ok', `${a.nome}${a.sn ? ` (SN ${a.sn})` : ''} entregue para ${p.log}`, { aparelho: a.id, pessoa: p.chave, adm: q.adm_id });
  res.json({ ok: true, msg: 'Liberado', pessoa: { nome: p.nome, ident: p.ident } });
});

// Leitura do QR de devolução (PDA|DEV|<token>): o mesmo QR serve para vários aparelhos enquanto valer
rotas.post('/dispositivo/devolver', aparelho, (req, res) => {
  const a = req.aparelho;
  const m = /^PDA\|DEV\|([A-Z0-9]{10})$/.exec(String(req.body?.conteudo ?? '').trim());
  const q = m && db.prepare('SELECT q.*, d.nome AS adm FROM qrs_devolucao q LEFT JOIN adms d ON d.id = q.adm_id WHERE q.token = ?').get(m[1]);
  if (!q) {
    registrar('bad', `${a.nome}: QR de devolução recusado, não foi gerado pelo sistema`, { aparelho: a.id });
    return res.json({ ok: false, msg: 'QR inválido. Este código não foi gerado pelo sistema.' });
  }
  if (Date.now() > q.expira) return res.json({ ok: false, msg: 'QR de devolução expirado. Peça ao ADM um QR novo.' });
  if (!a.pessoa) return res.json({ ok: false, msg: 'Este aparelho já está bloqueado.' });

  const feito = transacao(() => {
    const ok = desvincular(a, (p, tempo) => `${a.nome} devolvido por ${p.nome} após ${tempo} de uso. Devolução por QR${q.adm ? ` de ${q.adm}` : ''}`, q.adm_id);
    if (ok) db.prepare('INSERT INTO devolucoes_qr (token, aparelho_id, t) VALUES (?, ?, ?)').run(q.token, a.id, Date.now());
    return ok;
  });
  if (!feito) return res.json({ ok: false, msg: 'Este aparelho já está bloqueado.' });
  res.json({ ok: true, msg: 'Devolvido' });
});

// Posição (GPS e/ou roteador Wi-Fi) e bateria. Envio só de bateria não apaga a posição.
rotas.post('/dispositivo/posicao', aparelho, (req, res) => {
  const a = req.aparelho, b = req.body ?? {};
  const bateria = num(b.bateria, 0, 100);
  if (bateria != null) {
    db.prepare('UPDATE aparelhos SET bateria = ?, carregando = ?, bateria_em = ? WHERE id = ?').run(Math.round(bateria), b.carregando ? 1 : 0, Date.now(), a.id);
  }
  if (num(b.lat, -90, 90) == null && !normBssid(b.bssid)) return res.json({ ok: true });

  let lat = num(b.lat, -90, 90), lng = num(b.lng, -180, 180);
  if (lat == null || lng == null) lat = lng = null;
  const prec = lat == null ? null : num(b.precisao, 0, 100000);
  const bssid = normBssid(b.bssid);
  const area = bssid ? db.prepare('SELECT area FROM areas_wifi WHERE bssid = ?').get(bssid)?.area ?? null : null;

  // Wi-Fi cadastrado vale mais que GPS: dentro do galpão o GPS perde precisão
  let fora = a.fora;
  if (area) fora = 0;
  else if (config.cerca && lat != null && (prec ?? 0) <= 100) {
    fora = distancia(lat, lng, config.cerca.lat, config.cerca.lng) > config.cerca.raioMetros ? 1 : 0;
  }

  db.prepare(`UPDATE aparelhos SET lat = COALESCE(?, lat), lng = COALESCE(?, lng), precisao = COALESCE(?, precisao),
    bssid = ?, area = ?, fora = ?, posicao_em = ? WHERE id = ?`).run(lat, lng, prec, bssid, area, fora, Date.now(), a.id);

  if (fora !== a.fora) {
    const quem = a.pessoa ? ` (com ${pessoaJSON(a.pessoa).nome})` : '';
    registrar(fora ? 'bad' : 'info', fora ? `Alerta: ${a.nome}${quem} saiu da área da empresa` : `${a.nome} voltou para a área da empresa`,
      { aparelho: a.id, pessoa: a.pessoa });
  }
  res.json({ ok: true });
});
