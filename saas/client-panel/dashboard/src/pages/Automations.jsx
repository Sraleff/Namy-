import { useEffect, useState } from 'react';
import { Save, Send } from 'lucide-react';
import { Card, CardHeader } from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';
import { Button, Field, Input, Notice, Select, Switch, Textarea } from '../components/ui/Form';
import { useAsync } from '../hooks/useAsync';
import { useAction } from '../hooks/useAction';
import * as ep from '../services/endpoints';

const INTERVALOS = [['5m', '5 minutos'], ['15m', '15 minutos'], ['30m', '30 minutos'], ['1h', '1 hora'], ['2h', '2 horas'], ['3h', '3 horas'], ['6h', '6 horas']];

export default function Automations({ onDataChanged }) {
  const { data: cfg, error, setData } = useAsync(ep.getConfig, []);
  const [ads, setAds] = useState(null);
  const [aff, setAff] = useState(null);
  const { busy, msg, run } = useAction();

  useEffect(() => {
    if (!cfg) return;
    setAds({ enabled: !!cfg.ads?.enabled, interval: cfg.ads?.interval || '2h', dailyLimit: cfg.ads?.dailyLimit || 5, window: { from: cfg.ads?.window?.from || '09:00', to: cfg.ads?.window?.to || '22:00' } });
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

  return (
    <>
      <PageHeader
        title="Automações"
        subtitle="Anúncios automáticos da Shopee nos grupos escolhidos."
        actions={<Button icon={Save} busy={busy === 'save'} onClick={save}>Salvar</Button>}
      />
      <Notice className="mb-4" msg={msg} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card aria-labelledby="ads-title">
          <CardHeader
            id="ads-title"
            title="Anúncios automáticos"
            subtitle={`${groupsCount} grupo(s) na divulgação · ${cfg.ads?.sentToday || 0} enviados hoje`}
            action={<Switch on={ads.enabled} onChange={(v) => setAds({ ...ads, enabled: v })} label="Ligar anúncios automáticos" />}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Intervalo" htmlFor="ads-int">
              <Select id="ads-int" value={ads.interval} onChange={(e) => setAds({ ...ads, interval: e.target.value })}>
                {INTERVALOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </Field>
            <Field label="Limite por dia" htmlFor="ads-lim" hint="1 a 200">
              <Input id="ads-lim" type="number" min={1} max={200} value={ads.dailyLimit} onChange={(e) => setAds({ ...ads, dailyLimit: e.target.value })} />
            </Field>
            <Field label="Publicar a partir de" htmlFor="ads-from">
              <Input id="ads-from" type="time" value={ads.window.from} onChange={(e) => setAds({ ...ads, window: { ...ads.window, from: e.target.value } })} />
            </Field>
            <Field label="Até" htmlFor="ads-to" hint="Horário de Brasília">
              <Input id="ads-to" type="time" value={ads.window.to} onChange={(e) => setAds({ ...ads, window: { ...ads.window, to: e.target.value } })} />
            </Field>
          </div>
          {!groupsCount && (
            <Notice className="mt-4" msg={{ tone: 'warn', text: 'Nenhum grupo escolhido ainda. Vá em Grupos e marque onde publicar.' }} />
          )}
          <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
            <Button variant="secondary" size="sm" icon={Send} busy={busy === 'test'} onClick={() => run('test', ep.adTestAll, (o) => o.message || 'Teste enviado.')}>
              Enviar teste agora
            </Button>
            <a href="#grupos" className="link-subtle self-center">Escolher grupos →</a>
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
