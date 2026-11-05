import { avatarUrl } from '@/lib/avatar/avatarUrl';

/**
 * A writer's photo as a circle.
 *
 * The stored image is square; the circle is this `rounded-full`. Rendered through
 * avatarUrl, whose sizes are an allowlist, so `px` is what the box measures and
 * `source` is the allowlisted file behind it, roughly twice that for sharp edges.
 */
export function WriterAvatar({ publicId, px, source }) {
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={avatarUrl(publicId || null, source)}
      alt=""
      width={px}
      height={px}
      aria-hidden="true"
      className="shrink-0 rounded-full border border-[var(--surface-border)] object-cover"
      style={{ width: px, height: px }}
    />
  );
}
