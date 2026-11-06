import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, NamedOption, Product } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { canManageProducts } from '../../lib/roles';
import { Badge, Button, Card, CardHeader, DESKTOP_ONLY, EmptyState, Notice, PHONE_ONLY, PageHeader, SearchBox, SelectField, SkeletonRows, TextAreaField, TextField, LoadingCard, rowStagger } from '../../components/ui';

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
      <PageHeader title="Products" description="What we sell, by make." actions={canManage && !adding && <Button onClick={() => setAdding(true)}>+ Add</Button>} />
      {error && <Notice tone="error" onDismiss={() => setError('')}>{error}</Notice>}
      {adding && (
        <Card className="p-4 sm:p-5 mb-4">
          <ProductForm oems={oems} onCancel={() => setAdding(false)} />
        </Card>
      )}
      <section className="ts-card ts-white ts-tcard ts-tbl !mt-0">
        <div className="ts-tbar">
          <SearchBox label="Search products" placeholder="Part number or name" value={q} onChange={(e) => setQ(e.target.value)} />
          <select aria-label="Make" className="ts-fi ts-sel max-[860px]:!h-11" value={oemId} onChange={(e) => setOemId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">All makes</option>
            {oems.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          {rows && <span className="ts-showing ts-muted">Showing {rows.length}</span>}
        </div>
        {rows === null && !error && <SkeletonRows />}
        {rows?.length === 0 && <EmptyState>{q || oemId ? 'No matching products.' : 'No products yet.'}</EmptyState>}
        {rows && rows.length > 0 && (
          <>
            <div className={`ts-tblwrap ${DESKTOP_ONLY}`}>
              <table>
                <thead>
                  <tr>
                    <th>Part number</th>
                    <th>Name</th>
                    <th>Make</th>
                    <th>Category</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p, i) => (
                    <tr key={p.id} style={rowStagger(i)}>
                      <td className="ts-muted">{p.part_number}</td>
                      <td className="ts-wrap">
                        <Link to={`/products/${p.id}`} className="ts-lnk font-medium">
                          {p.name}
                        </Link>
                      </td>
                      <td className="ts-muted">{p.oem_name}</td>
                      <td className="ts-muted">{p.category || '—'}</td>
                      <td>{!p.is_active && <Badge tone="muted">Inactive</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className={`ts-list ${PHONE_ONLY}`}>
              {rows.map((p) => (
                <Link key={p.id} to={`/products/${p.id}`} className="ts-li !grid-cols-[minmax(0,1fr)_auto]">
                  <div className="min-w-0">
                    <div className="ts-nm !whitespace-normal">{p.name}</div>
                    <div className="ts-sub">{[p.part_number, p.oem_name, p.category].filter(Boolean).join(' · ')}</div>
                  </div>
                  {!p.is_active && <Badge tone="muted">Inactive</Badge>}
                </Link>
              ))}
            </div>
          </>
        )}
      </section>
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
    <form onSubmit={submit} className="ts-fgrid ts-g2 !mt-0">
      {error && (
        <div className="ts-span2">
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
      <div className="ts-span2">
        <TextAreaField label="Key features" hint="One per line" rows={4} value={form.features} onChange={(e) => setForm({ ...form, features: e.target.value })} />
      </div>
      <div className="ts-span2 flex gap-2">
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
  if (!product) return <LoadingCard />;

  return (
    <div className="max-w-3xl flex flex-col gap-4">
      <header className="ts-phead !block !mb-1">
        <Link to="/products" className="ts-back">
          ← Products
        </Link>
        <h1 className="ts-title">{product.name}</h1>
        <p className="ts-muted mt-1.5">{[product.part_number, product.oem_name, product.category].filter(Boolean).join(' · ')}</p>
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
        <ul className="divide-y divide-dashed divide-line overflow-hidden rounded-b-card">
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
