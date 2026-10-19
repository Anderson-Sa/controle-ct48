'use strict';
/* Início: se já existe sessão, abre o painel; senão, mostra o login. Carrega por último. */

api('GET', '/api/me').then(r => entrarNoPainel(r.nome)).catch(() => {});
