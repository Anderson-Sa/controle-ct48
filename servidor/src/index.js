// Servidor do Controle de CT48: API do painel do ADM, API do app do CT48 e os arquivos do painel.
import express from 'express';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';
import { config } from './config.js';
import { erro } from './util.js';
import { rotas as sessao } from './rotas/sessao.js';
import { rotas as entregas } from './rotas/entregas.js';
import { rotas as aparelhos } from './rotas/aparelhos.js';
import { rotas as pessoas } from './rotas/pessoas.js';
import { rotas as monitoramento } from './rotas/monitoramento.js';
import { rotas as sistema } from './rotas/sistema.js';
import { rotas as dispositivo } from './rotas/dispositivo.js';
import * as simulador from './rotas/simulador.js';

const SIMULADOR = process.argv.includes('--simulador');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback');

// A importação do RH recebe o CSV inteiro; o resto da API aceita só corpos pequenos
const jsonPequeno = express.json({ limit: '20kb' }), jsonGrande = express.json({ limit: '8mb' });
app.use((req, res, next) => (req.path === '/api/rh/importar' ? jsonGrande : jsonPequeno)(req, res, next));

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; frame-ancestors 'none'"
  });
  next();
});

// API
app.use('/api', sessao, entregas, aparelhos, pessoas, monitoramento, sistema, dispositivo);
if (SIMULADOR) {
  app.use('/api', simulador.api);
  app.use('/simulador', simulador.pagina);
}
app.use('/api', (req, res) => erro(res, 404, 'Rota não encontrada.'));

// Painel do ADM (HTML, CSS, JS e imagens)
app.use(express.static(fileURLToPath(new URL('../public/', import.meta.url))));

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return erro(res, 400, 'Dados mal formatados.');
  console.error(err);
  erro(res, 500, 'Erro interno no servidor.');
});

const porta = Number(process.env.PORTA) || config.porta;
app.listen(porta, err => {
  if (err) {
    console.error(err.code === 'EADDRINUSE'
      ? `A porta ${porta} já está em uso por outro programa. Troque "porta" no config.json ou rode com PORTA=<número>.`
      : err);
    process.exit(1);
  }
  const adms = db.prepare('SELECT COUNT(*) AS n FROM adms').get().n;
  console.log(`Controle de CT48 rodando em http://localhost:${porta}`);
  if (!adms) console.log('Nenhum ADM cadastrado ainda. Rode: npm run criar-adm');
  if (SIMULADOR) console.log(`Simulador de CT48 (só para testes): http://localhost:${porta}/simulador`);
});
