import { useEffect, useState } from 'react';

// Rotas por hash: #pagina ou #pagina/parametro
const parse = () => {
  const [page = '', ...rest] = window.location.hash.replace(/^#\/?/, '').split('/');
  return { page: page || 'inicio', param: decodeURIComponent(rest.join('/')) };
};

export function useHashRoute() {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const on = () => {
      setRoute(parse());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export const go = (page, param) => {
  window.location.hash = param ? `${page}/${encodeURIComponent(param)}` : page;
};
