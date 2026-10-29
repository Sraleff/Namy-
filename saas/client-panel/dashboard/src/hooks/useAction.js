import { useCallback, useState } from 'react';

// Executa uma ação da API guardando "ocupado" e a mensagem de retorno.
export function useAction() {
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);

  const run = useCallback(async (key, fn, okText) => {
    setBusy(key);
    setMsg(null);
    try {
      const out = await fn();
      const text = typeof okText === 'function' ? okText(out) : okText;
      if (text) setMsg({ tone: 'ok', text });
      return out;
    } catch (e) {
      setMsg({ tone: 'error', text: e.message });
      return undefined;
    } finally {
      setBusy(null);
    }
  }, []);

  return { busy, msg, setMsg, run };
}
