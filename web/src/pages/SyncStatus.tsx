import { useState } from 'react';
import { OutboxItem, discardItem, retryItem, syncOutbox, useOutbox } from '../lib/outbox';
import { formatDateTime } from '../lib/labels';
import { Badge, Button, Card, EmptyState, Notice, PageHeader } from '../components/ui';

// What this phone is still holding. A change the server refused stays until the person decides.
export default function SyncStatus() {
  const { online, items, waiting, conflicts } = useOutbox();
  const [confirming, setConfirming] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  async function act(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  }

  return (
    <div className="max-w-3xl flex flex-col gap-4">
      <PageHeader title="Changes on this phone" description="Saved here until they reach the server." />
      {!online && <Notice tone="error">You’re offline. These will be sent when the connection returns.</Notice>}
      {conflicts > 0 && (
        <p className="text-sm text-ink-muted">
          {conflicts === 1 ? 'One change was' : `${conflicts} changes were`} refused, usually because something changed while you were offline. Read why, then try again or discard.
        </p>
      )}
      {waiting > 0 && online && (
        <div>
          <Button variant="secondary" disabled={busy} onClick={() => act(syncOutbox)}>
            Send now
          </Button>
        </div>
      )}
      <Card>
        {items.length === 0 && <EmptyState>Everything has been sent.</EmptyState>}
        <ul className="divide-y divide-dashed divide-line overflow-hidden rounded-b-card">
          {items.map((item: OutboxItem) => (
            <li key={item.id} className="px-4 sm:px-5 py-3 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{item.label}</span>
                  <span className="block text-xs text-subtle">Saved {formatDateTime(item.createdAt)}</span>
                </span>
                <Badge tone={item.status === 'conflict' ? 'neutral' : 'brand'}>{item.status === 'conflict' ? 'Needs a decision' : 'Waiting'}</Badge>
              </div>
              {item.error && <p className="text-sm text-danger break-words">{item.error}</p>}
              {item.status === 'conflict' &&
                (confirming === item.id ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm">This can’t be undone.</span>
                    <Button size="sm" variant="danger" disabled={busy} onClick={() => act(() => discardItem(item))}>
                      Discard
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                      Keep it
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" disabled={busy || !online} onClick={() => act(() => retryItem(item))}>
                      Try again
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirming(item.id!)}>
                      Discard
                    </Button>
                  </div>
                ))}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
