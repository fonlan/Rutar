import { describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

import { defaultTranslationSettings, type TranslationSettings } from '@/store/useStore';
import {
  parseTranslationResponse,
  resolveTranslationRequest,
  translateDocumentText,
} from './translation';

function createSettings(overrides: Partial<TranslationSettings> = {}): TranslationSettings {
  return {
    ...defaultTranslationSettings,
    google: { ...defaultTranslationSettings.google, ...overrides.google },
    microsoft: { ...defaultTranslationSettings.microsoft, ...overrides.microsoft },
    ...overrides,
  };
}

function createJsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe('translation', () => {
  it('uses Google public endpoint when no proxy is configured', async () => {
    const fetcher = vi.fn(async () => createJsonResponse([[['你好'], ['世界']]]));

    await expect(translateDocumentText({
      settings: createSettings({ targetLanguage: 'zh-CN' }),
      text: 'hello world',
      fetcher,
    })).resolves.toBe('你好世界');

    expect(fetcher).toHaveBeenCalledWith(
      'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&q=hello%20world',
      { method: 'GET' }
    );
  });

  it('uses the selected engine proxy server through the backend', async () => {
    const backendTranslate = vi.fn(async () => 'Bonjour');
    const fetcher = vi.fn();
    const settings = createSettings({
      engine: 'microsoft',
      targetLanguage: 'fr',
      google: { proxyServer: 'socks5://127.0.0.1:7000' },
      microsoft: { proxyServer: 'http://127.0.0.1:7890' },
    });

    await expect(translateDocumentText({
      settings,
      text: 'Hello',
      fetcher,
      backendTranslate,
    })).resolves.toBe('Bonjour');

    expect(fetcher).not.toHaveBeenCalled();
    expect(backendTranslate).toHaveBeenCalledWith('translate_document_text', {
      request: {
        engine: 'microsoft',
        proxyServer: 'http://127.0.0.1:7890',
        targetLanguage: 'fr',
        text: 'Hello',
      },
    });
  });

  it('rejects unsupported proxy server schemes', () => {
    expect(() => resolveTranslationRequest(createSettings({
      google: { proxyServer: 'ftp://127.0.0.1:21' },
    }))).toThrow('Proxy server must use http://, https://, or socks5://.');
  });

  it('parses proxy string and object responses', () => {
    expect(parseTranslationResponse('Hola')).toBe('Hola');
    expect(parseTranslationResponse({ translatedText: 'Hallo' })).toBe('Hallo');
  });
});
