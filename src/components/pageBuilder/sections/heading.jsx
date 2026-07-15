import { cn } from '@/lib/utils';

/**
 * heading — a standalone H1–H6. Server component. Inherits the page/section
 * text colour (accent is not applied to headings by default). Level and
 * alignment come from the tightened content schema.
 */
const LEVEL_CLASS = {
  h1: 'text-3xl font-bold md:text-4xl',
  h2: 'text-2xl font-bold md:text-3xl',
  h3: 'text-xl font-bold md:text-2xl',
  h4: 'text-lg font-bold md:text-xl',
  h5: 'text-base font-bold md:text-lg',
  h6: 'text-sm font-bold md:text-base',
};
const ALIGN_CLASS = { left: 'text-left', center: 'text-center', right: 'text-right' };

export function HeadingSection({ content }) {
  const text = typeof content?.text === 'string' ? content.text : '';
  if (!text.trim()) return null;
  const level = LEVEL_CLASS[content?.level] ? content.level : 'h2';
  const Tag = level;
  return (
    <Tag className={cn('font-heading', LEVEL_CLASS[level], ALIGN_CLASS[content?.align] ?? ALIGN_CLASS.left)}>
      {text}
    </Tag>
  );
}
