// Gera o banco de DEMONSTRAÇÃO (dados/demo.db) com 64 CT48, ~180 funcionários, diaristas e 30 dias de uso.
// Uso: npm run demo   (gera e já sobe o painel em http://localhost:3200, login demo / demo1234)
// O banco real (dados/ct48.db) não é tocado. Todos os nomes e CPFs são fictícios.
import { rmSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';

// Escolhe o banco de demonstração ANTES de carregar o db.js
process.argv.push('--demo');
const pasta = fileURLToPath(new URL('../dados/', import.meta.url));
mkdirSync(pasta, { recursive: true });
for (const ext of ['', '-wal', '-shm']) rmSync(join(pasta, 'demo.db' + ext), { force: true });

const { db, evento } = await import('../src/db.js');
const { salvarConfig } = await import('../src/config.js');
const { hashSenha } = await import('../src/auth.js');
const { dur } = await import('../src/util.js');

/* ---------- Sorteio reproduzível (mesma demo toda vez) ---------- */
let semente = 4812;
const rnd = () => { semente = (semente * 1103515245 + 12345) % 2147483648; return semente / 2147483648; };
const entre = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const um = lista => lista[Math.floor(rnd() * lista.length)];
const embaralhar = lista => { const l = [...lista]; for (let i = l.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [l[i], l[j]] = [l[j], l[i]]; } return l; };
const chance = p => rnd() < p;

const MIN = 60000, HORA = 60 * MIN, DIA = 24 * HORA;
const agora = Date.now();

/* ---------- Pessoas fictícias ---------- */
const NOMES = ['Ana', 'Bruno', 'Camila', 'Diego', 'Eduarda', 'Felipe', 'Gabriela', 'Henrique', 'Isabela', 'João', 'Juliana', 'Kaique', 'Larissa', 'Lucas', 'Mariana',
  'Matheus', 'Natália', 'Otávio', 'Paula', 'Rafael', 'Renata', 'Rodrigo', 'Sabrina', 'Thiago', 'Vanessa', 'Vinícius', 'Wellington', 'Yasmin', 'Carlos', 'Daniela',
  'Everton', 'Fernanda', 'Gustavo', 'Jéssica', 'Leandro', 'Michele', 'Patrícia', 'Ricardo', 'Simone', 'Tatiane', 'Alex', 'Beatriz', 'Cristiano', 'Débora', 'Elaine'];
const SOBRENOMES = ['Silva', 'Santos', 'Oliveira', 'Souza', 'Lima', 'Pereira', 'Costa', 'Rodrigues', 'Almeida', 'Nascimento', 'Ferreira', 'Carvalho', 'Gomes',
  'Ribeiro', 'Martins', 'Araújo', 'Barbosa', 'Rocha', 'Dias', 'Moreira', 'Mendes', 'Cardoso', 'Teixeira', 'Freitas', 'Correia', 'Pinto', 'Moura', 'Batista'];
const nomeCompleto = () => `${um(NOMES)} ${um(SOBRENOMES)} ${um(SOBRENOMES)}`;
const CARGOS = [['Separador', 5], ['Conferente', 3], ['Auxiliar de expedição', 3], ['Operador de empilhadeira', 2], ['Inventarista', 1], ['Líder de turno', 1]];
const SETORES = ['Recebimento', 'Armazenagem', 'Separação', 'Expedição', 'Inventário', 'Devoluções'];
const pesoCargo = () => { const t = CARGOS.reduce((s, c) => s + c[1], 0); let r = rnd() * t; for (const [c, p] of CARGOS) { if ((r -= p) < 0) return c; } return CARGOS[0][0]; };

// CPF com dígitos verificadores válidos (fictício)
function cpf() {
  const d = Array.from({ length: 9 }, () => entre(0, 9));
  for (const t of [9, 10]) {
    let s = 0;
    for (let i = 0; i < t; i++) s += d[i] * (t + 1 - i);
    d.push((s * 10) % 11 % 10);
  }
  return d.join('');
}
const cpfMask = c => `***.${c.slice(3, 6)}.${c.slice(6, 9)}-**`;

/* ---------- Configuração da demo ---------- */
const TURNOS = [
  { nome: '1º turno', inicio: '06:00', fim: '14:20', base: 44 },
  { nome: '2º turno', inicio: '14:20', fim: '22:40', base: 38 },
  { nome: '3º turno', inicio: '22:40', fim: '06:00', base: 16 }
];
const CERCA = { lat: -23.5, lng: -46.7, raioMetros: 400 };
salvarConfig({
  validadeQrSegundos: 120, toleranciaTurnoMin: 20, horasMaxUso: 10, minutosSemSinal: 5, bateriaBaixa: 20,
  cerca: CERCA, appsPermitidos: ['com.empresa.wms', 'com.empresa.inventario', 'com.empresa.conferencia'],
  turnos: TURNOS.map(({ nome, inicio, fim }) => ({ nome, inicio, fim }))
});

const ins = {
  adm: db.prepare('INSERT INTO adms (login, nome, senha, criado, ultimo_acesso) VALUES (?, ?, ?, ?, ?)'),
  func: db.prepare('INSERT INTO funcionarios (matricula, nome, cargo, setor, turno) VALUES (?, ?, ?, ?, ?)'),
  dia: db.prepare('INSERT INTO diaristas (cpf, nome, criado) VALUES (?, ?, ?)'),
  ap: db.prepare('INSERT INTO aparelhos (nome, sn, token_hash, visto) VALUES (?, ?, ?, ?)'),
  area: db.prepare('INSERT INTO areas_wifi (bssid, area) VALUES (?, ?)'),
  hist: db.prepare('INSERT INTO historico (t, tipo, evento, msg, aparelho_id, pessoa, adm_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
};
const log = (t, tipo, msg, extra = {}) => ins.hist.run(t, tipo, evento(msg), msg, extra.aparelho ?? null, extra.pessoa ?? null, extra.adm ?? null);

db.exec('BEGIN');

/* ADMs: um por turno + o login da demonstração */
const senhaDemo = hashSenha('demo1234');
const ADMS = [
  ['demo', 'Anderson (demonstração)'], ['carla.mendes', 'Carla Mendes'], ['rogerio.lima', 'Rogério Lima'], ['patricia.nunes', 'Patrícia Nunes']
].map(([login, nome]) => ({ login, nome, id: Number(ins.adm.run(login, nome, senhaDemo, agora - 40 * DIA, agora - entre(1, 600) * MIN).lastInsertRowid) }));
const admDoTurno = i => ADMS[i + 1];

/* Funcionários (por turno) e diaristas */
const pessoas = { 0: [], 1: [], 2: [] }, diaristas = [];
let matricula = 10200;
const qtdTurno = [78, 68, 34];
TURNOS.forEach((t, i) => {
  for (let k = 0; k < qtdTurno[i]; k++) {
    matricula += entre(3, 40);
    const nome = nomeCompleto(), mat = String(matricula);
    ins.func.run(mat, nome, pesoCargo(), um(SETORES), t.nome);
    pessoas[i].push({ chave: 'CLT:' + mat, nome, log: `${nome}, matr. ${mat}` });
  }
});
for (let k = 0; k < 25; k++) {
  const c = cpf(), nome = nomeCompleto();
  ins.dia.run(c, nome, agora - entre(2, 40) * DIA);
  diaristas.push({ chave: 'DIA:' + c, nome, log: `${nome}, diarista, CPF ${cpfMask(c)}` });
}

/* Áreas Wi-Fi do galpão */
const AREAS = ['Recebimento', 'Armazenagem A', 'Armazenagem B', 'Separação', 'Expedição', 'Docas', 'Inventário', 'Sala do ADM'];
const bssidDe = {};
AREAS.forEach((a, i) => { bssidDe[a] = `aa:bb:cc:10:00:${String(i + 1).padStart(2, '0')}`; ins.area.run(bssidDe[a], a); });
const AREAS_OPERACAO = AREAS.slice(0, 7);

/* 64 aparelhos */
const aparelhos = [];
for (let n = 1; n <= 64; n++) {
  const nome = `CT48-${String(n).padStart(2, '0')}`, sn = `UR48${entre(2300, 2499)}${String(entre(1000, 9999))}`;
  const registrado = n <= 62;
  const token = registrado ? createHash('sha256').update(randomBytes(32)).digest('hex') : null;
  const id = Number(ins.ap.run(nome, registrado ? sn : null, token, registrado ? agora : null).lastInsertRowid);
  aparelhos.push({ id, nome, sn, registrado, livreEm: 0 });
  if (registrado) {
    const t = agora - 35 * DIA + n * 7 * MIN;
    log(t - 5 * MIN, 'info', `${nome} cadastrado por ${ADMS[1].nome}`, { aparelho: id, adm: ADMS[1].id });
    log(t, 'info', `${nome} registrado no servidor (SN ${sn})`, { aparelho: id });
  }
}
// Em manutenção / quebrado / perdido nos últimos dias: não entram no rodízio depois disso
const MANUT = {
  'CT48-58': { situacao: 'manutencao', obs: 'Bateria estufando. Enviado para a assistência técnica.', desde: agora - 2 * DIA - 3 * HORA },
  'CT48-59': { situacao: 'quebrado', obs: 'Tela trincada depois de queda na doca 4.', desde: agora - 5 * DIA - 6 * HORA },
  'CT48-60': { situacao: 'perdido', obs: 'Último sinal na Expedição, no fim do 2º turno de ontem.', desde: agora - 20 * HORA }
};
// Fora do rodízio a partir de quando: manutenção/quebra; o perdido sai 7 h antes (a última entrega dele é gerada à parte);
// o CT48-61 está desligado na gaveta há 14 h
const indisponivel = { 'CT48-58': MANUT['CT48-58'].desde, 'CT48-59': MANUT['CT48-59'].desde, 'CT48-60': MANUT['CT48-60'].desde - 7 * HORA, 'CT48-61': agora - 15 * HORA };
const foraDeUso = (a, t) => indisponivel[a.nome] != null && t >= indisponivel[a.nome] - 9 * HORA;

/* ---------- 30 dias de turnos ---------- */
const hm = (base, hhmm) => { const [h, m] = hhmm.split(':').map(Number); const d = new Date(base); d.setHours(h, m, 0, 0); return d.getTime(); };
const turnosNoTempo = [];
for (let d = 30; d >= -1; d--) {
  const dia = agora - d * DIA;
  TURNOS.forEach((t, i) => {
    const ini = hm(dia, t.inicio);
    let fim = hm(dia, t.fim);
    if (fim <= ini) fim += DIA;
    if (ini <= agora) turnosNoTempo.push({ i, t, ini, fim, atual: ini <= agora && agora < fim });
  });
}
turnosNoTempo.sort((a, b) => a.ini - b.ini);
const ultimoFechado = [...turnosNoTempo].reverse().find(x => !x.atual);

const sessoesAbertas = [];
let contaUltimo = 0;   // 2 pessoas do último turno fechado não devolvem
let perdidoQuem = null;

for (const tn of turnosNoTempo) {
  const { i, t, ini, fim, atual } = tn;
  const adm = admDoTurno(i);
  const semana = new Date(ini).getDay();
  const fator = semana === 0 ? 0.35 : semana === 6 ? 0.65 : 1;
  const qtd = Math.max(3, Math.round(t.base * fator) + entre(-4, 4));
  const gente = embaralhar(pessoas[i]).slice(0, qtd);
  if (i < 2 && semana !== 0) gente.push(...embaralhar(diaristas).slice(0, entre(1, 5)));

  // QR de devolução do fim do turno (o ADM gera um, todo mundo lê)
  const qrDevT = fim - entre(28, 35) * MIN;
  if (!atual && qrDevT <= agora) log(qrDevT, 'info', `QR de devolução gerado por ${adm.nome}`, { adm: adm.id });

  for (const p of gente) {
    const tEntrega = ini + entre(-10, 50) * MIN;
    if (tEntrega > agora) continue;
    const a = embaralhar(aparelhos).find(x => x.registrado && x.livreEm < tEntrega - 2 * MIN && !foraDeUso(x, tEntrega));
    if (!a) break;
    log(tEntrega - entre(1, 3) * MIN, 'info', `QR de liberação gerado para ${p.log} por ${adm.nome}`, { pessoa: p.chave, adm: adm.id });
    log(tEntrega, 'ok', `${a.nome} (SN ${a.sn}) entregue para ${p.log}`, { aparelho: a.id, pessoa: p.chave, adm: adm.id });

    // Saída da área no meio do turno (raro)
    if (chance(0.012)) {
      const ts = tEntrega + entre(60, 300) * MIN;
      if (ts < Math.min(fim, agora)) {
        log(ts, 'bad', `Alerta: ${a.nome} (com ${p.nome}) saiu da área da empresa`, { aparelho: a.id, pessoa: p.chave });
        log(ts + entre(6, 25) * MIN, 'info', `${a.nome} voltou para a área da empresa`, { aparelho: a.id, pessoa: p.chave });
      }
    }

    // Turno em andamento: fica com a pessoa
    if (atual) {
      sessoesAbertas.push({ a, p, desde: tEntrega });
      a.livreEm = Infinity;
      continue;
    }
    // 2 aparelhos do último turno fechado não voltaram
    if (tn === ultimoFechado && ++contaUltimo % 4 === 0 && sessoesAbertas.filter(s => s.naoDevolvido).length < 2) {
      sessoesAbertas.push({ a, p, desde: tEntrega, naoDevolvido: true });
      a.livreEm = Infinity;
      continue;
    }

    let tFim, msg, tipo = 'info', admId = adm.id;
    const sorteio = rnd();
    if (sorteio < 0.025) {
      tFim = tEntrega + entre(90, 300) * MIN;
      msg = `${a.nome} bloqueado remotamente por ${adm.nome}. Estava com ${p.nome} há ${dur(tFim - tEntrega)}`;
    } else if (sorteio < 0.74) {
      tFim = Math.max(qrDevT + entre(1, 6) * MIN, fim + entre(-25, 8) * MIN);
      msg = `${a.nome} devolvido por ${p.nome} após ${dur(tFim - tEntrega)} de uso. Devolução por QR de ${adm.nome}`;
    } else if (sorteio < 0.80) {
      // Devolveu atrasado (passou da tolerância depois do turno)
      tFim = fim + entre(25, 140) * MIN;
      msg = `${a.nome} devolvido por ${p.nome} após ${dur(tFim - tEntrega)} de uso. Recebido por ${adm.nome}`;
    } else {
      tFim = fim + entre(-30, 12) * MIN;
      msg = `${a.nome} devolvido por ${p.nome} após ${dur(tFim - tEntrega)} de uso. Recebido por ${adm.nome}`;
    }
    if (tFim > agora) {
      sessoesAbertas.push({ a, p, desde: tEntrega });
      a.livreEm = Infinity;
      continue;
    }
    log(tFim, tipo, msg, { aparelho: a.id, pessoa: p.chave, adm: admId });
    a.livreEm = tFim;
  }

  // QR falso de vez em quando
  if (!atual && chance(0.18)) {
    const a = um(aparelhos.filter(x => x.registrado));
    log(ini + entre(30, 400) * MIN, 'bad', `${a.nome}: QR recusado, não foi gerado pelo sistema`, { aparelho: a.id });
  }
}

/* ---------- Manutenção, perda e bloqueios ---------- */
for (const a of aparelhos) {
  const m = MANUT[a.nome];
  if (!m) continue;
  const adm = ADMS[2];
  if (m.situacao === 'perdido') {
    perdidoQuem = um(pessoas[1]);
    log(m.desde - 6 * HORA, 'ok', `${a.nome} (SN ${a.sn}) entregue para ${perdidoQuem.log}`, { aparelho: a.id, pessoa: perdidoQuem.chave, adm: adm.id });
    log(m.desde, 'info', `${a.nome} marcado como perdido por ${adm.nome}. Estava com ${perdidoQuem.nome} há 6h00`, { aparelho: a.id, pessoa: perdidoQuem.chave, adm: adm.id });
  } else {
    log(m.desde, 'info', `${a.nome} marcado como ${m.situacao === 'quebrado' ? 'quebrado' : 'em manutenção'} por ${adm.nome}: ${m.obs}`, { aparelho: a.id, adm: adm.id });
  }
  db.prepare('UPDATE aparelhos SET manutencao = ?, manutencao_obs = ?, manutencao_desde = ? WHERE id = ?').run(m.situacao, m.obs, m.desde, a.id);
}
const bloquear = (p, motivo, t) => {
  db.prepare('INSERT INTO pessoas_bloqueadas (pessoa, motivo, adm_id, desde) VALUES (?, ?, ?, ?)').run(p.chave, motivo, ADMS[2].id, t);
  log(t, 'bad', `Pessoa bloqueada: ${p.log}, por ${ADMS[2].nome}. Motivo: ${motivo}`, { pessoa: p.chave, adm: ADMS[2].id });
};
bloquear(perdidoQuem, 'Perdeu o CT48-60 no 2º turno', MANUT['CT48-60'].desde + 10 * MIN);
bloquear(um(pessoas[0]), 'Quebrou a tela do CT48-59', MANUT['CT48-59'].desde + 15 * MIN);

/* ---------- Situação de agora ---------- */
const perto = () => ({ lat: CERCA.lat + (rnd() - 0.5) * 0.0018, lng: CERCA.lng + (rnd() - 0.5) * 0.0018, precisao: entre(4, 25) });
const pos = db.prepare(`UPDATE aparelhos SET pessoa = ?, desde = ?, visto = ?, lat = ?, lng = ?, precisao = ?, bssid = ?, area = ?, fora = ?, posicao_em = ?,
  bateria = ?, carregando = ?, bateria_em = ? WHERE id = ?`);

const emUso = embaralhar(sessoesAbertas.filter(s => !s.naoDevolvido));
const semSinal = new Set(emUso.slice(0, 3).map(s => s.a.id));
const bateriaBaixa = new Set(emUso.slice(3, 7).map(s => s.a.id));
const foraAgora = emUso[7];

for (const s of sessoesAbertas) {
  const { a, p, desde } = s;
  const area = um(AREAS_OPERACAO), xy = perto();
  const horas = (agora - desde) / HORA;
  let bat = Math.max(22, Math.round(100 - horas * entre(7, 10)));
  if (bateriaBaixa.has(a.id)) bat = entre(8, 17);
  let visto = agora - entre(0, 8) * 1000;
  if (semSinal.has(a.id)) visto = agora - entre(7, 38) * MIN;
  if (s.naoDevolvido) visto = agora - entre(0, 8) * 1000;
  if (s === foraAgora) {
    pos.run(p.chave, desde, visto, CERCA.lat + 0.011, CERCA.lng - 0.006, 9, null, null, 1, visto, bat, 0, visto, a.id);
    log(agora - 14 * MIN, 'bad', `Alerta: ${a.nome} (com ${p.nome}) saiu da área da empresa`, { aparelho: a.id, pessoa: p.chave });
  } else {
    pos.run(p.chave, desde, visto, xy.lat, xy.lng, xy.precisao, bssidDe[area], area, 0, visto, bat, 0, visto, a.id);
  }
}
// Livres: no carregador da Sala do ADM
for (const a of aparelhos.filter(x => x.registrado && x.livreEm !== Infinity)) {
  const xy = perto();
  const visto = a.nome === 'CT48-61' ? agora - 14 * HORA : MANUT[a.nome] ? agora - entre(2, 30) * HORA : agora - entre(0, 8) * 1000;
  const carregando = !MANUT[a.nome] && a.nome !== 'CT48-61' && chance(0.75);
  pos.run(null, null, visto, xy.lat, xy.lng, xy.precisao, bssidDe['Sala do ADM'], 'Sala do ADM', 0, visto,
    carregando ? entre(55, 100) : entre(30, 90), carregando ? 1 : 0, visto, a.id);
}
// CT48-63: cadastrado agora, esperando registro no app. CT48-64: código venceu.
db.prepare('UPDATE aparelhos SET codigo_registro = ?, codigo_expira = ? WHERE nome = ?').run('K7QM2XHA', agora + 25 * MIN, 'CT48-63');
log(agora - 5 * MIN, 'info', `CT48-63 cadastrado por ${ADMS[1].nome}`, { aparelho: aparelhos[62].id, adm: ADMS[1].id });
log(agora - 3 * DIA, 'info', `CT48-64 cadastrado por ${ADMS[2].nome}`, { aparelho: aparelhos[63].id, adm: ADMS[2].id });

db.exec('COMMIT');

/* ---------- Resumo ---------- */
const n = sql => db.prepare(sql).get().n;
console.log('Banco de demonstração gerado em dados/demo.db');
console.log(`  aparelhos: ${n('SELECT COUNT(*) AS n FROM aparelhos')} (em uso agora: ${n('SELECT COUNT(*) AS n FROM aparelhos WHERE pessoa IS NOT NULL')}, manutenção: ${n('SELECT COUNT(*) AS n FROM aparelhos WHERE manutencao IS NOT NULL')})`);
console.log(`  funcionários: ${n('SELECT COUNT(*) AS n FROM funcionarios')}, diaristas: ${n('SELECT COUNT(*) AS n FROM diaristas')}`);
console.log(`  eventos no histórico: ${n('SELECT COUNT(*) AS n FROM historico')} (entregas: ${n("SELECT COUNT(*) AS n FROM historico WHERE evento = 'entrega'")})`);
console.log('  login do painel: demo / demo1234');
