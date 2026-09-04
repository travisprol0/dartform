const BEACON_SRC = 'https://static.cloudflareinsights.com/beacon.min.js';

type BeaconScript = {
  type: string;
  src: string;
  setAttribute(name: string, value: string): void;
};

export type BeaconDocument = {
  querySelector(selectors: string): unknown;
  createElement(tagName: 'script'): BeaconScript;
  head: { appendChild(node: BeaconScript): unknown };
};

export function installCloudflareWebAnalytics(
  token: string | undefined,
  doc: BeaconDocument | undefined = typeof document === 'undefined'
    ? undefined
    : (document as BeaconDocument),
): boolean {
  if (!token || !doc) {
    return false;
  }

  if (doc.querySelector(`script[src="${BEACON_SRC}"]`)) {
    return false;
  }

  const script = doc.createElement('script');
  script.type = 'module';
  script.src = BEACON_SRC;
  script.setAttribute('data-cf-beacon', JSON.stringify({ token }));
  doc.head.appendChild(script);
  return true;
}
