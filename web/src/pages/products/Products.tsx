import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, NamedOption, Product } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { canManageProducts } from '../../lib/roles';
import { Badge, Button, Card, CardHeader, EmptyState, Notice, PageHeader, SelectField, TextAreaField, TextField } from '../../components/ui';

// The catalogue: everyone can look things up; Admin, MD and office staff keep it current.
export default function Products() {
  const { user } = useAuth();
  const canManage = canManageProducts(user?.role);
  const [q, setQ] = useState('');
  const [oemId, setOemId] = useState<number | ''>('');
  const [oems, setOems] = useState<NamedOption[]>([]);
  const [rows, setRows] = useState<Product[] | null>(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    api.catalogue.oems().then(setOems).catch(() => undefined);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      api.products
        .list({ q: q.trim(), oem_id: oemId, include_inactive: canManage ? 1 : undefined, limit: 500 })
        .then(setRows)
        .catch((err) => setError(err.message));
    }, 250);
    return () => clearTimeout(t);
  }, [q, oemId, canManage]);

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <PageHeader title="Products" description="What we sell, by make." />
        {canManage && !adding && (
          <Button className="shrink-0" onClick={() => setAdding(true)}>
            + Add
          </Button>
        )}
      </div>
      {error && <Notice tone="error" onDismiss={() => setError('')}>{error}</Notice>}
      {adding && (
        <Card className="p-4 sm:p-5 mb-4">
          <ProductForm oems={oems} onCancel={() => setAdding(false)} />
        </Card>
      )}
      <div className="grid gap-3 sm:grid-cols-2 mb-4 max-w-2xl">
        <TextField label="Search" type="search" placeholder="Part number or name" value={q} onChange={(e) => setQ(e.target.value)} />
        <SelectField label="Make" value={oemId} onChange={(e) => setOemId(e.target.value ? Number(e.target.value) : '')}>
          <option value="">All makes</option>
          {oems.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </SelectField>
      </div>
      <Card>
        {rows?.length === 0 && <EmptyState>{q || oemId ? 'No matching products.' : 'No products yet.'}</EmptyState>}
        <ul className="divide-y divide-line">
          {rows?.map((p) => (
            <li key={p.id}>
              <Link to={`/products/${p.id}`} className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 hover:bg-canvas">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{p.name}</span>
                  <span className="block text-xs text-ink-muted">{[p.part_number, p.oem_name, p.category].filter(Boolean).join(' · ')}</span>
                </span>
                {!p.is_active && <Badge tone="muted">Inactive</Badge>}
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function ProductForm({ oems, product, onCancel, onSaved }: { oems: NamedOption[]; product?: Product; onCancel: () => void; onSaved?: (p: Product) => void }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    part_number: product?.part_number ?? '',
    name: product?.name ?? '',
    oem_id: product?.oem_id ?? ('' as number | ''),
    category: product?.category ?? '',
    features: product?.key_features.join('\n') ?? '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const data = {
      part_number: form.part_number,
      name: form.name,
      oem_id: Number(form.oem_id),
      category: form.category || null,
      key_features: form.features.split('\n').map((f) => f.trim()).filter(Boolean),
    };
    try {
      if (product) onSaved?.(await api.products.update(product.id, data));
      else navigate(`/products/${(await api.products.create(data)).id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the product.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      {error && (
        <div className="sm:col-span-2">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
      <TextField label="Part number" value={form.part_number} onChange={(e) => setForm({ ...form, part_number: e.target.value })} required />
      <TextField label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
      <SelectField label="Make (OEM)" value={form.oem_id} onChange={(e) => setForm({ ...form, oem_id: e.target.value ? Number(e.target.value) : '' })} required>
        <option value="">Select…</option>
        {oems.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </SelectField>
      <TextField label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
      <div className="sm:col-span-2">
        <TextAreaField label="Key features" hint="One per line" rows={4} value={form.features} onChange={(e) => setForm({ ...form, features: e.target.value })} />
      </div>
      <div className="sm:col-span-2 flex gap-2">
        <Button type="submit" size="sm" disabled={busy || !form.part_number.trim() || !form.name.trim() || !form.oem_id}>
          Save product
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function ProductDetail() {
  const id = Number(useParams().id);
  const { user } = useAuth();
  const [product, setProduct] = useState<Product | null>(null);
  const [oems, setOems] = useState<NamedOption[]>([]);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const canManage = canManageProducts(user?.role);

  useEffect(() => {
    api.products.get(id).then(setProduct).catch((err) => setError(err.message));
    api.catalogue.oems().then(setOems).catch(() => undefined);
  }, [id]);

  async function setActive(active: boolean) {
    if (!product) return;
    setError('');
    try {
      setProduct(await api.products.update(product.id, { is_active: active }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change the product.');
    }
  }

  if (error && !product) return <Notice tone="error">{error}</Notice>;
  if (!product) return <p className="text-sm text-ink-faint">Loading…</p>;

  return (
    <div className="max-w-2xl flex flex-col gap-5">
      <header>
        <Link to="/products" className="text-sm font-semibold text-brand">
          Products
        </Link>
        <h1 className="text-2xl font-bold tracking-tight mt-0.5">{product.name}</h1>
        <p className="text-sm text-ink-muted mt-1">{[product.part_number, product.oem_name, product.category].filter(Boolean).join(' · ')}</p>
        {!product.is_active && (
          <div className="mt-2">
            <Badge tone="muted">Inactive</Badge>
          </div>
        )}
      </header>
      {error && <Notice tone="error" onDismiss={() => setError('')}>{error}</Notice>}
      {canManage && !editing && (
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setActive(!product.is_active)}>
            {product.is_active ? 'Deactivate' : 'Reactivate'}
          </Button>
        </div>
      )}
      {editing && (
        <Card className="p-4 sm:p-5">
          <ProductForm
            oems={oems}
            product={product}
            onCancel={() => setEditing(false)}
            onSaved={(p) => {
              setProduct(p);
              setEditing(false);
            }}
          />
        </Card>
      )}
      <Card>
        <CardHeader title="Key features" />
        {product.key_features.length === 0 && <EmptyState>None recorded yet.</EmptyState>}
        <ul className="divide-y divide-line">
          {product.key_features.map((f) => (
            <li key={f} className="px-4 sm:px-5 py-2.5 text-sm">
              {f}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
