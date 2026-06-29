import { invoke } from '@tauri-apps/api/core';
import type { TranslationEngine, TranslationSettings } from '@/store/useStore';

type BackendTranslate = (cmd: string, args?: Record<string, unknown>) => Promise<string>;

interface TranslateDocumentTextOptions {
  settings: TranslationSettings;
  text: string;
  fetcher?: typeof fetch;
  backendTranslate?: BackendTranslate;
}

type GoogleTranslateResponse = Array<Array<[string]>>;

function resolveTranslationProxyServer(settings: TranslationSettings, engine: TranslationEngine) {
  return settings[engine].proxyServer.trim();
}

function validateProxyServer(proxyServer: string) {
  if (!proxyServer) {
    return;
  }

  let protocol: string;
  try {
    protocol = new URL(proxyServer).protocol;
  } catch {
    throw new Error('Proxy server must be a valid http://, https://, or socks5:// URL.');
  }

  if (!['http:', 'https:', 'socks5:'].includes(protocol)) {
    throw new Error('Proxy server must use http://, https://, or socks5://.');
  }
}

export function resolveTranslationRequest(settings: TranslationSettings) {
  const engine = settings.engine;
  const proxyServer = resolveTranslationProxyServer(settings, engine);
  validateProxyServer(proxyServer);

  if (engine === 'microsoft') {
    return {
      engine,
      method: 'POST' as const,
      proxyServer,
      url: 'https://api.cognitive.microsofttranslator.com/translate',
      useBackend: true,
    };
  }

  const params = new URLSearchParams({
    client: 'gtx',
    sl: 'auto',
    tl: settings.targetLanguage,
    dt: 't',
  });

  return {
    engine,
    method: 'GET' as const,
    proxyServer,
    url: `https://translate.googleapis.com/translate_a/single?${params.toString()}`,
    useBackend: !!proxyServer,
  };
}

export function parseTranslationResponse(responseBody: unknown): string {
  if (typeof responseBody === 'string') {
    return responseBody;
  }

  if (
    responseBody
    && typeof responseBody === 'object'
    && 'translatedText' in responseBody
    && typeof responseBody.translatedText === 'string'
  ) {
    return responseBody.translatedText;
  }

  if (Array.isArray(responseBody)) {
    const googleBody = responseBody as GoogleTranslateResponse;
    const translatedText = googleBody[0]
      ?.map((part) => (Array.isArray(part) && typeof part[0] === 'string' ? part[0] : ''))
      .join('');
    if (translatedText) {
      return translatedText;
    }
  }

  throw new Error('Translation response did not include translated text.');
}

async function readTranslationResponse(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  return response.text();
}

export async function translateDocumentText({
  settings,
  text,
  fetcher = fetch,
  backendTranslate = (cmd, args) => invoke<string>(cmd, args),
}: TranslateDocumentTextOptions): Promise<string> {
  const request = resolveTranslationRequest(settings);

  if (request.useBackend) {
    return backendTranslate('translate_document_text', {
      request: {
        engine: request.engine,
        proxyServer: request.proxyServer || null,
        targetLanguage: settings.targetLanguage,
        text,
      },
    });
  }

  const response = await fetcher(`${request.url}&q=${encodeURIComponent(text)}`, {
    method: request.method,
  });

  if (!response.ok) {
    throw new Error(`Translation request failed with HTTP ${response.status}.`);
  }

  return parseTranslationResponse(await readTranslationResponse(response));
}
