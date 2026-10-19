import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';

// config.json fica fora do controle de versão; config.exemplo.json mostra os campos
const arquivo = fileURLToPath(new URL('../config.json', import.meta.url));

const padrao = {
  porta: 3000,
  validadeQrSegundos: 120,
  intervaloEstadoSegundos: 10,
  intervaloPosicaoSegundos: 30,
  cerca: null,            // { lat, lng, raioMetros } — sem cerca, não há alerta de saída por GPS
  appsPermitidos: [],     // pacotes Android que o funcionário pode abrir com o aparelho liberado
  // Alertas
  turnos: [               // o nome tem que bater com a coluna "turno" da base de RH
    { nome: '1º turno', inicio: '06:00', fim: '14:20' },
    { nome: '2º turno', inicio: '14:20', fim: '22:40' },
    { nome: '3º turno', inicio: '22:40', fim: '06:00' }
  ],
  toleranciaTurnoMin: 20, // depois do fim do turno, quanto esperar antes de alertar "não devolvido"
  horasMaxUso: 10,        // sem turno conhecido (ex.: diarista), alerta depois deste tempo de uso
  minutosSemSinal: 5,     // aparelho em uso sem falar com o servidor por mais que isso vira alerta
  bateriaBaixa: 20        // % de bateria que gera alerta (se não estiver carregando)
};

export const config = { ...padrao, ...(existsSync(arquivo) ? JSON.parse(readFileSync(arquivo, 'utf8')) : {}) };

// O que o painel pode editar. Valores salvos no banco valem por cima do config.json.
export const EDITAVEIS = ['validadeQrSegundos', 'cerca', 'appsPermitidos', 'turnos', 'toleranciaTurnoMin', 'horasMaxUso', 'minutosSemSinal', 'bateriaBaixa'];

const salvo = db.prepare('SELECT valor FROM configuracoes WHERE id = 1').get();
if (salvo) {
  const v = JSON.parse(salvo.valor);
  for (const k of EDITAVEIS) if (k in v) config[k] = v[k];
}

export function configEditavel() {
  return Object.fromEntries(EDITAVEIS.map(k => [k, config[k]]));
}

const hhmm = v => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v ?? ''));
const inteiro = (v, min, max, nome) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${nome}: use um número inteiro entre ${min} e ${max}.`);
  return n;
};

/** Confere e salva. Lança Error com mensagem para o ADM se algo estiver errado. */
export function salvarConfig(novo) {
  const c = {};
  c.validadeQrSegundos = inteiro(novo.validadeQrSegundos, 30, 600, 'Validade do QR');
  c.toleranciaTurnoMin = inteiro(novo.toleranciaTurnoMin, 0, 180, 'Tolerância depois do turno');
  c.horasMaxUso = inteiro(novo.horasMaxUso, 1, 24, 'Tempo máximo de uso');
  c.minutosSemSinal = inteiro(novo.minutosSemSinal, 1, 240, 'Minutos sem sinal');
  c.bateriaBaixa = inteiro(novo.bateriaBaixa, 5, 60, 'Bateria baixa');

  if (novo.cerca == null || novo.cerca === '') c.cerca = null;
  else {
    const lat = Number(novo.cerca.lat), lng = Number(novo.cerca.lng);
    if (!(lat >= -90 && lat <= 90) || !(lng >= -180 && lng <= 180)) throw new Error('Cerca: latitude ou longitude inválida.');
    c.cerca = { lat, lng, raioMetros: inteiro(novo.cerca.raioMetros, 50, 20000, 'Raio da cerca') };
  }

  const apps = Array.isArray(novo.appsPermitidos) ? novo.appsPermitidos.map(a => String(a).trim()).filter(Boolean) : [];
  for (const a of apps) if (!/^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)+$/.test(a)) throw new Error(`Pacote de app inválido: ${a}. Use o formato com.empresa.app.`);
  c.appsPermitidos = [...new Set(apps)];

  if (!Array.isArray(novo.turnos)) throw new Error('Turnos inválidos.');
  c.turnos = novo.turnos.map(t => ({ nome: String(t.nome ?? '').trim(), inicio: t.inicio, fim: t.fim }));
  for (const t of c.turnos) {
    if (!t.nome || t.nome.length > 40) throw new Error('Dê um nome a cada turno, igual ao que vem na base de RH.');
    if (!hhmm(t.inicio) || !hhmm(t.fim)) throw new Error(`Turno ${t.nome}: use horários no formato 06:00.`);
  }
  if (new Set(c.turnos.map(t => t.nome.toLowerCase())).size !== c.turnos.length) throw new Error('Há dois turnos com o mesmo nome.');

  db.prepare('INSERT INTO configuracoes (id, valor) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET valor = excluded.valor').run(JSON.stringify(c));
  Object.assign(config, c);
  return configEditavel();
}
