declare module 'mermaid/dist/mermaid.core.mjs' {
  interface MermaidRenderResult {
    svg: string;
  }

  interface MermaidApi {
    initialize: (options: Record<string, unknown>) => void;
    render: (id: string, text: string) => Promise<MermaidRenderResult>;
  }

  const mermaid: MermaidApi;
  export default mermaid;
}
