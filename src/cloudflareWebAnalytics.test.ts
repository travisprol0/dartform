import { describe, expect, it } from 'vitest';
import {
  installCloudflareWebAnalytics,
  type BeaconDocument,
} from './cloudflareWebAnalytics';

type TrackedScript = {
  type: string;
  src: string;
  attrs: Record<string, string>;
  setAttribute(name: string, value: string): void;
};

function makeDocument() {
  const scripts: TrackedScript[] = [];

  const doc: BeaconDocument = {
    querySelector(selectors: string) {
      const match = /^script\[src="(.+)"\]$/.exec(selectors);
      if (!match) {
        return null;
      }
      return scripts.find((script) => script.src === match[1]) ?? null;
    },
    createElement(tagName: 'script') {
      if (tagName !== 'script') {
        throw new Error(`unexpected tag ${tagName}`);
      }
      const script: TrackedScript = {
        type: '',
        src: '',
        attrs: {},
        setAttribute(name: string, value: string) {
          script.attrs[name] = value;
        },
      };
      return script;
    },
    head: {
      appendChild(node) {
        scripts.push(node as TrackedScript);
        return node;
      },
    },
  };

  return { doc, scripts };
}

describe('installCloudflareWebAnalytics', () => {
  it('does nothing without a token or document', () => {
    const { doc, scripts } = makeDocument();

    expect(installCloudflareWebAnalytics(undefined, doc)).toBe(false);
    expect(installCloudflareWebAnalytics('', doc)).toBe(false);
    expect(installCloudflareWebAnalytics('token')).toBe(false);
    expect(scripts).toHaveLength(0);
  });

  it('injects Cloudflare’s module beacon once', () => {
    const { doc, scripts } = makeDocument();

    expect(installCloudflareWebAnalytics('site-token', doc)).toBe(true);
    expect(installCloudflareWebAnalytics('site-token', doc)).toBe(false);

    expect(scripts).toHaveLength(1);
    expect(scripts[0]?.type).toBe('module');
    expect(scripts[0]?.src).toBe(
      'https://static.cloudflareinsights.com/beacon.min.js',
    );
    expect(scripts[0]?.attrs['data-cf-beacon']).toBe(
      JSON.stringify({ token: 'site-token' }),
    );
  });
});
