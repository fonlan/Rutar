declare module 'prismjs' {
  const module: {
    highlightElement: (element: Element) => void;
    languages: Record<string, unknown>;
    manual?: boolean;
  };
  export default module;
}

declare module 'prismjs/components/*' {
  const value: unknown;
  export default value;
}