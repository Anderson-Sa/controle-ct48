// Alertas do painel: calculados na hora a partir da situação dos aparelhos e do histórico recente.
// Cada ocorrência tem uma chave própria; quando o ADM marca como resolvido, só aquela ocorrência some.
import { db } from './db.js';
import { config } from './config.js';
import { pessoaJSON, turnoDaPessoa } from './pessoas.js';
import { dur } from './util.js';

const MIN = 60000, HORA = 60 * MIN;
const hm = t => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

// Próxima vez que o relógio marca hh:mm depois do instante dado
function proximo(hhmm, depoisDe) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(depoisDe);
  d.setHours(h, m, 0, 0);
  if (d.getTime() <= depoisDe) d.setDate(d.getDate() + 1);
  return d.getTime();
}

/** Até quando o aparelho deveria voltar: fim do turno + tolerância, ou o tempo máximo de uso (o que vier antes). */
export function prazoDevolucao(a) {
  const porTempo = a.desde + config.horasMaxUso * HORA;
  const turno = turnoDaPessoa(a.pessoa);
  if (turno) {
    const fimTurno = proximo(turno.fim, a.desde);
    const porTurno = fimTurno + config.toleranciaTurnoMin * MIN;
    if (porTurno <= porTempo) return { limite: porTurno, turno: turno.nome, fimTurno };
  }
  return { limite: porTempo, turno: null };
}

const GRAVIDADE = { alta: 0, media: 1, baixa: 2 };

export function listarAlertas() {
  const agora = Date.now();
  const resolvidos = new Set(db.prepare('SELECT chave FROM alertas_resolvidos').all().map(r => r.chave));
  const lista = [];
  const add = (a, x) => {
    const p = a?.pessoa ? pessoaJSON(a.pessoa) : x.pessoaChave ? pessoaJSON(x.pessoaChave) : null;
    delete x.pessoaChave;
    lista.push({
      ...x,
      aparelho: a ? { id: a.id, nome: a.nome } : null,
      pessoa: p ? { nome: p.nome, ident: p.ident } : null,
      resolvido: resolvidos.has(x.chave)
    });
  };

  for (const a of db.prepare('SELECT * FROM aparelhos').all()) {
    const quem = a.pessoa ? pessoaJSON(a.pessoa).nome : null;

    if (a.pessoa && a.desde) {
      const prazo = prazoDevolucao(a);
      if (agora > prazo.limite) {
        add(a, {
          chave: `devolucao:${a.id}:${a.desde}`, tipo: 'nao_devolvido', gravidade: 'alta', desde: prazo.limite,
          titulo: `${a.nome} não foi devolvido`,
          detalhe: prazo.turno
            ? `O ${prazo.turno} de ${quem} acabou às ${hm(prazo.fimTurno)}. Está com o aparelho desde ${hm(a.desde)}.`
            : `${quem} está com o aparelho há ${dur(agora - a.desde)}, mais que o limite de ${config.horasMaxUso}h.`
        });
      }
    }

    if (a.fora) {
      const ev = db.prepare("SELECT id, t FROM historico WHERE aparelho_id = ? AND evento = 'saiu_area' ORDER BY t DESC LIMIT 1").get(a.id);
      add(a, {
        chave: `fora:${a.id}:${ev?.id ?? 0}`, tipo: 'fora_area', gravidade: 'alta', desde: ev?.t ?? a.posicao_em ?? agora,
        titulo: `${a.nome} está fora da área da empresa`,
        detalhe: quem ? `Está com ${quem}. Última posição ${a.posicao_em ? 'há ' + dur(agora - a.posicao_em) : 'desconhecida'}.` : 'Ninguém está com o aparelho no sistema.'
      });
    }

    // Em manutenção, quebrado ou perdido: parado de propósito, sinal e bateria não interessam
    if (a.token_hash && a.visto && !a.manutencao) {
      const semSinal = agora - a.visto;
      if (a.pessoa ? semSinal > config.minutosSemSinal * MIN : semSinal > 12 * HORA) {
        add(a, {
          chave: `sinal:${a.id}:${a.visto}`, tipo: 'sem_sinal', gravidade: a.pessoa ? 'media' : 'baixa', desde: a.visto,
          titulo: `${a.nome} sem sinal há ${dur(semSinal)}`,
          detalhe: quem ? `Está com ${quem}. Pode estar sem Wi-Fi, desligado ou fora da empresa.` : 'Está guardado, mas não fala com o servidor. Pode estar desligado ou sem bateria.'
        });
      }
    }

    if (!a.manutencao && a.bateria != null && !a.carregando && a.bateria <= config.bateriaBaixa && a.bateria_em && agora - a.bateria_em < 30 * MIN) {
      add(a, {
        chave: `bateria:${a.id}:${a.desde ?? new Date().toDateString()}`, tipo: 'bateria', gravidade: a.pessoa ? 'media' : 'baixa', desde: a.bateria_em,
        titulo: `${a.nome} com bateria baixa (${a.bateria}%)`,
        detalhe: quem ? `Está com ${quem}. Peça para trocar de aparelho ou carregar.` : 'Coloque para carregar antes de entregar.'
      });
    }

    if (a.manutencao === 'perdido') {
      add(a, {
        chave: `perdido:${a.id}:${a.manutencao_desde}`, tipo: 'perdido', gravidade: 'alta', desde: a.manutencao_desde,
        titulo: `${a.nome} marcado como perdido`,
        detalhe: a.manutencao_obs || 'Sem observação.'
      });
    }
  }

  // QR falsos das últimas 24 horas, um alerta por aparelho (a chave muda quando há tentativa nova)
  for (const h of db.prepare(`SELECT MAX(h.id) AS id, MAX(h.t) AS t, COUNT(*) AS n, a.id AS aid, a.nome FROM historico h
      LEFT JOIN aparelhos a ON a.id = h.aparelho_id WHERE h.evento = 'recusado' AND h.t > ? GROUP BY h.aparelho_id`).all(agora - 24 * HORA)) {
    add(h.aid ? { id: h.aid, nome: h.nome } : null, {
      chave: `hist:${h.id}`, tipo: 'qr_falso', gravidade: 'media', desde: h.t,
      titulo: `QR falso lido${h.nome ? ' no ' + h.nome : ''}${h.n > 1 ? ` (${h.n} vezes)` : ''}`,
      detalhe: `Alguém tentou liberar ou devolver com um código que não foi gerado pelo painel${h.n > 1 ? `. A última tentativa foi às ${hm(h.t)}` : ''}.`
    });
  }

  return lista.sort((a, b) => GRAVIDADE[a.gravidade] - GRAVIDADE[b.gravidade] || b.desde - a.desde);
}

export function resolverAlerta(chave, admId) {
  db.prepare('INSERT OR IGNORE INTO alertas_resolvidos (chave, adm_id, t) VALUES (?, ?, ?)').run(String(chave).slice(0, 120), admId, Date.now());
  // Limpa marcações antigas (as ocorrências já mudaram de chave)
  db.prepare('DELETE FROM alertas_resolvidos WHERE t < ?').run(Date.now() - 30 * 24 * HORA);
}
