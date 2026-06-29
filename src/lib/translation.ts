import type { TranslationEngine, TranslationSettings } from '@/store/useStore';

interface TranslateDocumentTextOptions {
  settings: TranslationSettings;
  text: string;
  fetcher?: typeof fetch;
}

type GoogleTranslateResponse = Array<Array<[string]>>;

function resolveTranslationProxyUrl(settings: TranslationSettings, engine: TranslationEngine) {
  return settings[engine].proxyUrl.trim();
}

export function resolveTranslationRequest(settings: TranslationSettings) {
  const engine = settings.engine;
  const proxyUrl = resolveTranslationProxyUrl(settings, engine);
  if (proxyUrl) {
    return {
      engine,
      method: 'POST' as const,
      url: proxyUrl,
      useProxy: true,
    };
  }

  if (engine === 'microsoft') {
    throw new Error('Microsoft translation requires a configured proxy URL.');
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
    url: `https://translate.googleapis.com/translate_a/single?${params.toString()}`,
    useProxy: false,
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
}: TranslateDocumentTextOptions): Promise<string> {
  const request = resolveTranslationRequest(settings);
  const response = request.useProxy
    ? await fetcher(request.url, {
      method: request.method,
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        engine: request.engine,
        text,
        targetLanguage: settings.targetLanguage,
      }),
    })
    : await fetcher(`${request.url}&q=${encodeURIComponent(text)}`, {
      method: request.method,
    });

  if (!response.ok) {
    throw new Error(`Translation request failed with HTTP ${response.status}.`);
  }

  return parseTranslationResponse(await readTranslationResponse(response));
}
