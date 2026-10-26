/* Modo claro / noite. Carregado sem defer no <head> para a página já abrir no tema certo (sem piscar).
   Sem escolha salva, segue o sistema. Painel e simulador usam a mesma chave, então a escolha vale para os dois. */
(() => {
  const CHAVE = 'ct48-tema';
  const sistema = matchMedia('(prefers-color-scheme: dark)');
  const ler = () => { try { return localStorage.getItem(CHAVE); } catch { return null; } };
  const atual = () => document.documentElement.dataset.tema || (sistema.matches ? 'escuro' : 'claro');

  function aplicar(tema) {
    if (tema === 'claro' || tema === 'escuro') document.documentElement.dataset.tema = tema;
    else delete document.documentElement.dataset.tema;
    atualizarBotoes();
  }
  function atualizarBotoes() {
    const escuro = atual() === 'escuro';
    document.querySelectorAll('[data-tema-botao]').forEach(b => {
      b.setAttribute('aria-pressed', String(escuro));
      b.title = escuro ? 'Mudar para o modo claro' : 'Mudar para o modo noite';
      const txt = b.querySelector('.tema-txt');
      if (txt) txt.textContent = escuro ? 'Modo claro' : 'Modo noite';
    });
  }

  aplicar(ler());
  sistema.addEventListener('change', () => { if (!ler()) atualizarBotoes(); });
  // Outra aba (painel ou simulador) trocou o tema
  addEventListener('storage', e => { if (e.key === CHAVE) aplicar(e.newValue); });

  document.addEventListener('DOMContentLoaded', () => {
    atualizarBotoes();
    document.addEventListener('click', e => {
      if (!e.target.closest('[data-tema-botao]')) return;
      const novo = atual() === 'escuro' ? 'claro' : 'escuro';
      try { localStorage.setItem(CHAVE, novo); } catch { /* sem armazenamento: vale só nesta página */ }
      aplicar(novo);
    });
  });
})();
