import { useEffect, useState } from 'react';
import { Bot, FlaskConical, KeyRound, Save } from 'lucide-react';
import { Card, CardHeader } from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';
import Badge from '../components/ui/Badge';
import { Button, Field, Input, Notice } from '../components/ui/Form';
import { useAsync } from '../hooks/useAsync';
import { useAction } from '../hooks/useAction';
import * as ep from '../services/endpoints';

export default function AI({ onDataChanged }) {
  const { data: cfg, error, setData } = useAsync(ep.getConfig, []);
  const [shopee, setShopee] = useState(null);
  const { busy, msg, run } = useAction();

  useEffect(() => {
    if (cfg) setShopee({ appId: cfg.shopee?.appId || '', secret: '', keyword: cfg.shopee?.keyword || '' });
  }, [cfg]);

  if (error) return <Notice msg={{ tone: 'error', text: error.message }} />;
  if (!shopee) return <PageHeader title="Inteligência Artificial" subtitle="Carregando…" />;

  const hasSecret = cfg.shopee?.secret === '********';
  const save = () => run('save', async () => {
    const body = { appId: shopee.appId, keyword: shopee.keyword };
    if (shopee.secret) body.secret = shopee.secret;
    const c = await ep.saveConfig({ shopee: body });
    setData(c);
    onDataChanged?.();
  }, 'API Shopee salva.');

  return (
    <>
      <PageHeader title="Inteligência Artificial" subtitle="Respostas do bot e ofertas geradas pela API da Shopee." />
      <Notice className="mb-4" msg={msg} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card aria-labelledby="shopee-title">
          <CardHeader
            id="shopee-title"
            title="API de afiliados Shopee"
            subtitle="As ofertas saem da SUA conta. Sem chave, os anúncios ficam pausados."
            action={<Badge variant={cfg.shopee?.appId && hasSecret ? 'success' : 'neutral'}>{cfg.shopee?.appId && hasSecret ? 'Conectada' : 'Desligada'}</Badge>}
          />
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save(); }}>
            <Field label="App ID" htmlFor="sp-app">
              <Input id="sp-app" autoComplete="off" value={shopee.appId} onChange={(e) => setShopee({ ...shopee, appId: e.target.value })} />
            </Field>
            <Field label="Secret" htmlFor="sp-secret" hint={hasSecret ? 'Já salvo. Preencha só se for trocar.' : ''}>
              <Input id="sp-secret" type="password" autoComplete="new-password" placeholder={hasSecret ? '••••••••' : ''} value={shopee.secret} onChange={(e) => setShopee({ ...shopee, secret: e.target.value })} />
            </Field>
            <Field label="Palavra-chave das ofertas" htmlFor="sp-kw" hint="Ex.: fone bluetooth. Vazio = ofertas variadas." className="sm:col-span-2">
              <Input id="sp-kw" value={shopee.keyword} onChange={(e) => setShopee({ ...shopee, keyword: e.target.value })} />
            </Field>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <Button type="submit" icon={Save} busy={busy === 'save'}>Salvar</Button>
              <Button variant="secondary" icon={FlaskConical} busy={busy === 'test'} onClick={() => run('test', ep.shopeeTest, (o) => o.message || 'Oferta encontrada.')}>
                Testar API
              </Button>
            </div>
          </form>
        </Card>

        <Card aria-labelledby="ia-title">
          <CardHeader id="ia-title" title="Respostas inteligentes" action={<Badge variant={cfg.ai?.mode !== 'off' ? 'success' : 'neutral'}>{cfg.ai?.mode !== 'off' ? 'Ativo' : 'Inativo'}</Badge>} />
          <ul className="space-y-3 text-sm">
            <li className="flex gap-3">
              <Bot className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" aria-hidden="true" />
              <span className="text-muted">Modo <b className="text-cream">{cfg.ai?.mode || 'auto'}</b>: o bot responde nos grupos com fallback Groq / xAI / Gemini.</span>
            </li>
            <li className="flex gap-3">
              <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" aria-hidden="true" />
              <span className="text-muted">
                {cfg.ai?.usePlatformKeys ? 'Usando as chaves da plataforma.' : 'Usando as suas chaves.'} Para usar a sua, mande no privado do bot:{' '}
                <code className="rounded bg-ink-850 px-1.5 py-0.5 text-xs text-cream">!minhaconta ia groq SUA_CHAVE</code>
              </span>
            </li>
          </ul>
        </Card>
      </div>
    </>
  );
}
