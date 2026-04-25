/**
 * HTML trust helpers -- parse an untrusted HTML string under a
 * configurable {@link HtmlPolicy} (text escape, sanitise, or pass
 * through after an opt-in). Backs `@czap/web`'s DOM morph and slot
 * injection so callers never touch `innerHTML` directly.
 *
 * @module
 */
import type { HtmlPolicy } from '../types.js';

/**
 * Options controlling how {@link createHtmlFragment} /
 * {@link resolveHtmlString} interpret a string.
 *
 * `allowTrustedHtml` must be explicitly set to `true` before the
 * `'trusted-html'` policy is honoured -- otherwise the helper
 * downgrades to `'sanitized-html'` so callers cannot accidentally
 * widen the trust boundary.
 */
export interface HtmlTrustOptions {
  /** Requested trust level. Defaults to `sanitized-html`. */
  readonly policy?: HtmlPolicy;
  /** Pass-through allowlist for the `trusted-html` policy. */
  readonly allowTrustedHtml?: boolean;
}

const DANGEROUS_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH']);

function escapeHtml(raw: string): string {
  return raw
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function effectiveHtmlPolicy(options?: HtmlTrustOptions): HtmlPolicy {
  const requested = options?.policy ?? 'sanitized-html';
  if (requested === 'trusted-html' && options?.allowTrustedHtml !== true) {
    return 'sanitized-html';
  }

  return requested;
}

function isDangerousAttribute(name: string, value: string): boolean {
  const lowerName = name.toLowerCase();
  const normalizedValue = value.trim().toLowerCase();

  if (lowerName.startsWith('on')) {
    return true;
  }

  if (lowerName === 'srcdoc' || lowerName === 'style') {
    return true;
  }

  if (normalizedValue.startsWith('javascript:') || normalizedValue.startsWith('data:text/html')) {
    return lowerName === 'href' || lowerName === 'src' || lowerName === 'xlink:href';
  }

  return false;
}

function sanitizeElementTree(root: ParentNode): void {
  const queue: Element[] = [];

  for (const child of Array.from(root.childNodes)) {
    if (child instanceof Element) {
      queue.push(child);
    }
  }

  while (queue.length > 0) {
    const element = queue.shift()!;
    if (DANGEROUS_TAGS.has(element.tagName.toUpperCase())) {
      element.remove();
      continue;
    }

    for (const attribute of Array.from(element.attributes)) {
      if (isDangerousAttribute(attribute.name, attribute.value)) {
        element.removeAttribute(attribute.name);
      }
    }

    for (const child of Array.from(element.children)) {
      queue.push(child);
    }
  }
}

function createTemplate(html: string, options?: HtmlTrustOptions): HTMLTemplateElement {
  const template = document.createElement('template');
  const policy = effectiveHtmlPolicy(options);

  switch (policy) {
    case 'text':
      template.innerHTML = escapeHtml(html);
      break;
    case 'trusted-html':
      template.innerHTML = html;
      break;
    case 'sanitized-html':
      template.innerHTML = html;
      sanitizeElementTree(template.content);
      break;
  }

  return template;
}

/**
 * Parse `html` under `options.policy` and return a `DocumentFragment`
 * ready to be appended to the live DOM. Dangerous elements
 * (`<script>`, `<iframe>`, etc.) and attributes (`on*`, `srcdoc`,
 * javascript/data URLs) are stripped when the effective policy is
 * `sanitized-html`.
 */
export function createHtmlFragment(html: string, options?: HtmlTrustOptions): DocumentFragment {
  return createTemplate(html, options).content;
}

/**
 * Serialise `html` back to string form after applying the effective
 * policy. Useful for host code that must hand cleaned markup to another
 * subsystem (e.g. a worker) rather than append it directly.
 */
export function resolveHtmlString(html: string, options?: HtmlTrustOptions): string {
  return createTemplate(html, options).innerHTML;
}

/**
 * Convenience wrapper that always applies the `sanitized-html` policy.
 * Use when a caller just wants the "clean the markup" behaviour without
 * threading options.
 */
export function sanitizeHTML(html: string): string {
  return resolveHtmlString(html, { policy: 'sanitized-html' });
}
