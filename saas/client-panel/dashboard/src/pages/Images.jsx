import { useState } from 'react';
import { Star, Trash2, Wand2 } from 'lucide-react';
import { Card, CardHeader } from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import { Button, Field, Notice, Select } from '../components/ui/Form';
import { useAsync } from '../hooks/useAsync';
import { useAction } from '../hooks/useAction';
import { cx } from '../lib/format';
import * as ep from '../services/endpoints';

function Gallery({ product, cenarios, disponivel, onGenerated }) {
  const [cenario, setCenario] = useState(cenarios[0]?.id || 'cozinha');
  const imgs = useAsync(() => ep.listImages(product.produtoKey), [product.produtoKey]);
  const { busy, msg, run } = useAction();
  const label = (id) => cenarios.find((c) => c.id === id)?.label || id;

  const gerar = () => run('gen', () => ep.generateImage({ produtoKey: product.produtoKey, nome: product.nome, cenario }), 'Imagem gerada.')
    .then((o) => { if (o) { imgs.reload({ silent: true }); onGenerated(); } });
  const after = () => imgs.reload({ silent: true });

  return (
    <Card aria-labelledby="gal-title">
      <CardHeader id="gal-title" title={product.nome || 'Produto'} subtitle="A imagem preferida vai na divulgação se “Usar imagem gerada” estiver ligado em Automações." />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field label="Cenário" htmlFor="cen" className="flex-1">
          <Select id="cen" value={cenario} onChange={(e) => setCenario(e.target.value)}>
            {cenarios.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </Select>
        </Field>
        <Button icon={Wand2} busy={busy === 'gen'} disabled={!disponivel} onClick={gerar}>Gerar imagem</Button>
      </div>
      <Notice className="mt-3" msg={msg} />
      {busy === 'gen' && <p className="mt-3 text-xs text-subtle">Gerando… pode levar até 1 minuto.</p>}

      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3">
        <figure className="overflow-hidden rounded-xl border border-line">
          <img src={product.imageUrl} alt={`Foto original: ${product.nome}`} className="aspect-square w-full object-cover" loading="lazy" />
          <figcaption className="p-2 text-[11px] text-subtle">Original</figcaption>
        </figure>
        {(imgs.data?.itens || []).map((i) => (
          <figure key={i.id} className={cx('overflow-hidden rounded-xl border', i.preferida ? 'border-brand-500' : 'border-line')}>
            <img src={i.url} alt={`${product.nome} — ${label(i.cenario)}`} className="aspect-square w-full object-cover" loading="lazy" />
            <figcaption className="flex items-center justify-between gap-2 p-2">
              <span className="truncate text-[11px] text-subtle">{label(i.cenario)}</span>
              <span className="flex gap-1">
                <Button size="sm" variant={i.preferida ? 'primary' : 'ghost'} icon={Star} aria-label={i.preferida ? 'Tirar preferida' : 'Usar esta na divulgação'} busy={busy === `s-${i.id}`} onClick={() => run(`s-${i.id}`, () => ep.preferImage(i.id)).then(after)} />
                <Button size="sm" variant="ghost" icon={Trash2} aria-label="Apagar imagem" busy={busy === `r-${i.id}`} onClick={() => run(`r-${i.id}`, () => ep.removeImage(i.id)).then(after)} />
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
    </Card>
  );
}

export default function Images() {
  const summary = useAsync(ep.affiliateSummary, []);
  const products = useAsync(ep.imageProducts, []);
  const [sel, setSel] = useState(null);
  const lista = products.data?.produtos || [];
  const cenarios = summary.data?.cenarios || [];
  const disponivel = !!products.data?.disponivel;
  const atual = lista.find((p) => p.produtoKey === sel) || null;

  return (
    <>
      <PageHeader
        title="Imagens"
        subtitle="Gere fotos do produto em cenários (cozinha, sofá, cama…). Opcional: sem imagem gerada, vai a foto original."
        actions={products.data && <Badge variant="info">{products.data.geradasHoje}/{products.data.limiteDiario} hoje</Badge>}
      />
      {products.data && !disponivel && (
        <Notice className="mb-4" msg={{ tone: 'warn', text: 'Gerador desligado neste servidor: defina GEMINI_API_KEY no .env do client-panel. Dá para ver as fotos, mas não gerar.' }} />
      )}
      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="p-0" aria-labelledby="prod-title">
          <h2 id="prod-title" className="border-b border-line p-4 text-[15px] font-semibold text-cream">Produtos</h2>
          {!products.loading && !lista.length && (
            <div className="p-4"><EmptyState>Nenhum produto com foto ainda. Produtos enviados pela API e ofertas do banco com foto aparecem aqui.</EmptyState></div>
          )}
          <ul className="max-h-[560px] divide-y divide-line overflow-auto">
            {lista.map((p) => (
              <li key={p.produtoKey}>
                <button
                  type="button" onClick={() => setSel(p.produtoKey)}
                  className={cx('flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-white/[0.03]', sel === p.produtoKey && 'bg-white/[0.05]')}
                >
                  <img src={p.imageUrl} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" loading="lazy" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-cream">{p.nome}</span>
                    <span className="text-[11px] text-subtle">{p.origem === 'banco' ? 'Banco de ofertas' : 'Enviado pela API'}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
        {atual ? (
          <Gallery key={atual.produtoKey} product={atual} cenarios={cenarios} disponivel={disponivel} onGenerated={() => products.reload({ silent: true })} />
        ) : (
          <Card><EmptyState>Escolha um produto à esquerda.</EmptyState></Card>
        )}
      </div>
    </>
  );
}
