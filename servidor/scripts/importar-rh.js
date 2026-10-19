// Substitui a cópia local da base de RH: npm run importar-rh -- caminho/funcionarios.csv
// Colunas: matricula;nome;cargo;setor;turno (aceita ; ou , como separador)
// Também dá para importar pelo painel, na aba Pessoas.
import { readFileSync } from 'node:fs';
import { lerCsvRh, importarRh } from '../src/rh.js';

const arquivo = process.argv[2];
if (!arquivo) { console.error('Uso: npm run importar-rh -- arquivo.csv'); process.exit(1); }
try {
  console.log(`${importarRh(lerCsvRh(readFileSync(arquivo, 'utf8')))} funcionários importados.`);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
