export type MonacoMinimapAutohide = 'none' | 'mouseover';

export interface MonacoMinimapOptions {
  enabled: boolean;
  autohide: MonacoMinimapAutohide;
}

export function resolveMonacoMinimapOptions(enabled: boolean, wordWrap: boolean): MonacoMinimapOptions {
  return {
    enabled,
    autohide: enabled && wordWrap ? 'mouseover' : 'none',
  };
}