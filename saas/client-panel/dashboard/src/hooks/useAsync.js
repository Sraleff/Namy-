import { useCallback, useEffect, useRef, useState } from 'react';

// Carrega `fn` ao montar; com `refreshMs`, recarrega em segundo plano sem piscar o skeleton.
export function useAsync(fn, deps = [], { refreshMs, enabled = true } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: enabled });
  const alive = useRef(true);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await run();
      if (alive.current) setState({ data, error: null, loading: false });
    } catch (error) {
      if (alive.current) setState((s) => ({ data: silent ? s.data : null, error: silent && s.data ? null : error, loading: false }));
    }
  }, [run]);

  useEffect(() => {
    alive.current = true;
    if (!enabled) return undefined;
    load();
    const t = refreshMs ? setInterval(() => document.visibilityState === 'visible' && load({ silent: true }), refreshMs) : null;
    return () => { alive.current = false; if (t) clearInterval(t); };
  }, [load, enabled, refreshMs]);

  return { ...state, reload: load, setData: (fnOrData) => setState((s) => ({ ...s, data: typeof fnOrData === 'function' ? fnOrData(s.data) : fnOrData })) };
}
