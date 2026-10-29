import { useEffect, useState } from 'react';
import { KeyRound, RotateCcw, Save, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { Card, CardHeader } from '../ui/Card';
import Badge from '../ui/Badge';
import { Button, Field, Input, Notice, Select, Switch, Textarea } from '../ui/Form';
import { useAsync } from '../../hooks/useAsync';
import { useAction } from '../../hooks/useAction';
import * as ep from '../../services/endpoints';

function Previa({ previa, titulo }) {
  if (!previa) return <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-xs text-muted">A prévia aparece aqui.</p>;
  if (previa.erro) return <p role="alert" className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{previa.erro}</p>;
  const ia = previa.via?.startsWith('ia:');
  return (
    <div className="rounded-xl border border-line bg-ink-850 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium text-muted">{titulo}</span>
        <Badge variant={ia ? 'success' : 'neutral'}>{ia ? 'Escrita pela IA' : 'Modelo'}</Badge>
      </div>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-sans text-sm text-cream">{previa.texto}</pre>
      {previa.aviso && !ia && <p className="mt-2 text-[11px] text-amber-300">{previa.aviso.replace(/^copy: /, '')}</p>}
    </div>
  );
}

export default function MensagemOfertas() {
  const { data: d, error, setData, reload } = useAsync(ep.getCopy, []);
  const [pronto, setPronto] = useState(false);
  const [modelo, setModelo] = useState('');
  const [prov, setProv] = useState('groq');
  const [chave, setChave] = useState('');
  const [previa, setPrevia] = useState(null);
  const [previaIA, setPreviaIA] = useState(null);
  const { busy, msg, setMsg, run } = useAction();

  useEffect(() => {
    if (d && !pronto) {
      setModelo(d.modelo || d.modeloSugerido);
      setProv(d.ia.provedor);
      setPronto(true);
    }
  }, [d, pronto]);

  // Prévia do modelo enquanto digita (sem IA: não gasta nada)
  useEffect(() => {
    if (!pronto) return undefined;
    const t = setTimeout(() => {
      ep.previewCopy({ modelo }).then(setPrevia).catch((e) => setPrevia({ erro: e.message }));
    }, 500);
    return () => clearTimeout(t);
  }, [modelo, pronto]);

  if (error) return <Notice className="mt-4" msg={{ tone: 'error', text: `Mensagem das ofertas: ${error.message}` }} />;
  if (!d) return null;

  const info = d.provedores.find((p) => p.id === prov);
  const nuvem = info && !info.local;

  const inserir = (v) => {
    const el = document.getElementById('cp-modelo');
    const ini = el ? el.selectionStart : modelo.length;
    const fim = el ? el.selectionEnd : modelo.length;
    setModelo(modelo.slice(0, ini) + '{' + v + '}' + modelo.slice(fim));
    requestAnimationFrame(() => { if (el) { el.focus(); el.setSelectionRange(ini + v.length + 2, ini + v.length + 2); } });
  };

  const salvarModelo = () => run('modelo', () => ep.saveCopy({ modelo }), 'Modelo salvo. As próximas ofertas da API e da Vitrine usam ele.').then((o) => o && setData(o));
  const usarPadrao = () => run('padrao', () => ep.saveCopy({ modelo: '' }), 'Voltou ao texto padrão.').then((o) => { if (o) { setData(o); setModelo(o.modeloSugerido); } });
  const alternarIA = (ativo) => run('ia', () => ep.saveCopy({ ia: { ativo, provedor: prov } }), ativo ? 'IA ligada.' : 'IA desligada.').then((o) => o && setData(o));
  const trocarProvedor = (novo) => {
    setProv(novo);
    setPreviaIA(null);
    if (d.ia.ativo && novo !== d.ia.provedor) {
      run('ia', () => ep.saveCopy({ ia: { ativo: false, provedor: novo } }), 'Provedor trocado: a IA foi desligada. Ligue de novo quando quiser.').then((o) => o && setData(o));
    }
  };
  const salvarChave = () => run('chave', () => ep.saveCopyKey(prov, chave), 'Chave guardada (cifrada).').then((o) => { if (o) { setChave(''); reload({ silent: true }); } });
  const removerChave = () => {
    if (!window.confirm(`Remover a chave de ${info.rotulo}? A IA será desligada se estiver usando ela.`)) return;
    run('remover', () => ep.removeCopyKey(prov), 'Chave removida.').then((o) => o && setData(o));
  };
  const testarIA = () => run('teste', () => ep.previewCopy({ ia: true, provedor: prov })).then((o) => {
    if (!o) return;
    setPreviaIA(o);
    setMsg(o.via?.startsWith('ia:') ? { tone: 'ok', text: 'A IA respondeu e passou na trava.' } : { tone: 'warn', text: `A IA não foi usada: ${(o.aviso || '').replace(/^copy: modelo \(|\)$/g, '')}` });
  });

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <Card aria-labelledby="msg-title">
        <CardHeader
          id="msg-title"
          title="Mensagem das ofertas"
          subtitle="Vale para as ofertas que o sistema monta (busca da API e Vitrine). Texto colado ou capturado de grupo não é reescrito: só os links mudam."
        />
        <Field label="Modelo" htmlFor="cp-modelo" hint="Linha com variável vazia some sozinha (ex.: oferta sem desconto).">
          <Textarea id="cp-modelo" rows={9} value={modelo} maxLength={1000} onChange={(e) => setModelo(e.target.value)} className="font-mono text-xs" />
        </Field>
        <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Inserir variável">
          {d.variaveis.map((v) => (
            <button key={v} type="button" onClick={() => inserir(v)} className="rounded-md border border-line bg-ink-850 px-2 py-1 font-mono text-[11px] text-brand-300 transition-colors hover:bg-ink-750">{`{${v}}`}</button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" icon={Save} busy={busy === 'modelo'} onClick={salvarModelo}>Salvar modelo</Button>
          <Button size="sm" variant="secondary" icon={RotateCcw} busy={busy === 'padrao'} onClick={usarPadrao}>Usar o padrão</Button>
        </div>
        <div className="mt-4"><Previa previa={previa} titulo="Prévia com uma oferta de exemplo" /></div>
      </Card>

      <Card aria-labelledby="ia-copy-title">
        <CardHeader
          id="ia-copy-title"
          title="IA para escrever a mensagem"
          subtitle="Opcional. A IA nunca inventa: se trouxer preço, cupom, frete ou número que a oferta não tem, o sistema descarta e usa o modelo."
          action={<Switch on={d.ia.ativo} onChange={alternarIA} disabled={busy === 'ia' || (nuvem && !info.temChave)} label="Usar IA para escrever as mensagens" />}
        />
        {!d.cofreDisponivel && <Notice className="mb-3" msg={{ tone: 'warn', text: 'O servidor ainda não tem a chave mestra do cofre, então não dá para guardar a sua chave. Avise o administrador.' }} />}
        <Field label="Provedor" htmlFor="cp-prov">
          <Select id="cp-prov" value={prov} onChange={(e) => trocarProvedor(e.target.value)}>
            {d.provedores.map((p) => <option key={p.id} value={p.id}>{p.rotulo}{p.local ? '' : p.temChave ? ' ✓ chave salva' : ''}</option>)}
          </Select>
        </Field>

        {nuvem ? (
          <div className="mt-3 space-y-2">
            {info.temChave ? (
              <div className="flex items-center justify-between gap-2 rounded-xl bg-ink-850 px-3 py-2">
                <span className="flex items-center gap-2 text-sm text-cream"><KeyRound className="h-4 w-4 text-brand-400" aria-hidden="true" /> Chave salva: <span className="tabular text-muted">{info.mascara}</span></span>
                <Button size="sm" variant="danger" icon={Trash2} busy={busy === 'remover'} onClick={removerChave}>Remover</Button>
              </div>
            ) : (
              <form className="flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={(e) => { e.preventDefault(); salvarChave(); }}>
                <Field label={`Chave de ${info.rotulo}`} htmlFor="cp-chave" className="flex-1" hint="Fica cifrada no servidor e nunca volta inteira para a tela.">
                  <Input id="cp-chave" type="password" autoComplete="new-password" value={chave} onChange={(e) => setChave(e.target.value)} placeholder="Cole a chave inteira" />
                </Field>
                <Button type="submit" icon={KeyRound} busy={busy === 'chave'} disabled={!chave.trim() || !d.cofreDisponivel} className="sm:mb-[22px]">Salvar chave</Button>
              </form>
            )}
          </div>
        ) : (
          <p className="mt-3 rounded-lg bg-white/[0.03] p-3 text-xs text-muted">Modelo rodando no próprio servidor (liberado só para o administrador). Demora mais (cerca de 15 s por mensagem) e passa pela mesma trava.</p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" icon={Wand2} busy={busy === 'teste'} disabled={nuvem && !info.temChave} onClick={testarIA}>Testar com IA</Button>
          <span className="text-[11px] text-subtle">A IA recebe só nome, preço, desconto, nota, vendas e loja. O seu link nunca vai para ela.</span>
        </div>
        <Notice className="mt-3" msg={msg} />
        {previaIA && <div className="mt-3"><Previa previa={previaIA} titulo="Teste com IA (oferta de exemplo)" /></div>}
        <p className="mt-3 flex items-start gap-2 text-[11px] text-subtle"><Sparkles className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />O custo da IA é da sua conta no provedor. Cada mensagem enviada usa uma chamada.</p>
      </Card>
    </div>
  );
}
