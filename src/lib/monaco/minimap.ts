export type MonacoMinimapAutohide = 'none' | 'mouseover';

export interface MonacoMinimapOptions {
  enabled: boolean;
  autohide: MonacoMinimapAutohide;
}

export function resolveMonacoMinimapOptions(enabled: boolean, autohide: boolean): MonacoMinimapOptions {
  return {
    enabled,
    autohide: enabled && autohide ? 'mouseover' : 'none',
  };
}