const nf = new Intl.NumberFormat('pt-BR');

export const formatNumber = (n) => nf.format(n);

export const formatDayMonth = (iso) => {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
};

export const formatDate = (iso) => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

// "17 de outubro de 2026" → "17 de Outubro de 2026"
export const formatLongDate = (date = new Date()) =>
  new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })
    .format(date)
    .replace(/ de (\p{L})/u, (_, c) => ` de ${c.toUpperCase()}`);

export const greetingFor = (date = new Date()) => {
  const h = date.getHours();
  if (h < 12) return 'Bom dia!';
  if (h < 18) return 'Boa tarde!';
  return 'Boa noite!';
};

export const cx = (...c) => c.filter(Boolean).join(' ');
