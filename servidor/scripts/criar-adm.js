// Cria um ADM ou troca a senha de um existente: npm run criar-adm
import { createInterface } from 'node:readline/promises';
import { db } from '../src/db.js';
import { hashSenha } from '../src/auth.js';

const perguntas = ['Login do ADM: ', 'Nome para exibir: ', 'Senha (mínimo 8 caracteres): '];
let respostas;
if (process.stdin.isTTY) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  respostas = [];
  for (const p of perguntas) respostas.push(await rl.question(p));
  rl.close();
} else {
  // Entrada redirecionada (scripts): uma resposta por linha
  let texto = '';
  for await (const parte of process.stdin) texto += parte;
  respostas = texto.split(/\r?\n/);
}
const login = (respostas[0] ?? '').trim().toLowerCase();
const nome = (respostas[1] ?? '').trim();
const senha = respostas[2] ?? '';

if (!/^[a-z0-9._-]{3,40}$/.test(login)) { console.error('Login inválido: use letras, números, ponto ou hífen.'); process.exit(1); }
if (!nome) { console.error('Informe o nome.'); process.exit(1); }
if (senha.length < 8) { console.error('A senha precisa ter pelo menos 8 caracteres.'); process.exit(1); }

db.prepare('INSERT INTO adms (login, nome, senha) VALUES (?, ?, ?) ON CONFLICT(login) DO UPDATE SET nome = excluded.nome, senha = excluded.senha')
  .run(login, nome, hashSenha(senha));
console.log(`ADM "${login}" salvo.`);
