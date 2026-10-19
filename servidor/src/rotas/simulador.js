// Simulador de CT48 no navegador. Só existe com npm run simulador (--simulador); nunca em produção.
import express, { Router } from 'express';
import { fileURLToPath } from 'node:url';
import { db } from '../db.js';
import { aparelho } from '../middlewares.js';

/** Rota de API que faz o papel da câmera: devolve o QR aberto mais recente. */
export const api = Router();
api.get('/simulador/qr-aberto', aparelho, (req, res) => {
  // De devolução se o aparelho está em uso, de liberação se está bloqueado
  const agora = Date.now(), emUso = !!req.aparelho.pessoa;
  const q = emUso
    ? db.prepare('SELECT token FROM qrs_devolucao WHERE expira > ? ORDER BY expira DESC LIMIT 1').get(agora)
    : db.prepare('SELECT token FROM qrs WHERE usado_por IS NULL AND expira > ? ORDER BY expira DESC LIMIT 1').get(agora);
  res.json({ conteudo: q ? `PDA|${emUso ? 'DEV' : 'LIB'}|${q.token}` : null });
});

/** Página do simulador em /simulador. */
export const pagina = Router();
// Mesmas fontes do protótipo (Google Fonts); o painel continua sem recursos externos
pagina.use((req, res, next) => {
  res.set('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; frame-ancestors 'none'");
  next();
});
pagina.get('/', (req, res) => res.redirect('/simulador/simulador.html'));
pagina.use(express.static(fileURLToPath(new URL('../../simulador/', import.meta.url))));
