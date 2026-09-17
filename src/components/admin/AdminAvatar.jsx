import { avatarUrl } from '@/lib/avatar/avatarUrl';

/**
 * An admin's profile picture, at one of avatarUrl's allow-listed sizes.
 *
 * ── ONE COMPONENT, TWO SURFACES ─────────────────────────────────────────────
 * The sidebar footer (36px, the signed-in admin) and the /admin/accounts table
 * (36px, every admin) render the same thing, and it used to be a file-local
 * `SidebarAvatar` inside AdminSidebar.jsx. A second `<img>` in the table would
 * have been the third copy of the same four attributes, and the one place the
 * two would drift is the fallback — an admin with no photo must look the same
 * in the rail and in the list, or the list reads as "photo missing" for a
 * person the rail shows as fine.
 *
 * ── THE FALLBACK IS AN IMAGE, NOT INITIALS ──────────────────────────────────
 * `avatarUrl` returns the bundled default for a null or unsafe public_id, so
 * every admin has a picture and the box never collapses. Initials would be a
 * second "no photo" look for the same person, on a surface where the name is
 * already the next column.
 *
 * ── PLAIN <img>, NOT next/image ─────────────────────────────────────────────
 * The reasoning lives in src/lib/avatar/avatarUrl.js: the URL is already a
 * finished asset at exactly `size` pixels with f_auto/q_auto, so next/image
 * would run a second optimiser over an optimised URL and its srcset would have
 * nothing to choose between across four allow-listed sizes.
 *
 * ── `alt=""`, `aria-hidden` ─────────────────────────────────────────────────
 * On both surfaces the picture sits beside, or inside a control named by, the
 * person's name or email. An alt of "profile photo" would make a screen reader
 * announce the person twice.
 *
 * Not lazy: the rail's avatar is above the fold on every admin page, and the
 * accounts list is a handful of rows. `loading="lazy"` is for things below.
 */
export function AdminAvatar({ publicId, size = 36, className = '' }) {
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={avatarUrl(publicId, size)}
      alt=""
      width={size}
      height={size}
      aria-hidden="true"
      className={`shrink-0 rounded-full object-cover ${className}`.trim()}
      style={{ width: size, height: size }}
    />
  );
}
