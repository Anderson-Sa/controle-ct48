import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const pasta = fileURLToPath(new URL('../dados/', import.meta.url));
mkdirSync(pasta, { recursive: true });

/** Com --demo o servidor usa um banco separado, com dados de exemplo (npm run demo). O banco real não é tocado. */
export const DEMO = process.argv.includes('--demo');
export const ARQUIVO_BANCO = join(pasta, DEMO ? 'demo.db' : 'ct48.db');

export const db = new DatabaseSync(ARQUIVO_BANCO);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS adms (
    id INTEGER PRIMARY KEY,
    login TEXT UNIQUE NOT NULL,
    nome TEXT NOT NULL,
    senha TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessoes (
    token TEXT PRIMARY KEY,
    adm_id INTEGER NOT NULL REFERENCES adms(id) ON DELETE CASCADE,
    expira INTEGER NOT NULL
  );

  -- Cópia da base de RH (npm run importar-rh). Na integração real, pode virar consulta direta.
  CREATE TABLE IF NOT EXISTS funcionarios (
    matricula TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    cargo TEXT, setor TEXT, turno TEXT
  );
  CREATE TABLE IF NOT EXISTS diaristas (
    cpf TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    criado INTEGER NOT NULL
  );

  -- pessoa: 'CLT:<matrícula>' ou 'DIA:<cpf>'; NULL = aparelho bloqueado
  CREATE TABLE IF NOT EXISTS aparelhos (
    id INTEGER PRIMARY KEY,
    nome TEXT UNIQUE NOT NULL,
    sn TEXT UNIQUE,
    codigo_registro TEXT,
    codigo_expira INTEGER,
    token_hash TEXT UNIQUE,
    pessoa TEXT,
    desde INTEGER,
    visto INTEGER,
    lat REAL, lng REAL, precisao REAL,
    bssid TEXT, area TEXT,
    fora INTEGER NOT NULL DEFAULT 0,
    posicao_em INTEGER
  );

  CREATE TABLE IF NOT EXISTS qrs (
    token TEXT PRIMARY KEY,
    pessoa TEXT NOT NULL,
    adm_id INTEGER,
    expira INTEGER NOT NULL,
    usado_por INTEGER REFERENCES aparelhos(id),
    usado_em INTEGER
  );

  -- QR de devolução: dentro da validade, bloqueia todo aparelho em uso que o ler
  CREATE TABLE IF NOT EXISTS qrs_devolucao (
    token TEXT PRIMARY KEY,
    adm_id INTEGER,
    expira INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS devolucoes_qr (
    token TEXT NOT NULL REFERENCES qrs_devolucao(token),
    aparelho_id INTEGER NOT NULL REFERENCES aparelhos(id),
    t INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS historico (
    id INTEGER PRIMARY KEY,
    t INTEGER NOT NULL,
    tipo TEXT NOT NULL,          -- ok | info | bad
    msg TEXT NOT NULL,
    aparelho_id INTEGER,
    pessoa TEXT,
    adm_id INTEGER
  );
  CREATE INDEX IF NOT EXISTS historico_t ON historico (t DESC);

  -- Cada roteador Wi-Fi do galpão é uma área (Recebimento, Expedição etc.)
  CREATE TABLE IF NOT EXISTS areas_wifi (
    bssid TEXT PRIMARY KEY,
    area TEXT NOT NULL
  );
`);

// Tipo do evento, para filtrar o histórico. Sai do texto para valer também nos registros antigos.
const EVENTOS = [
  ['entrega', / entregue para /],
  ['devolucao', / devolvido por /],
  ['bloqueio', /bloqueado remotamente/],
  ['recusado', /recusado/],
  ['saiu_area', /saiu da área/],
  ['voltou_area', /voltou para a área/],
  ['qr_liberacao', /^QR de liberação gerado/],
  ['qr_devolucao', /^QR de devolução gerado/],
  ['manutencao', / marcado como | voltou a ficar disponível/],
  ['pessoa', /^Pessoa (bloqueada|desbloqueada)/]
];
export const evento = msg => EVENTOS.find(([, re]) => re.test(msg))?.[0] ?? 'cadastro';

if (!db.prepare('PRAGMA table_info(historico)').all().some(c => c.name === 'evento')) {
  db.exec('ALTER TABLE historico ADD COLUMN evento TEXT');
}
{
  const antigos = db.prepare('SELECT id, msg FROM historico WHERE evento IS NULL').all();
  const marcar = db.prepare('UPDATE historico SET evento = ? WHERE id = ?');
  for (const h of antigos) marcar.run(evento(h.msg), h.id);
}
db.exec('CREATE INDEX IF NOT EXISTS historico_aparelho ON historico (aparelho_id, evento, t)');
db.exec('CREATE INDEX IF NOT EXISTS historico_pessoa ON historico (pessoa, evento, t)');

// Colunas novas em bancos que já existiam
function coluna(tabela, nome, tipo) {
  if (!db.prepare(`PRAGMA table_info(${tabela})`).all().some(c => c.name === nome)) db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${nome} ${tipo}`);
}
coluna('aparelhos', 'manutencao', 'TEXT');          // NULL | manutencao | quebrado | perdido
coluna('aparelhos', 'manutencao_obs', 'TEXT');
coluna('aparelhos', 'manutencao_desde', 'INTEGER');
coluna('aparelhos', 'bateria', 'INTEGER');          // 0 a 100, enviado pelo app junto com a posição
coluna('aparelhos', 'carregando', 'INTEGER');
coluna('aparelhos', 'bateria_em', 'INTEGER');
coluna('adms', 'criado', 'INTEGER');
coluna('adms', 'ultimo_acesso', 'INTEGER');

db.exec(`
  -- Quem perdeu ou quebrou aparelho pode ficar impedido de receber outro até o ADM liberar
  CREATE TABLE IF NOT EXISTS pessoas_bloqueadas (
    pessoa TEXT PRIMARY KEY,
    motivo TEXT NOT NULL,
    adm_id INTEGER,
    desde INTEGER NOT NULL
  );
  -- Alertas que um ADM já viu e marcou como resolvidos (a chave identifica cada ocorrência)
  CREATE TABLE IF NOT EXISTS alertas_resolvidos (
    chave TEXT PRIMARY KEY,
    adm_id INTEGER,
    t INTEGER NOT NULL
  );
  -- Configurações editadas pelo painel; valem por cima do config.json
  CREATE TABLE IF NOT EXISTS configuracoes (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    valor TEXT NOT NULL
  );
`);

export function registrar(tipo, msg, extra = {}) {
  db.prepare('INSERT INTO historico (t, tipo, evento, msg, aparelho_id, pessoa, adm_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(Date.now(), tipo, evento(msg), msg, extra.aparelho ?? null, extra.pessoa ?? null, extra.adm ?? null);
}

export function transacao(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}
