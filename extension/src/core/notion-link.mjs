const NOTION_HOST_SUFFIXES = ['notion.com', 'notion.so', 'notion.site'];

export function deliveryLinkState(value) {
  try {
    const url = new URL(String(value || ''));
    const isNotionHost = NOTION_HOST_SUFFIXES.some((suffix) =>
      url.hostname === suffix || url.hostname.endsWith(`.${suffix}`)
    );
    if (url.protocol !== 'https:' || !isNotionHost) return { visible: false, href: '' };
    return { visible: true, href: url.href };
  } catch {
    return { visible: false, href: '' };
  }
}
