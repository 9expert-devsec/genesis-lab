import { PublicHeaderClient } from './PublicHeaderClient';

/**
 * Public site header — Server Component shell.
 *
 * Masterclass-only mode: the header is stripped to a logo + dark-mode
 * toggle, so none of the full-site nav data (programs, skills, career
 * paths, TNHS, online courses, masterclasses) is fetched here anymore.
 */
export function PublicHeader() {
  return <PublicHeaderClient />;
}
