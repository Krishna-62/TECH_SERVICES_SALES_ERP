import { Button } from './ui';

// Stays in view while several rows are ticked. The actions are whatever the screen offers.
export default function BulkBar({ count, total, onSelectAll, onClear, children }: { count: number; total: number; onSelectAll: () => void; onClear: () => void; children: React.ReactNode }) {
  return (
    <div className="ts-card ts-white ts-selbar !sticky bottom-20 lg:bottom-4 z-10 !mt-0 !flex-col !items-stretch !gap-3 shadow-lift">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{count} selected</span>
        <span className="flex flex-wrap justify-end gap-1">
          {count < total && (
            <Button size="sm" variant="ghost" onClick={onSelectAll}>
              Select all {total}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onClear}>
            Done selecting
          </Button>
        </span>
      </div>
      {count > 0 && children}
    </div>
  );
}

// What came back from changing many at once, for the message on screen.
export function bulkMessage(result: { updated: number; skipped: { title: string; reason: string }[] }) {
  const parts = [`Changed ${result.updated}.`];
  if (result.skipped.length) parts.push(`Left ${result.skipped.length} as they were: ${result.skipped.slice(0, 4).map((s) => `${s.title} (${s.reason})`).join('; ')}${result.skipped.length > 4 ? '…' : ''}`);
  return parts.join(' ');
}
