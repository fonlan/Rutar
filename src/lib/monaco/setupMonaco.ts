import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

declare global {
  interface Window {
    MonacoEnvironment?: {
      getWorker?: (workerId: string, label: string) => Worker;
    };
  }
}

let monacoEnvironmentInitialized = false;
let monacoBuiltinLanguageServicesConfigured = false;

interface MonacoTsDefaultsApi {
  setEagerModelSync: (enabled: boolean) => void;
  setDiagnosticsOptions: (options: {
    noSemanticValidation: boolean;
    noSyntaxValidation: boolean;
    noSuggestionDiagnostics: boolean;
  }) => void;
  setCompilerOptions: (options: Record<string, unknown>) => void;
}

interface MonacoJsonDefaultsApi {
  setDiagnosticsOptions: (options: {
    validate: boolean;
    allowComments: boolean;
    trailingCommas: 'ignore' | 'error' | 'warning';
    schemas: unknown[];
    enableSchemaRequest: boolean;
  }) => void;
}

interface MonacoBuiltinLanguagesApi {
  typescript: {
    typescriptDefaults: MonacoTsDefaultsApi;
    javascriptDefaults: MonacoTsDefaultsApi;
    ScriptTarget: { ES2020: unknown };
    ModuleResolutionKind: { NodeJs: unknown };
    ModuleKind: { ESNext: unknown };
    JsxEmit: { ReactJSX: unknown };
  };
  json: {
    jsonDefaults: MonacoJsonDefaultsApi;
  };
}

function configureMonacoBuiltinLanguageServices() {
  if (monacoBuiltinLanguageServicesConfigured) {
    return;
  }

  const languagesApi = monaco.languages as unknown as MonacoBuiltinLanguagesApi;
  const tsApi = languagesApi.typescript;
  const jsonApi = languagesApi.json;

  tsApi.typescriptDefaults.setEagerModelSync(true);
  tsApi.javascriptDefaults.setEagerModelSync(true);

  const diagnosticsOptions = {
    noSemanticValidation: false,
    noSyntaxValidation: false,
    noSuggestionDiagnostics: false,
  };
  tsApi.typescriptDefaults.setDiagnosticsOptions(diagnosticsOptions);
  tsApi.javascriptDefaults.setDiagnosticsOptions(diagnosticsOptions);

  const sharedCompilerOptions = {
    allowNonTsExtensions: true,
    allowJs: true,
    target: tsApi.ScriptTarget.ES2020,
    moduleResolution: tsApi.ModuleResolutionKind.NodeJs,
    module: tsApi.ModuleKind.ESNext,
    jsx: tsApi.JsxEmit.ReactJSX,
    resolveJsonModule: true,
  };

  tsApi.typescriptDefaults.setCompilerOptions({
    ...sharedCompilerOptions,
    strict: true,
  });
  tsApi.javascriptDefaults.setCompilerOptions({
    ...sharedCompilerOptions,
    checkJs: false,
  });

  jsonApi.jsonDefaults.setDiagnosticsOptions({
    validate: true,
    allowComments: true,
    trailingCommas: 'ignore',
    schemas: [],
    enableSchemaRequest: false,
  });

  monacoBuiltinLanguageServicesConfigured = true;
}

export function setupMonacoEnvironment() {
  if (typeof window === 'undefined') {
    return;
  }

  if (!monacoEnvironmentInitialized) {
    window.MonacoEnvironment = {
      getWorker(_workerId: string, label: string) {
        if (label === 'json') {
          return new jsonWorker();
        }

        if (label === 'css' || label === 'scss' || label === 'less') {
          return new cssWorker();
        }

        if (label === 'html' || label === 'handlebars' || label === 'razor') {
          return new htmlWorker();
        }

        if (label === 'typescript' || label === 'javascript') {
          return new tsWorker();
        }

        return new editorWorker();
      },
    };

    monacoEnvironmentInitialized = true;
  }

  // Use Monaco's built-in language services and diagnostics without external LSP.
  configureMonacoBuiltinLanguageServices();
}
