import { useState } from 'react';
import { Pencil, Plus, Save, Ticket, Trash2, X } from 'lucide-react';
import { Card, CardHeader } from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import { Button, Field, Input, Notice, Select, Switch } from '../components/ui/Form';
import { useAsync } from '../hooks/useAsync';
import { useAction } from '../hooks/useAction';
import * as ep from '../services/endpoints';

const LOJAS = { shopee: 'Shopee', mercadolivre: 'Mercado Livre', amazon: 'Amazon', geral: 'Qualquer loja' };
const SITUACAO = {
  vigente: ['success', 'Vigente'],
  'vence-em-breve': ['warning', 'Vence em breve'],
  aguardando: ['info', 'Ainda não começou'],
  vencido: ['danger', 'Vencido'],
  desligado: ['neutral', 'Desligado'],
};
const dmy = (s) => (s ? s.split('-').reverse().join('/') : '');
const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

function Editor({ inicial, nichos, onClose, onSaved }) {
  const [f, setF] = useState(inicial || { codigo: '', loja: 'shopee', regra: '', validoDe: '', validoAte: hoje(), nichos: [] });
  const { busy, msg, run } = useAction();
  const alternar = (id) => setF({ ...f, nichos: f.nichos.includes(id) ? f.nichos.filter((n) => n !== id) : [...f.nichos, id] });
  const salvar = async () => {
    const corpo = { codigo: f.codigo, loja: f.loja, regra: f.regra, validoDe: f.validoDe, validoAte: f.validoAte, nichos: f.nichos };
    const out = await run('save', () => (f.id ? ep.editCoupon({ id: f.id, ...corpo }) : ep.createCoupon(corpo)));
    if (out) onSaved();
  };
  return (
    <Card className="mb-4">
      <CardHeader title={f.id ? 'Editar cupom' : 'Novo cupom'} subtitle="Só cadastre cupom que vale para qualquer produto da loja. Cupom de um produto específico vai no texto da oferta." />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Código" htmlFor="cp-codigo" hint="Letras, números, - ou _ (3 a 24).">
          <Input id="cp-codigo" value={f.codigo} maxLength={24} onChange={(e) => setF({ ...f, codigo: e.target.value.toUpperCase() })} placeholder="Ex.: SHOPEE10" />
        </Field>
        <Field label="Loja" htmlFor="cp-loja">
          <Select id="cp-loja" value={f.loja} onChange={(e) => setF({ ...f, loja: e.target.value })}>
            {Object.entries(LOJAS).map(([id, r]) => <option key={id} value={id}>{r}</option>)}
          </Select>
        </Field>
        <Field label="Regra (opcional)" htmlFor="cp-regra" hint="Aparece depois do código. Ex.: R$ 10 off acima de R$ 99." className="sm:col-span-2">
          <Input id="cp-regra" value={f.regra} maxLength={120} onChange={(e) => setF({ ...f, regra: e.target.value })} />
        </Field>
        <Field label="Vale a partir de (opcional)" htmlFor="cp-de"><Input id="cp-de" type="date" value={f.validoDe} onChange={(e) => setF({ ...f, validoDe: e.target.value })} /></Field>
        <Field label="Vale até" htmlFor="cp-ate" hint="Até 23:59 desse dia (Brasília)."><Input id="cp-ate" type="date" value={f.validoAte} onChange={(e) => setF({ ...f, validoAte: e.target.value })} /></Field>
      </div>
      <fieldset className="mt-3">
        <legend className="mb-1.5 text-xs font-medium text-muted">Só para estes nichos (vazio = todos)</legend>
        <div className="flex flex-wrap gap-1.5">
          {nichos.map((n) => (
            <button key={n.id} type="button" aria-pressed={f.nichos.includes(n.id)} onClick={() => alternar(n.id)} className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${f.nichos.includes(n.id) ? 'border-brand-400 bg-brand-500/20 text-brand-300' : 'border-line text-muted hover:text-cream'}`}>{n.label}</button>
          ))}
        </div>
      </fieldset>
      <Notice className="mt-3" msg={msg} />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button icon={Save} busy={busy === 'save'} onClick={salvar}>Salvar cupom</Button>
        <Button variant="ghost" icon={X} onClick={onClose}>Cancelar</Button>
      </div>
    </Card>
  );
}

function Linha({ c, onChanged, onEdit }) {
  const { busy, msg, run } = useAction();
  const [tom, rot] = SITUACAO[c.situacao] || ['neutral', c.situacao];
  const apagar = () => {
    if (!window.confirm(`Apagar o cupom ${c.codigo}?`)) return;
    run('apagar', () => ep.removeCoupon(c.id)).then((o) => o && onChanged());
  };
  return (
    <Card className={`mb-3 ${c.situacao === 'vencido' ? 'opacity-70' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-mono text-[15px] font-semibold text-cream">{c.codigo}</h3>
            <Badge variant={tom}>{rot}</Badge>
            <Badge variant="neutral">{LOJAS[c.loja]}</Badge>
          </div>
          {c.regra && <p className="mt-0.5 text-xs text-muted">{c.regra}</p>}
          <p className="mt-0.5 text-xs text-subtle">
            {c.validoDe ? `De ${dmy(c.validoDe)} ` : ''}até {dmy(c.validoAte)}
            {c.nichos.length ? ` · nichos: ${c.nichos.join(', ')}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Switch on={c.ativo} onChange={(v) => run('ativo', () => ep.toggleCoupon(c.id, v)).then((o) => o && onChanged())} disabled={busy === 'ativo'} label={`Usar o cupom ${c.codigo}`} />
          <Button size="sm" variant="ghost" icon={Pencil} onClick={() => onEdit(c)}>Editar</Button>
          <Button size="sm" variant="danger" icon={Trash2} busy={busy === 'apagar'} onClick={apagar}>Apagar</Button>
        </div>
      </div>
      <Notice className="mt-2" msg={msg} />
    </Card>
  );
}

export default function Cupons() {
  const { data: d, error, loading, reload } = useAsync(ep.listCoupons, [], { refreshMs: 60000 });
  const [editor, setEditor] = useState(null);
  const recarregar = () => { setEditor(null); reload({ silent: true }); };
  return (
    <>
      <PageHeader
        title="Cupons"
        subtitle="Cadastre os seus cupons. Use {cupom} no modelo da mensagem ou numa mensagem agendada: só sai cupom vigente, e cupom vencido nunca é enviado."
        actions={<Button icon={Plus} onClick={() => setEditor(false)} disabled={!d}>Novo cupom</Button>}
      />
      {loading && !d && <Card><p className="text-sm text-muted">Carregando…</p></Card>}
      {error && <Card><EmptyState action={<Button size="sm" variant="secondary" onClick={() => reload()}>Tentar de novo</Button>}>{error.message}</EmptyState></Card>}
      {d && editor !== null && <Editor key={editor ? editor.id : 'novo'} inicial={editor || undefined} nichos={d.nichos} onClose={() => setEditor(null)} onSaved={recarregar} />}
      {d && (d.cupons.length === 0 && editor === null ? (
        <Card><EmptyState icon={Ticket}>Nenhum cupom cadastrado. A Shopee não informa os seus cupons pela API, então cadastre aqui os que você usa.</EmptyState></Card>
      ) : d.cupons.map((c) => <Linha key={c.id} c={c} onChanged={recarregar} onEdit={(x) => setEditor(x)} />))}
    </>
  );
}
