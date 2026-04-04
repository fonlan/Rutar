import type * as Monaco from 'monaco-editor';

export const RUTAR_MONACO_LIGHT_THEME = 'rutar-vs';
export const RUTAR_MONACO_DARK_THEME = 'rutar-vs-dark';

let monacoThemesConfigured = false;

export function defineRutarMonacoThemes(monaco: typeof Monaco) {
  if (monacoThemesConfigured) {
    return;
  }

  const sharedYamlTokenRules: Monaco.editor.ITokenThemeRule[] = [
    { token: 'type.yaml', foreground: 'A15C00', fontStyle: 'bold' },
    { token: 'string.yaml', foreground: '0F766E' },
    { token: 'keyword.yaml', foreground: 'A241B9' },
    { token: 'number.yaml', foreground: '1F6FEB' },
    { token: 'number.float.yaml', foreground: '1F6FEB' },
    { token: 'number.octal.yaml', foreground: '1F6FEB' },
    { token: 'number.hex.yaml', foreground: '1F6FEB' },
    { token: 'number.infinity.yaml', foreground: '1F6FEB' },
    { token: 'number.nan.yaml', foreground: '1F6FEB' },
    { token: 'number.date.yaml', foreground: '0E7490' },
    { token: 'operators.yaml', foreground: '6B7280' },
    { token: 'operators.directivesEnd.yaml', foreground: '9A6700', fontStyle: 'bold' },
    { token: 'operators.documentEnd.yaml', foreground: '9A6700', fontStyle: 'bold' },
    { token: 'delimiter.bracket.yaml', foreground: '6B7280' },
    { token: 'delimiter.square.yaml', foreground: '6B7280' },
    { token: 'delimiter.comma.yaml', foreground: '6B7280' },
    { token: 'meta.directive.yaml', foreground: '6F42C1' },
    { token: 'tag.yaml', foreground: '0550AE' },
    { token: 'namespace.yaml', foreground: '0E7490' },
  ];

  monaco.editor.defineTheme(RUTAR_MONACO_LIGHT_THEME, {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'comment.yaml', foreground: '6E7781', fontStyle: 'italic' },
      ...sharedYamlTokenRules,
    ],
    colors: {},
  });

  monaco.editor.defineTheme(RUTAR_MONACO_DARK_THEME, {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment.yaml', foreground: '8B949E', fontStyle: 'italic' },
      ...sharedYamlTokenRules.map((rule) => {
        switch (rule.token) {
          case 'type.yaml':
            return { ...rule, foreground: 'FFCB6B' };
          case 'string.yaml':
            return { ...rule, foreground: '8BD5CA' };
          case 'keyword.yaml':
            return { ...rule, foreground: 'C792EA' };
          case 'number.yaml':
          case 'number.float.yaml':
          case 'number.octal.yaml':
          case 'number.hex.yaml':
          case 'number.infinity.yaml':
          case 'number.nan.yaml':
            return { ...rule, foreground: '82AAFF' };
          case 'number.date.yaml':
            return { ...rule, foreground: '7DCFFF' };
          case 'operators.yaml':
          case 'delimiter.bracket.yaml':
          case 'delimiter.square.yaml':
          case 'delimiter.comma.yaml':
            return { ...rule, foreground: '7F8EA3' };
          case 'operators.directivesEnd.yaml':
          case 'operators.documentEnd.yaml':
            return { ...rule, foreground: 'D6A756' };
          case 'meta.directive.yaml':
            return { ...rule, foreground: 'C39BFF' };
          case 'tag.yaml':
            return { ...rule, foreground: '7DCFFF' };
          case 'namespace.yaml':
            return { ...rule, foreground: '4FC1FF' };
          default:
            return rule;
        }
      }),
    ],
    colors: {},
  });

  monacoThemesConfigured = true;
}

export function resolveRutarMonacoTheme(theme: string) {
  return theme === 'dark' ? RUTAR_MONACO_DARK_THEME : RUTAR_MONACO_LIGHT_THEME;
}
