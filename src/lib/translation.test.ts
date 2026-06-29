import { describe, expect, it, vi } from 'vitest';
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

  it('posts minimal JSON to a configured proxy', async () => {
    const fetcher = vi.fn(async () => createJsonResponse({ translatedText: 'Bonjour' }));
    const settings = createSettings({
      engine: 'microsoft',
      targetLanguage: 'fr',
      microsoft: { proxyUrl: 'https://example.test/translate' },
    });

    await expect(translateDocumentText({ settings, text: 'Hello', fetcher })).resolves.toBe('Bonjour');

    expect(fetcher).toHaveBeenCalledWith(
      'https://example.test/translate',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          engine: 'microsoft',
          text: 'Hello',
          targetLanguage: 'fr',
        }),
      }
    );
  });

  it('rejects Microsoft without a proxy URL', () => {
    expect(() => resolveTranslationRequest(createSettings({ engine: 'microsoft' }))).toThrow(
      'Microsoft translation requires a configured proxy URL.'
    );
  });

  it('parses proxy string and object responses', () => {
    expect(parseTranslationResponse('Hola')).toBe('Hola');
    expect(parseTranslationResponse({ translatedText: 'Hallo' })).toBe('Hallo');
  });
});
