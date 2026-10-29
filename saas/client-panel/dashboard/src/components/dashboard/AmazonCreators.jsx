import { useState } from 'react';
import { FlaskConical, KeyRound, Trash2 } from 'lucide-react';
import { Card, CardHeader } from '../ui/Card';
import Badge from '../ui/Badge';
import { Button, Field, Input, Notice } from '../ui/Form';
import { useAsync } from '../../hooks/useAsync';
import { useAction } from '../../hooks/useAction';
import * as ep from '../../services/endpoints';

const ESTOQUE = { IN_STOCK: 'Em estoque', IN_STOCK_SCARCE: 'Poucas unidades', OUT_OF_STOCK: 'Sem estoque', UNAVAILABLE: 'Indisponível', PREORDER: 'Pré-venda', LEADTIME: 'Envio demorado', AVAILABLE_DATE: 'Disponível em breve', UNKNOWN: 'Desconhecido' };

// Creators API da Amazon (opcional): com ela, o envio confere estoque e preço antes de mandar
export default function AmazonCreators() {
  const { data, setData } = useAsync(ep.amazonCreatorsStatus, []);
  const [f, setF] = useState({ clientId: '', clientSecret: '' });
  const [url, setUrl] = useState('');
  const [item, setItem] = useState(null);
  const { busy, msg, setMsg, run } = useAction();

  const salvar = () => run('save', () => ep.amazonCreatorsSave(f), 'Credenciais conferidas e salvas.').then((o) => { if (o) { setData(o); setF({ clientId: '', clientSecret: '' }); } });
  const remover = () => run('rm', () => ep.amazonCreatorsRemove(), 'Credenciais removidas.').then((o) => o && setData(o));
  const testar = () => { setItem(null); return run('teste', () => ep.amazonCreatorsTest(url.trim())).then((o) => { if (!o) return; if (o.ok) setItem(o.item); else setMsg({ tone: 'warn', text: o.mensagem }); }); };

  return (
    <Card>
      <CardHeader
        title="Amazon Creators API (opcional)"
        subtitle="Com ela, cada oferta da Amazon tem o estoque e o preço conferidos antes do envio. A Amazon só libera o acesso a quem fez 10 vendas qualificadas nos últimos 30 dias. Sem ela, o link continua saindo com a sua tag."
        action={data && <Badge variant={data.configurada ? 'success' : 'neutral'}>{data.configurada ? `Conectada ${data.clientId}` : 'Não conectada'}</Badge>}
      />
      {data && !data.cofre && <Notice className="mb-3" msg={{ tone: 'warn', text: 'O servidor ainda não tem a chave mestra (SAAS_MASTER_KEY): não dá para guardar as credenciais.' }} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Client ID" htmlFor="amz-cid" hint="Central de Associados > Ferramentas > Creators API.">
          <Input id="amz-cid" autoComplete="off" value={f.clientId} onChange={(e) => setF({ ...f, clientId: e.target.value })} placeholder="amzn1.application-oa2-client..." />
        </Field>
        <Field label="Client Secret" htmlFor="amz-cs">
          <Input id="amz-cs" type="password" autoComplete="off" value={f.clientSecret} onChange={(e) => setF({ ...f, clientSecret: e.target.value })} />
        </Field>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button icon={KeyRound} busy={busy === 'save'} disabled={!f.clientId.trim() || !f.clientSecret.trim() || (data && !data.cofre)} onClick={salvar}>{data?.configurada ? 'Trocar credenciais' : 'Conectar'}</Button>
        {data?.configurada && <Button variant="secondary" icon={Trash2} busy={busy === 'rm'} onClick={remover}>Remover</Button>}
      </div>
      {data?.configurada && (
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <Field label="Testar com um produto" htmlFor="amz-teste" className="min-w-[14rem] flex-1">
            <Input id="amz-teste" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.amazon.com.br/dp/..." />
          </Field>
          <Button variant="secondary" icon={FlaskConical} busy={busy === 'teste'} disabled={!url.trim()} onClick={testar}>Consultar</Button>
        </div>
      )}
      {item && (
        <div className="mt-3 flex items-center gap-3 rounded-xl border border-line p-3">
          {item.imagem && <img src={item.imagem} alt="" className="h-12 w-12 rounded-lg object-cover" referrerPolicy="no-referrer" />}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-cream" title={item.titulo}>{item.titulo || item.asin}</span>
            <span className="block text-[11px] text-muted">{[item.precoTexto, item.desconto ? `${item.desconto}% off` : '', ESTOQUE[item.disponibilidade] || item.disponibilidade].filter(Boolean).join(' · ')}</span>
          </span>
        </div>
      )}
      <Notice className="mt-3" msg={msg} />
    </Card>
  );
}
