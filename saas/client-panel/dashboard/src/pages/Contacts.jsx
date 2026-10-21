import { useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { Card, CardHeader } from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import { Button, Field, Input, Notice, Select } from '../components/ui/Form';
import { useAsync } from '../hooks/useAsync';
import { useAction } from '../hooks/useAction';
import * as ep from '../services/endpoints';
import { formatDate } from '../lib/format';

const CONSENT = { autorizado: ['success', 'Autorizado'], nenhum: ['neutral', 'Sem autorização'], revogado: ['danger', 'Revogado'] };

function AddContact({ onAdded }) {
  const [phone, setPhone] = useState('');
  const [label, setLabel] = useState('');
  const { busy, msg, run } = useAction();
  const submit = (e) => {
    e.preventDefault();
    run('add', () => ep.addContact({ stableId: `${phone}@s.whatsapp.net`, phone, label: label || undefined }), (o) => (o.created ? 'Contato adicionado.' : 'Esse contato já existia.'))
      .then((o) => { if (o) { setPhone(''); setLabel(''); onAdded(); } });
  };
  return (
    <Card aria-labelledby="add-title">
      <CardHeader id="add-title" title="Adicionar contato" subtitle="Entra sem autorização. Autorize só quem pediu para receber." />
      <form onSubmit={submit} className="space-y-3">
        <Field label="Número (DDI+DDD)" htmlFor="c-phone"><Input id="c-phone" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} placeholder="5511999999999" /></Field>
        <Field label="Nome / apelido" htmlFor="c-label"><Input id="c-label" value={label} onChange={(e) => setLabel(e.target.value)} /></Field>
        <Notice msg={msg} />
        <Button type="submit" icon={Plus} busy={busy === 'add'} disabled={phone.length < 10}>Adicionar</Button>
      </form>
    </Card>
  );
}

export default function Contacts({ query = '' }) {
  const { data, loading, error, reload, setData } = useAsync(ep.listContacts, []);
  const [q, setQ] = useState(query);
  const [filter, setFilter] = useState('');
  const { busy, msg, run } = useAction();
  const contacts = data?.contacts || [];

  const list = useMemo(() => contacts.filter((c) =>
    (!filter || c.consent === filter) &&
    (`${c.label} ${c.phone}`.toLowerCase().includes(q.toLowerCase()))), [contacts, q, filter]);

  const changeConsent = (c, consent) => run(c.id, async () => {
    const out = await ep.setConsent(c.id, consent);
    setData((d) => ({ ...d, contacts: d.contacts.map((x) => (x.id === c.id ? out.contact : x)) }));
  });

  return (
    <>
      <PageHeader title="Contatos" subtitle={`${contacts.length} contatos · ${contacts.filter((c) => c.consent === 'autorizado').length} autorizados a receber campanhas`} />
      {error && <Notice className="mb-4" msg={{ tone: 'error', text: error.message }} />}
      <Notice className="mb-4" msg={msg} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="p-0">
          <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
              <Input aria-label="Buscar contatos" placeholder="Buscar nome ou número…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-10" />
            </div>
            <Select aria-label="Filtrar por autorização" value={filter} onChange={(e) => setFilter(e.target.value)} className="sm:w-48">
              <option value="">Todos</option>
              <option value="autorizado">Autorizados</option>
              <option value="nenhum">Sem autorização</option>
              <option value="revogado">Revogados</option>
            </Select>
          </div>
          {!loading && !list.length && (
            <div className="p-4"><EmptyState>Nenhum contato. Importe de um grupo em <a href="#grupos" className="link-subtle">Grupos</a> ou adicione ao lado.</EmptyState></div>
          )}
          <ul className="divide-y divide-line">
            {list.map((c) => {
              const [variant, label] = CONSENT[c.consent] || CONSENT.nenhum;
              return (
                <li key={c.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-cream">{c.label}</p>
                    <p className="tabular text-xs text-subtle">{c.phone ? `+${c.phone}` : 'número oculto (LID)'} · {c.origin === 'grupo' ? 'veio de grupo' : 'manual'} · {(c.createdAt ? formatDate(c.createdAt.slice(0, 10)) : '—')}</p>
                  </div>
                  <Badge variant={variant}>{label}</Badge>
                  <Select
                    aria-label={`Autorização de ${c.label}`} value={c.consent} disabled={busy === c.id}
                    onChange={(e) => changeConsent(c, e.target.value)} className="h-8 text-xs sm:w-40"
                  >
                    <option value="nenhum">Sem autorização</option>
                    <option value="autorizado">Autorizar</option>
                    <option value="revogado">Revogar</option>
                  </Select>
                </li>
              );
            })}
          </ul>
        </Card>
        <div><AddContact onAdded={() => reload({ silent: true })} /></div>
      </div>
    </>
  );
}
