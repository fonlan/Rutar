const setupMonacoMockState = vi.hoisted(() => {
  const createWorker = (kind: string) =>
    vi.fn(function WorkerMock(this: { kind?: string }) {
      this.kind = kind;
    });
  return {
    editorWorkerCtor: createWorker('editor'),
    cssWorkerCtor: createWorker('css'),
    htmlWorkerCtor: createWorker('html'),
    jsonWorkerCtor: createWorker('json'),
    tsWorkerCtor: createWorker('ts'),
    tsDefaults: {
      setEagerModelSync: vi.fn(),
      setDiagnosticsOptions: vi.fn(),
      setCompilerOptions: vi.fn(),
    },
    jsDefaults: {
      setEagerModelSync: vi.fn(),
      setDiagnosticsOptions: vi.fn(),
      setCompilerOptions: vi.fn(),
    },
    jsonDefaults: {
      setDiagnosticsOptions: vi.fn(),
    },
  };
});

vi.mock('monaco-editor/esm/vs/editor/editor.worker?worker', () => ({
  default: setupMonacoMockState.editorWorkerCtor,
}));
vi.mock('monaco-editor/esm/vs/language/css/css.worker?worker', () => ({
  default: setupMonacoMockState.cssWorkerCtor,
}));
vi.mock('monaco-editor/esm/vs/language/html/html.worker?worker', () => ({
  default: setupMonacoMockState.htmlWorkerCtor,
}));
vi.mock('monaco-editor/esm/vs/language/json/json.worker?worker', () => ({
  default: setupMonacoMockState.jsonWorkerCtor,
}));
vi.mock('monaco-editor/esm/vs/language/typescript/ts.worker?worker', () => ({
  default: setupMonacoMockState.tsWorkerCtor,
}));

vi.mock('monaco-editor', () => ({
  languages: {
    typescript: {
      typescriptDefaults: setupMonacoMockState.tsDefaults,
      javascriptDefaults: setupMonacoMockState.jsDefaults,
      ScriptTarget: {
        ES2020: 'ES2020',
      },
      ModuleResolutionKind: {
        NodeJs: 'NodeJs',
      },
      ModuleKind: {
        ESNext: 'ESNext',
      },
      JsxEmit: {
        ReactJSX: 'ReactJSX',
      },
    },
    json: {
      jsonDefaults: setupMonacoMockState.jsonDefaults,
    },
  },
}));

describe('setupMonacoEnvironment', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete (window as Window & { MonacoEnvironment?: unknown }).MonacoEnvironment;
  });

  it('initializes worker routing and Monaco built-in language services once', async () => {
    const { setupMonacoEnvironment } = await import('./setupMonaco');

    setupMonacoEnvironment();

    expect(window.MonacoEnvironment?.getWorker).toBeTypeOf('function');

    window.MonacoEnvironment?.getWorker?.('id', 'json');
    window.MonacoEnvironment?.getWorker?.('id', 'css');
    window.MonacoEnvironment?.getWorker?.('id', 'html');
    window.MonacoEnvironment?.getWorker?.('id', 'typescript');
    window.MonacoEnvironment?.getWorker?.('id', 'javascript');
    window.MonacoEnvironment?.getWorker?.('id', 'plaintext');

    expect(setupMonacoMockState.jsonWorkerCtor).toHaveBeenCalledTimes(1);
    expect(setupMonacoMockState.cssWorkerCtor).toHaveBeenCalledTimes(1);
    expect(setupMonacoMockState.htmlWorkerCtor).toHaveBeenCalledTimes(1);
    expect(setupMonacoMockState.tsWorkerCtor).toHaveBeenCalledTimes(2);
    expect(setupMonacoMockState.editorWorkerCtor).toHaveBeenCalledTimes(1);

    expect(setupMonacoMockState.tsDefaults.setEagerModelSync).toHaveBeenCalledWith(true);
    expect(setupMonacoMockState.jsDefaults.setEagerModelSync).toHaveBeenCalledWith(true);
    expect(setupMonacoMockState.tsDefaults.setDiagnosticsOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        noSemanticValidation: false,
        noSyntaxValidation: false,
      })
    );
    expect(setupMonacoMockState.jsDefaults.setDiagnosticsOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        noSemanticValidation: false,
        noSyntaxValidation: false,
      })
    );
    expect(setupMonacoMockState.tsDefaults.setCompilerOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        strict: true,
      })
    );
    expect(setupMonacoMockState.jsDefaults.setCompilerOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        checkJs: false,
      })
    );
    expect(setupMonacoMockState.jsonDefaults.setDiagnosticsOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        validate: true,
        allowComments: true,
        trailingCommas: 'ignore',
      })
    );

    setupMonacoEnvironment();

    expect(setupMonacoMockState.tsDefaults.setEagerModelSync).toHaveBeenCalledTimes(1);
    expect(setupMonacoMockState.jsDefaults.setEagerModelSync).toHaveBeenCalledTimes(1);
    expect(setupMonacoMockState.tsDefaults.setDiagnosticsOptions).toHaveBeenCalledTimes(1);
    expect(setupMonacoMockState.jsDefaults.setDiagnosticsOptions).toHaveBeenCalledTimes(1);
    expect(setupMonacoMockState.tsDefaults.setCompilerOptions).toHaveBeenCalledTimes(1);
    expect(setupMonacoMockState.jsDefaults.setCompilerOptions).toHaveBeenCalledTimes(1);
    expect(setupMonacoMockState.jsonDefaults.setDiagnosticsOptions).toHaveBeenCalledTimes(1);
  });
});
