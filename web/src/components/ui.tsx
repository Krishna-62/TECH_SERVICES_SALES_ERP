import { forwardRef, useId } from 'react';

function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-dark',
  secondary: 'bg-white text-ink border border-line hover:bg-canvas',
  danger: 'bg-white text-danger border border-danger/30 hover:bg-danger-soft',
  ghost: 'text-ink-muted hover:text-ink hover:bg-canvas',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: 'sm' | 'md' }) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        size === 'sm' ? 'h-8 px-3 text-xs' : 'h-11 sm:h-10 px-4 text-sm',
        BUTTON_VARIANTS[variant],
        className
      )}
    />
  );
}

const FIELD_CLASSES =
  'w-full h-11 sm:h-10 rounded-lg border border-line bg-white px-3 text-ink placeholder:text-ink-faint ' +
  'focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand disabled:bg-canvas';

function FieldShell({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-semibold text-ink-muted">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-ink-faint">{hint}</p>}
    </div>
  );
}

export const TextField = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }
>(function TextField({ label, hint, className, ...props }, ref) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint}>
      <input ref={ref} id={id} {...props} className={cx(FIELD_CLASSES, className)} />
    </FieldShell>
  );
});

export function TextAreaField({
  label,
  hint,
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string }) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint}>
      <textarea
        id={id}
        rows={3}
        {...props}
        className={cx(
          'w-full rounded-lg border border-line bg-white px-3 py-2 text-ink placeholder:text-ink-faint',
          'focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand',
          className
        )}
      />
    </FieldShell>
  );
}

export function SelectField({
  label,
  hint,
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: string }) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint}>
      <select id={id} {...props} className={cx(FIELD_CLASSES, 'cursor-pointer', className)}>
        {children}
      </select>
    </FieldShell>
  );
}

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <section className={cx('bg-white border border-line rounded-xl shadow-card', className)}>{children}</section>;
}

export function CardHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 sm:px-5 py-4 border-b border-line">
      <div className="min-w-0">
        <h2 className="text-base font-semibold">{title}</h2>
        {description && <p className="text-sm text-ink-muted mt-0.5">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'brand' | 'ok' | 'muted'; children: React.ReactNode }) {
  const tones = {
    neutral: 'bg-canvas text-ink-muted border-line',
    brand: 'bg-brand-soft text-brand border-brand/20',
    ok: 'bg-ok-soft text-ok border-ok/20',
    muted: 'bg-canvas text-ink-faint border-line',
  };
  return (
    <span className={cx('inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap', tones[tone])}>
      {children}
    </span>
  );
}

// Orange everywhere a deal is past its expected closing date.
export function OverdueBadge() {
  return <span className="inline-flex items-center rounded-full border border-accent/30 bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent-dark whitespace-nowrap">Overdue</span>;
}

// Amber: in the same stage too long. Different from overdue, which is about the closing date.
export function StuckBadge({ days }: { days?: number | null }) {
  return <span className="inline-flex items-center rounded-full border border-amber-400/60 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 whitespace-nowrap">Stuck{days ? ` ${days} days` : ''}</span>;
}

export function Notice({ tone, children, onDismiss }: { tone: 'error' | 'success'; children: React.ReactNode; onDismiss?: () => void }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cx(
        'flex items-start justify-between gap-3 rounded-lg border px-3.5 py-2.5 text-sm',
        tone === 'error' ? 'bg-danger-soft border-danger/20 text-danger' : 'bg-ok-soft border-ok/20 text-ok'
      )}
    >
      <span>{children}</span>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="text-xs font-semibold opacity-70 hover:opacity-100" aria-label="Dismiss">
          ✕
        </button>
      )}
    </div>
  );
}

export function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <header className="mb-5">
      <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{title}</h1>
      {description && <p className="text-sm text-ink-muted mt-1">{description}</p>}
    </header>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="px-5 py-10 text-center text-sm text-ink-faint">{children}</p>;
}
