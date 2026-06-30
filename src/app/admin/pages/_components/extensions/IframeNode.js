import { Node, mergeAttributes } from '@tiptap/core';

/**
 * Tiptap node that preserves <iframe> embeds (Google Forms, YouTube, Vimeo,
 * Maps, …) through the editor's parse → serialize round-trip.
 *
 * Why this exists: StarterKit and the other extensions have NO schema entry
 * for <iframe>. ProseMirror discards any element it doesn't recognise, so
 * when toggleSourceMode does `editor.commands.setContent(sourceHtml)` the
 * pasted iframe was dropped and only its fallback text ("กำลังโหลด…")
 * survived. Registering this node teaches the editor that <iframe> is a
 * first-class atomic block, so it survives both setContent (source→WYSIWYG)
 * and getHTML (WYSIWYG→source / save).
 *
 * SECURITY: this is NOT a security boundary. It only controls what the
 * EDITOR keeps. The authority on what renders publicly is the server-side
 * sanitizePageHtml (sanitize-html with a strict allowedIframeHostnames
 * whitelist). The attribute set here mirrors that sanitizer's iframe
 * allowlist so nothing legitimate is stripped before it reaches the DB, but
 * the sanitizer — not this node — decides what is actually safe to render.
 */

// One attribute definition: read it from the DOM, and re-emit it only when
// present. `null` means "absent" → omitted on render. We keep '' so boolean
// attributes like `allowfullscreen` (whose DOM value is the empty string when
// present) round-trip correctly.
function iframeAttr(name) {
  return {
    default: null,
    parseHTML: (element) => element.getAttribute(name),
    renderHTML: (attrs) => (attrs[name] == null ? {} : { [name]: attrs[name] }),
  };
}

export const IframeNode = Node.create({
  name: 'iframe',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      src: iframeAttr('src'),
      width: iframeAttr('width'),
      height: iframeAttr('height'),
      frameborder: iframeAttr('frameborder'),
      scrolling: iframeAttr('scrolling'),
      allow: iframeAttr('allow'),
      allowfullscreen: iframeAttr('allowfullscreen'),
      referrerpolicy: iframeAttr('referrerpolicy'),
      loading: iframeAttr('loading'),
      title: iframeAttr('title'),
    };
  },

  parseHTML() {
    return [{ tag: 'iframe' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['iframe', mergeAttributes(HTMLAttributes)];
  },

  /**
   * In-editor view: render the real iframe so the admin sees the embed, but
   * lay an inert overlay over it so a click selects the node (for delete /
   * move) instead of interacting with the embedded form.
   */
  addNodeView() {
    return ({ HTMLAttributes }) => {
      const wrapper = document.createElement('div');
      wrapper.setAttribute('data-iframe-node', '');
      wrapper.style.position = 'relative';
      wrapper.style.display = 'block';
      wrapper.style.maxWidth = '100%';

      const iframe = document.createElement('iframe');
      Object.entries(HTMLAttributes).forEach(([key, value]) => {
        if (value != null) iframe.setAttribute(key, value);
      });
      iframe.style.maxWidth = '100%';
      iframe.style.pointerEvents = 'none';

      // Transparent overlay: swallows pointer events so clicking the embed
      // selects the node rather than scrolling/typing inside the iframe.
      const overlay = document.createElement('div');
      overlay.style.position = 'absolute';
      overlay.style.inset = '0';
      overlay.style.cursor = 'pointer';

      wrapper.appendChild(iframe);
      wrapper.appendChild(overlay);

      return { dom: wrapper };
    };
  },
});

export default IframeNode;
