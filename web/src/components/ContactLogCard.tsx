import { ContactLogEntry } from '../lib/api';
import { formatDateTime } from '../lib/labels';
import { Badge, Card, CardHeader } from './ui';

// Calls and messages logged from follow-ups. Hidden until there is one.
export default function ContactLogCard({ entries }: { entries: ContactLogEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <Card>
      <CardHeader title="Calls and messages" />
      <ul className="divide-y divide-line">
        {entries.map((e) => (
          <li key={e.id} className="px-4 sm:px-5 py-3 flex items-start justify-between gap-3">
            <span className="min-w-0">
              <span className="block text-sm font-semibold">
                {e.channel === 'call' ? 'Call' : 'WhatsApp'}
                {e.contact_name && ` with ${e.contact_name}`}
              </span>
              {e.notes && <span className="block text-sm break-words">{e.notes}</span>}
              <span className="block text-xs text-ink-muted">
                {formatDateTime(e.created_at)} · {e.salesperson_name}
              </span>
            </span>
            <Badge tone={e.result === 'reached' ? 'ok' : 'muted'}>{e.result === 'reached' ? (e.channel === 'call' ? 'Reached' : 'Sent') : e.channel === 'call' ? 'No answer' : 'Not sent'}</Badge>
          </li>
        ))}
      </ul>
    </Card>
  );
}
