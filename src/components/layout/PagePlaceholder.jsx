import Link from 'next/link';
import { Construction } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Generic placeholder for routes scaffolded in Phase 1 but not yet built.
 * Pass a `phase` label to signal when the page is scheduled.
 */
export function PagePlaceholder({
  title,
  description,
  phase = 'Phase 2',
  backHref = '/',
  backLabel = 'กลับหน้าแรก',
}) {
  return (
    <div className="mx-auto max-w-[680px] px-4 py-20 text-center lg:py-32">
      <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-9e-brand/10">
        <Construction className="h-6 w-6 text-9e-brand" strokeWidth={1.75} />
      </div>

      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-9e-lime">
        Coming in {phase}
      </p>
      <h1 className="text-3xl font-bold text-9e-ice md:text-4xl">{title}</h1>
      {description && (
        <p className="mx-auto mt-3 max-w-[520px] text-base text-9e-slate leading-relaxed">
          {description}
        </p>
      )}

      <div className="mt-8 flex justify-center">
        <Button asChild variant="outline">
          <Link href={backHref}>{backLabel}</Link>
        </Button>
      </div>
    </div>
  );
}
