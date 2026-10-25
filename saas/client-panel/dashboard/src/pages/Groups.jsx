import { useMemo, useState } from 'react';
import { RefreshCw, Save, Search, Send, UserPlus } from 'lucide-react';
import { Card } from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import { Button, Input, Notice, Select } from '../components/ui/Form';
import { useAsync } from '../hooks/useAsync';
import { useAction } from '../hooks/useAction';
import * as ep from '../services/endpoints';
import { formatNumber } from '../lib/format';

// Nicho do grupo: só para grupos já salvos na divulgação
function NicheSelect({ group, niches, onSaved }) {
  const [value, setValue] = useState(group.niche || 'geral');
  const [busy, setBusy] = useState(false);
  const change = async (e) => {
    const next = e.target.value;
    setValue(next);
    setBusy(true);
    try { await ep.setGroupNiche(group.jid, next); onSaved?.(`Nicho de "${group.name}": ${niches.find((n) => n.id === next)?.label || next}.`); }
    catch (err) { setValue(group.niche || 'geral'); onSaved?.(err.message, 'error'); }
    finally { setBusy(false); }
  };
  return (
    <Select aria-label={`Nicho de ${group.name}`} value={value} onChange={change} disabled={busy} className="h-8 w-44 text-xs">
      {niches.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
    </Select>
  );
}

export default function Groups({ query = '' }) {
  const { data, loading, error, reload } = useAsync(ep.waGroups, []);
  const summary = useAsync(ep.affiliateSummary, []);
  const niches = summary.data?.nichos || [];
  const savedBy = new Map((data?.selected || []).map((g) => [g.jid, g]));
  const [q, setQ] = useState(query);
  const [picked, setPicked] = useState(null); // Set de jids escolhidos (null = ainda não editado)
  const { busy, msg, setMsg, run } = useAction();
  const nicheSaved = (text, tone = 'ok') => { setMsg({ tone, text }); if (tone === 'ok') reload({ silent: true }); };

  const groups = data?.groups || [];
  const selected = picked ?? new Set((data?.selected || []).map((g) => g.jid));
  const filtered = useMemo(
    () => groups.filter((g) => g.name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => b.participants - a.participants),
    [groups, q],
  );
  const dirty = picked !== null;

  const toggle = (jid) => {
    const next = new Set(selected);
    next.has(jid) ? next.delete(jid) : next.add(jid);
    setPicked(next);
  };

  const save = () => run('save', async () => {
    const list = groups.filter((g) => selected.has(g.jid)).map(({ jid, name }) => ({ jid, name }));
    await ep.saveAdGroups(list);
    setPicked(null);
    await reload({ silent: true });
  }, `Grupos da divulgação salvos.`);

  return (
    <>
      <PageHeader
        title="Grupos"
        subtitle="Escolha em quais grupos o bot publica e o nicho de cada um. Grupo com nicho só recebe oferta compatível."
        actions={
          <>
            <Button variant="secondary" icon={RefreshCw} onClick={() => { setPicked(null); reload(); }}>Atualizar</Button>
            <Button icon={Save} busy={busy === 'save'} disabled={!dirty} onClick={save}>Salvar seleção ({selected.size})</Button>
          </>
        }
      />

      <Notice className="mb-4" msg={msg} />
      {dirty && <Notice className="mb-4" msg={{ tone: 'info', text: 'Salve a seleção para escolher o nicho dos grupos novos.' }} />}

      {error ? (
        <Card>
          <EmptyState action={<a href="#configuracoes" className="link-subtle">Conectar WhatsApp</a>}>
            {/intervalo|limite/i.test(error.message) ? `${error.message}.` : `${error.message}. Conecte o WhatsApp para ver seus grupos.`}
          </EmptyState>
        </Card>
      ) : (
        <Card className="p-0">
          <div className="flex items-center gap-3 border-b border-line p-4">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
              <Input aria-label="Filtrar grupos" placeholder="Filtrar por nome…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-10" />
            </div>
            <span className="hidden text-xs text-subtle sm:block">{loading ? 'Carregando…' : `${filtered.length} de ${groups.length}`}</span>
          </div>

          {!loading && !filtered.length && <div className="p-4"><EmptyState>Nenhum grupo encontrado.</EmptyState></div>}

          <ul className="divide-y divide-line">
            {filtered.map((g) => {
              const on = selected.has(g.jid);
              return (
                <li key={g.jid} className="flex flex-col gap-3 p-4 transition-colors hover:bg-white/[0.02] sm:flex-row sm:items-center">
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                    <input type="checkbox" checked={on} onChange={() => toggle(g.jid)} className="h-4 w-4 shrink-0 accent-indigo-500" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-cream">{g.name}</span>
                      <span className="block text-xs text-subtle">{formatNumber(g.participants)} membros</span>
                    </span>
                    {on && <Badge variant="info">Divulgação</Badge>}
                  </label>
                  <div className="flex flex-wrap gap-2 pl-7 sm:pl-0">
                    {on && savedBy.has(g.jid) && niches.length > 0 && (
                      <NicheSelect key={`${g.jid}-${savedBy.get(g.jid).niche}`} group={savedBy.get(g.jid)} niches={niches} onSaved={nicheSaved} />
                    )}
                    <Button
                      size="sm" variant="secondary" icon={UserPlus} busy={busy === `imp-${g.jid}`}
                      onClick={() => run(`imp-${g.jid}`, () => ep.importGroupContacts(g.jid), (o) => `${o.total} contatos registrados (sem autorização — autorize em Contatos).`)}
                    >
                      Importar contatos
                    </Button>
                    <Button
                      size="sm" variant="secondary" icon={Send} busy={busy === `test-${g.jid}`}
                      onClick={() => run(`test-${g.jid}`, () => ep.adTestToGroup(g.jid), (o) => o.message || 'Oferta de teste enviada.')}
                    >
                      Testar anúncio
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}
