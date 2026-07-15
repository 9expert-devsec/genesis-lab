import { Info, CheckCircle2, AlertTriangle, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * notice — a callout box (info/success/warning/error). Server component.
 * Left-border + tinted surface + semantic icon. There is no dedicated
 * callout in components/ui, so this establishes the pattern using CI tokens.
 *
 * NOTE: the CI palette has no red token by design; `error` is the one
 * documented semantic exception (Tailwind red), consistent with the admin
 * UI's destructive styling. Everything else resolves through 9e-* tokens.
 */
const VARIANTS = {
  info:    { box: 'bg-9e-signature-900 border-9e-action',   icon: 'text-9e-action',   Icon: Info },
  success: { box: 'bg-9e-green-900 border-9e-green-50',      icon: 'text-9e-green-50', Icon: CheckCircle2 },
  warning: { box: 'bg-9e-orange-900 border-9e-orange-50',    icon: 'text-9e-orange-50', Icon: AlertTriangle },
  error:   { box: 'bg-red-50 border-red-500',                icon: 'text-red-600',     Icon: AlertCircle },
};

export function NoticeSection({ content }) {
  const text = typeof content?.text === 'string' ? content.text : '';
  if (!text.trim()) return null;
  const v = VARIANTS[content?.variant] ?? VARIANTS.info;
  const { Icon } = v;
  return (
    <div className={cn('flex items-start gap-3 rounded-9e-md border-l-4 p-4', v.box)}>
      <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', v.icon)} strokeWidth={2} aria-hidden />
      <p className="whitespace-pre-line text-9e-navy">{text}</p>
    </div>
  );
}
