import { useState } from 'react';
import { Eye, Pencil, Power, RotateCcw, Save, Trash2, X } from 'lucide-react';
import { Card } from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import { Button, Field, Input, Notice, Select, Textarea } from '../components/ui/Form';
import { useAsync } from '../hooks/useAsync';
import { useAction } from '../hooks/useAction';
import * as ep from '../services/endpoints';

const MK = { shopee: 'Shopee', mercadolivre: 'Mercado Livre', amazon: 'Amazon' };
const STATUS = {
  fila: ['info', 'Na fila'],
  enviado: ['success', 'Enviado'],
  pulado: ['warning', 'Pulado'],
  erro: ['danger', 'Erro'],
  pausado: ['neutral', 'Pausado'],
  expirado: ['neutral', 'Expirado'],
};
const FILTROS = [
  ['', 'Todos', 'todos'],
  ['fila', 'Na fila', 'fila'],
  ['enviado', 'Enviados', 'enviado'],
  ['pulado', 'Pulados', 'pulado'],
  ['erro', 'Com erro', 'erro'],
  ['pausado', 'Pausados', 'pausado'],
  ['expirado', 'Expirados', 'expirado'],
];
const PRIORIDADE = [[0, 'Normal'], [1, 'Alta'], [2, 'Urgente']];
const fmt = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const PASSO = 25;

function validade(iso) {
  const h = (new Date(iso).getTime() - Date.now()) / 3600000;
  if (h <= 0) return 'venceu';
  if (h < 1) return 'vence em menos de 1h';
  if (h < 48) return `vence em ${Math.floor(h)}h`;
  return `vence em ${Math.floor(h / 24)} dias`;
}

function Editor({ item, onClose, onSaved }) {
  const fotoInicial = item.imagemTipo === 'url' ? item.imagemUrl : '';
  const [nome, setNome] = useState(item.nome);
  const [texto, setTexto] = useState(item.texto);
  const [foto, setFoto] = useState(fotoInicial);
  const [removerFoto, setRemoverFoto] = useState(false);
  const [renovar, setRenovar] = useState(false);
  const { busy, msg, run } = useAction();

  const salvar = async () => {
    const body = { id: item.id };
    if (nome !== item.nome) body.nome = nome;
    if (texto !== item.texto) body.texto = texto;
    if (removerFoto) body.imagemUrl = '';
    else if (foto !== fotoInicial) body.imagemUrl = foto.trim();
    if (renovar) body.renovarValidade = true;
    if (Object.keys(body).length === 1) return onClose();
    const out = await run('save', () => ep.editProduct(body));
    if (out) onSaved();
  };

  return (
    <div className="mt-4 space-y-3 rounded-xl border border-line bg-ink-850 p-4">
      <Field label="Nome" htmlFor={`ed-nome-${item.id}`}>
        <Input id={`ed-nome-${item.id}`} value={nome} maxLength={120} onChange={(e) => setNome(e.target.value)} />
      </Field>
      <Field label="Texto da oferta" htmlFor={`ed-txt-${item.id}`} hint="O preço, o cupom e a chamada para a compra ficam dentro do texto. Só os links são trocados pelos seus no envio.">
        <Textarea id={`ed-txt-${item.id}`} rows={7} value={texto} maxLength={3500} onChange={(e) => setTexto(e.target.value)} />
      </Field>
      <Field
        label="Foto (link https)"
        htmlFor={`ed-foto-${item.id}`}
        hint={item.imagemTipo === 'arquivo' ? 'A foto atual está salva no servidor. Informe um link para trocá-la.' : 'Deixe vazio para enviar sem foto.'}
      >
        <Input id={`ed-foto-${item.id}`} type="url" value={foto} disabled={removerFoto} placeholder="https://…" onChange={(e) => setFoto(e.target.value)} />
      </Field>
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted">
        {item.imagemTipo && (
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" className="h-4 w-4 accent-indigo-500" checked={removerFoto} onChange={(e) => setRemoverFoto(e.target.checked)} /> Remover a foto
          </label>
        )}
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" className="h-4 w-4 accent-indigo-500" checked={renovar} onChange={(e) => setRenovar(e.target.checked)} /> Renovar a validade
        </label>
      </div>
      <Notice msg={msg} />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" icon={Save} busy={busy === 'save'} onClick={salvar}>Salvar</Button>
        <Button size="sm" variant="ghost" icon={X} onClick={onClose}>Cancelar</Button>
      </div>
    </div>
  );
}

function Previa({ data }) {
  const p = data.previa;
  return (
    <div className="mt-4 space-y-2 rounded-xl border border-line bg-ink-850 p-4">
      <Badge variant={p.ok ? 'success' : 'danger'} dot>{p.ok ? 'Pronta para enviar' : 'Barrada'}</Badge>
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words font-sans text-sm text-cream">{p.texto}</pre>
      {p.erros.length > 0 && (
        <ul className="space-y-1 text-[11px] text-rose-300">
          {p.erros.map((e, i) => <li key={i} className="break-all">✗ {e.motivo}{e.url ? ` — ${e.url}` : ''}</li>)}
        </ul>
      )}
    </div>
  );
}

function Linha({ item, onChanged }) {
  const [editando, setEditando] = useState(false);
  const [previa, setPrevia] = useState(null);
  const { busy, msg, run } = useAction();
  const [variant, rotulo] = STATUS[item.status] || STATUS.fila;
  const depois = () => onChanged();

  const mudarPrioridade = (e) => run('pr', () => ep.editProduct({ id: item.id, prioridade: Number(e.target.value) })).then((o) => o && depois());
  const reenfileirar = () => run('rq', () => ep.requeueProduct(item.id), 'A oferta voltou para o começo da fila.').then((o) => o && depois());
  const alternar = () => run('tg', () => ep.togglePool(item.id, !item.ativo)).then((o) => o && depois());
  const remover = () => {
    if (!window.confirm(`Remover "${item.nome}" da fila?`)) return;
    run('rm', () => ep.removePool(item.id)).then((o) => o && depois());
  };
  const verPrevia = () => (previa ? setPrevia(null) : run('pv', () => ep.previewOffer({ id: item.id })).then((o) => o && setPrevia(o)));

  const motivo = item.status === 'erro' ? item.ultimoErro : item.status === 'pulado' ? item.ultimoPulo : null;

  return (
    <li className="p-4">
      <div className="flex gap-3">
        {item.imagemUrl && (
          <img
            src={item.imagemUrl} alt="" loading="lazy" className="hidden h-14 w-14 shrink-0 rounded-lg bg-ink-850 object-cover sm:block"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="min-w-0 max-w-full truncate text-sm font-medium text-cream" title={item.nome}>{item.nome}</p>
            <Badge variant={variant} dot>{rotulo}</Badge>
            {item.prioridade > 0 && <Badge variant="warning">{PRIORIDADE[item.prioridade][1]}</Badge>}
            <Badge>{item.nicho}</Badge>
            {item.marketplaces.map((m) => <Badge key={m} variant="info">{MK[m] || m}</Badge>)}
          </div>
          <p className="mt-1 text-xs text-subtle">
            {item.origem === 'grupo' ? `Capturada de ${item.origemGrupo || 'grupo'}` : 'Colada à mão'} · {item.envios} envio(s) · {validade(item.expiresAt)}
            {item.editadoEm ? ` · editada ${fmt.format(new Date(item.editadoEm))}` : ''}
          </p>
          {motivo && <p className="mt-1 break-words text-[11px] text-amber-300">Último motivo: {motivo.motivo}</p>}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          <span aria-hidden="true" className="text-xs text-subtle">Prioridade</span>
          <Select aria-label={`Prioridade de ${item.nome}`} value={item.prioridade} onChange={mudarPrioridade} disabled={busy === 'pr'} className="h-8 w-32 text-xs">
            {PRIORIDADE.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </div>
        <Button size="sm" variant="secondary" icon={Pencil} onClick={() => setEditando((v) => !v)}>Editar</Button>
        <Button size="sm" variant="secondary" icon={Eye} busy={busy === 'pv'} onClick={verPrevia}>{previa ? 'Fechar prévia' : 'Prévia'}</Button>
        <Button size="sm" variant="secondary" icon={RotateCcw} busy={busy === 'rq'} onClick={reenfileirar}>Reenfileirar</Button>
        <Button size="sm" variant="secondary" icon={Power} busy={busy === 'tg'} onClick={alternar}>{item.ativo ? 'Pausar' : 'Ativar'}</Button>
        <Button size="sm" variant="danger" icon={Trash2} busy={busy === 'rm'} onClick={remover}>Remover</Button>
      </div>
      <Notice className="mt-3" msg={msg} />
      {editando && <Editor item={item} onClose={() => setEditando(false)} onSaved={() => { setEditando(false); setPrevia(null); depois(); }} />}
      {previa && <Previa data={previa} />}
    </li>
  );
}

export default function Produtos() {
  const [status, setStatus] = useState('');
  const [limite, setLimite] = useState(PASSO);
  const lista = useAsync(() => ep.listProducts(status, limite), [status, limite], { refreshMs: 30000 });
  const d = lista.data;

  const trocarFiltro = (v) => { setStatus(v); setLimite(PASSO); };
  const recarregar = () => lista.reload({ silent: true });

  return (
    <>
      <PageHeader
        title="Fila de produtos"
        subtitle="As ofertas que o bot envia aos seus grupos, na ordem de saída: prioridade primeiro, depois as mais novas."
        actions={<a href="#ofertas" className="link-subtle self-center">Colar ou capturar ofertas →</a>}
      />

      <nav aria-label="Filtrar por status" className="mb-4 flex flex-wrap gap-2">
        {FILTROS.map(([valor, rotulo, chave]) => {
          const ativo = status === valor;
          return (
            <button
              key={chave}
              type="button"
              aria-pressed={ativo}
              onClick={() => trocarFiltro(valor)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${ativo ? 'border-brand-500/60 bg-brand-500/15 text-brand-300' : 'border-line text-muted hover:bg-white/[0.04] hover:text-cream'}`}
            >
              {rotulo} <span className="tabular ml-1 text-subtle">{d ? d.contadores[chave] ?? 0 : '–'}</span>
            </button>
          );
        })}
      </nav>

      {lista.error && <Notice className="mb-4" msg={{ tone: 'error', text: `Não consegui carregar a fila: ${lista.error.message}` }} />}

      <Card className="p-0" aria-label="Fila de produtos">
        {lista.loading && !d && <p className="p-6 text-sm text-muted">Carregando a fila…</p>}
        {d && !d.itens.length && (
          <div className="p-4">
            <EmptyState action={<a href="#ofertas" className="link-subtle">Adicionar ofertas</a>}>
              {status ? 'Nenhuma oferta com esse status.' : 'A fila está vazia. Cole uma oferta ou escolha um grupo fonte em Ofertas.'}
            </EmptyState>
          </div>
        )}
        {d && d.itens.length > 0 && (
          <ul className="divide-y divide-line">
            {d.itens.map((it) => <Linha key={it.id} item={it} onChanged={recarregar} />)}
          </ul>
        )}
        {d && d.total > d.itens.length && (
          <div className="flex items-center justify-between gap-3 border-t border-line p-3 text-xs text-muted">
            <span>Mostrando {d.itens.length} de {d.total}</span>
            <Button size="sm" variant="secondary" onClick={() => setLimite((l) => l + PASSO)}>Mostrar mais</Button>
          </div>
        )}
      </Card>
    </>
  );
}
