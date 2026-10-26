import { useEffect, useState } from 'react';
import { Play, Save, Send } from 'lucide-react';
import { Card, CardHeader } from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';
import { Button, Field, Input, Notice, Select, Switch, Textarea } from '../components/ui/Form';
import { useAsync } from '../hooks/useAsync';
import { useAction } from '../hooks/useAction';
import Diagnostico from '../components/dashboard/Diagnostico';
import * as ep from '../services/endpoints';

const DIAS = [[0, 'Dom'], [1, 'Seg'], [2, 'Ter'], [3, 'Qua'], [4, 'Qui'], [5, 'Sex'], [6, 'Sáb']];
const FONTES = [
  ['api', 'API Shopee (busca pelo nicho do grupo)'],
  ['pool', 'Banco de ofertas (coladas ou capturadas)'],
  ['misto', 'Banco primeiro, API Shopee se faltar'],
];

const hora = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });

const INTERVALOS = [['5m', '5 minutos'], ['15m', '15 minutos'], ['30m', '30 minutos'], ['1h', '1 hora'], ['2h', '2 horas'], ['3h', '3 horas'], ['6h', '6 horas']];

export default function Automations({ onDataChanged }) {
  const { data: cfg, error, setData } = useAsync(ep.getConfig, []);
  const [ads, setAds] = useState(null);
  const [aff, setAff] = useState(null);
  const [vivo, setVivo] = useState(null); // contadores atualizados depois de "Executar agora" (nao mexe no formulario)
  const { busy, msg, setMsg, run } = useAction();

  useEffect(() => {
    if (!cfg) return;
    const a = cfg.ads || {};
    setAds({
      enabled: !!a.enabled, interval: a.interval || '2h', dailyLimit: a.dailyLimit || 5,
      intervalMode: a.intervalMode === 'aleatorio' ? 'aleatorio' : 'fixo',
      intervalMin: a.intervalMin || 30, intervalMax: a.intervalMax || 90,
      perRunMin: a.perRunMin || 1, perRunMax: a.perRunMax || 1,
      window: { from: a.window?.from || '09:00', to: a.window?.to || '22:00' },
      days: Array.isArray(a.days) && a.days.length ? a.days : [0, 1, 2, 3, 4, 5, 6],
      source: a.source || 'api',
      quality: { minDiscount: a.quality?.minDiscount || 0, minRating: a.quality?.minRating || 0, minSales: a.quality?.minSales || 0 },
      useGeneratedImages: !!a.useGeneratedImages,
      poolTtlHours: a.poolTtlHours || 48,
    });
    setAff({ link: cfg.affiliate?.link || '', template: cfg.affiliate?.template || 'Meu link: {link}' });
  }, [cfg]);

  if (error) return <Notice msg={{ tone: 'error', text: error.message }} />;
  if (!ads) return <PageHeader title="Automações" subtitle="Carregando…" />;

  const save = () => run('save', async () => {
    const c = await ep.saveConfig({ ads, affiliate: aff });
    setData(c);
    onDataChanged?.();
  }, 'Automações salvas.');

  const groupsCount = (cfg.groups || []).length;
  const adsVivo = vivo || cfg.ads || {};
  const proximo = adsVivo.nextTryAt && new Date(adsVivo.nextTryAt).getTime() > Date.now() ? hora.format(new Date(adsVivo.nextTryAt)) : '';
  const executarAgora = async () => {
    if (!window.confirm(`Executar agora? Vou enviar até ${ads.perRunMax} produto(s) para ${groupsCount} grupo(s) de destino, ignorando o intervalo e o horário. Vale o que está SALVO (salve antes se mudou algo).`)) return;
    const o = await run('now', ep.runNow);
    if (!o) return;
    setMsg({ tone: o.ok ? 'ok' : 'warn', text: o.message });
    ep.getConfig().then((c) => setVivo(c.ads || {})).catch(() => {});
    onDataChanged?.();
  };
  const toggleDay = (d) => {
    const days = ads.days.includes(d) ? ads.days.filter((x) => x !== d) : [...ads.days, d].sort();
    setAds({ ...ads, days });
  };
  const setQ = (k, v) => setAds({ ...ads, quality: { ...ads.quality, [k]: v } });

  return (
    <>
      <PageHeader
        title="Automações"
        subtitle="Anúncios automáticos nos grupos escolhidos, respeitando nicho, dias e horário."
        actions={<Button icon={Save} busy={busy === 'save'} onClick={save}>Salvar</Button>}
      />
      <Notice className="mb-4" msg={msg} />
      <Diagnostico />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card aria-labelledby="ads-title">
          <CardHeader
            id="ads-title"
            title="Anúncios automáticos"
            subtitle={`${groupsCount} grupo(s) na divulgação · ${adsVivo.sentToday || 0} enviados hoje`}
            action={<Switch on={ads.enabled} onChange={(v) => setAds({ ...ads, enabled: v })} label="Ligar anúncios automáticos" />}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Modo do intervalo" htmlFor="ads-mode">
              <Select id="ads-mode" value={ads.intervalMode} onChange={(e) => setAds({ ...ads, intervalMode: e.target.value })}>
                <option value="fixo">Fixo</option>
                <option value="aleatorio">Aleatório (mín–máx)</option>
              </Select>
            </Field>
            {ads.intervalMode === 'aleatorio' ? (
              <Field label="Intervalo aleatório (minutos)" htmlFor="ads-imin" hint="O próximo disparo é sorteado entre o mínimo e o máximo (1 a 720).">
                <div className="flex items-center gap-2">
                  <Input id="ads-imin" type="number" min={1} max={720} aria-label="Mínimo em minutos" value={ads.intervalMin} onChange={(e) => setAds({ ...ads, intervalMin: e.target.value })} />
                  <span className="text-xs text-subtle">a</span>
                  <Input type="number" min={1} max={720} aria-label="Máximo em minutos" value={ads.intervalMax} onChange={(e) => setAds({ ...ads, intervalMax: e.target.value })} />
                </div>
              </Field>
            ) : (
              <Field label="Intervalo" htmlFor="ads-int">
                <Select id="ads-int" value={ads.interval} onChange={(e) => setAds({ ...ads, interval: e.target.value })}>
                  {INTERVALOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </Select>
              </Field>
            )}
            <Field label="Produtos por execução" htmlFor="ads-pmin" hint="Sorteia entre o mínimo e o máximo (1 a 10); pausa de 20 a 40 s entre eles.">
              <div className="flex items-center gap-2">
                <Input id="ads-pmin" type="number" min={1} max={10} aria-label="Mínimo de produtos" value={ads.perRunMin} onChange={(e) => setAds({ ...ads, perRunMin: e.target.value })} />
                <span className="text-xs text-subtle">a</span>
                <Input type="number" min={1} max={10} aria-label="Máximo de produtos" value={ads.perRunMax} onChange={(e) => setAds({ ...ads, perRunMax: e.target.value })} />
              </div>
            </Field>
            <Field label="Limite por dia" htmlFor="ads-lim" hint="Conta produtos enviados. 1 a 200">
              <Input id="ads-lim" type="number" min={1} max={200} value={ads.dailyLimit} onChange={(e) => setAds({ ...ads, dailyLimit: e.target.value })} />
            </Field>
            <Field label="Publicar a partir de" htmlFor="ads-from">
              <Input id="ads-from" type="time" value={ads.window.from} onChange={(e) => setAds({ ...ads, window: { ...ads.window, from: e.target.value } })} />
            </Field>
            <Field label="Até" htmlFor="ads-to" hint="Horário de Brasília">
              <Input id="ads-to" type="time" value={ads.window.to} onChange={(e) => setAds({ ...ads, window: { ...ads.window, to: e.target.value } })} />
            </Field>
          </div>
          {Number(ads.perRunMax) > 3 && (
            <Notice className="mt-4" msg={{ tone: 'warn', text: 'Muitos envios seguidos aumentam o risco de bloqueio do WhatsApp. Recomendo no máximo 3 produtos por execução.' }} />
          )}
          {proximo && <p className="mt-3 text-xs text-muted">Próximo disparo a partir de <b className="text-cream">{proximo}</b> (Brasília).</p>}
          <fieldset className="mt-4">
            <legend className="mb-1.5 text-xs font-medium text-muted">Dias de funcionamento</legend>
            <div className="flex flex-wrap gap-1.5">
              {DIAS.map(([d, l]) => (
                <button
                  key={d} type="button" aria-pressed={ads.days.includes(d)} onClick={() => toggleDay(d)}
                  className={`h-8 rounded-lg px-3 text-xs font-medium transition ${ads.days.includes(d) ? 'bg-brand-500 text-white' : 'border border-line bg-ink-850 text-muted hover:text-cream'}`}
                >
                  {l}
                </button>
              ))}
            </div>
          </fieldset>
          {!groupsCount && (
            <Notice className="mt-4" msg={{ tone: 'warn', text: 'Nenhum grupo escolhido ainda. Vá em Grupos e marque onde publicar.' }} />
          )}
          <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
            <Button variant="secondary" size="sm" icon={Send} busy={busy === 'test'} onClick={() => run('test', ep.adTestAll, (o) => o.message || 'Teste enviado.')}>
              Enviar teste agora
            </Button>
            <Button variant="secondary" size="sm" icon={Play} busy={busy === 'now'} onClick={executarAgora}>
              Executar agora
            </Button>
            <a href="#grupos" className="link-subtle self-center">Escolher grupos →</a>
          </div>
        </Card>

        <Card aria-labelledby="src-title">
          <CardHeader id="src-title" title="Origem e qualidade das ofertas" subtitle="Cada grupo só recebe oferta do seu nicho. Sem oferta boa, não dispara." />
          <div className="space-y-4">
            <Field label="De onde vêm as ofertas" htmlFor="ads-src" hint="Banco de ofertas: aba Ofertas. Links são trocados pelos seus links de afiliado.">
              <Select id="ads-src" value={ads.source} onChange={(e) => setAds({ ...ads, source: e.target.value })}>
                {FONTES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Desconto mínimo (%)" htmlFor="q-disc" hint="0 = sem filtro">
                <Input id="q-disc" type="number" min={0} max={90} value={ads.quality.minDiscount} onChange={(e) => setQ('minDiscount', e.target.value)} />
              </Field>
              <Field label="Nota mínima" htmlFor="q-rate" hint="0 a 5 (API Shopee)">
                <Input id="q-rate" type="number" min={0} max={5} step={0.1} value={ads.quality.minRating} onChange={(e) => setQ('minRating', e.target.value)} />
              </Field>
              <Field label="Vendas mínimas" htmlFor="q-sales" hint="API Shopee">
                <Input id="q-sales" type="number" min={0} value={ads.quality.minSales} onChange={(e) => setQ('minSales', e.target.value)} />
              </Field>
            </div>
            <Field label="Validade das ofertas do banco (horas)" htmlFor="pool-ttl" hint="Depois disso a oferta sai do rodízio (1 a 168).">
              <Input id="pool-ttl" type="number" min={1} max={168} value={ads.poolTtlHours} onChange={(e) => setAds({ ...ads, poolTtlHours: e.target.value })} />
            </Field>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-line p-3">
              <div>
                <p className="text-sm text-cream">Usar imagem gerada quando houver</p>
                <p className="text-xs text-subtle">Imagem marcada como preferida na aba Imagens. Sem ela, vai a foto original.</p>
              </div>
              <Switch on={ads.useGeneratedImages} onChange={(v) => setAds({ ...ads, useGeneratedImages: v })} label="Usar imagem gerada" />
            </div>
          </div>
        </Card>

        <Card aria-labelledby="aff-title">
          <CardHeader id="aff-title" title="Link de afiliado" subtitle="Usado no comando !link e nas mensagens." />
          <div className="space-y-4">
            <Field label="Seu link" htmlFor="aff-link">
              <Input id="aff-link" type="url" placeholder="https://s.shopee.com.br/…" value={aff.link} onChange={(e) => setAff({ ...aff, link: e.target.value })} />
            </Field>
            <Field label="Modelo da mensagem" htmlFor="aff-tpl" hint="{link} é trocado pelo seu link.">
              <Textarea id="aff-tpl" value={aff.template} onChange={(e) => setAff({ ...aff, template: e.target.value })} />
            </Field>
          </div>
        </Card>
      </div>
    </>
  );
}
