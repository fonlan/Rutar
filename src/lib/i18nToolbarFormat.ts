import { AppLanguage } from '@/store/useStore';

export const toolbarFormatMessages: Record<AppLanguage, {
  beautify: string;
  minify: string;
  unsupported: string;
  failed: string;
}> = {
  'zh-CN': {
    beautify: '格式化文档 (Ctrl+Alt+F)',
    minify: '最小化文档 (Ctrl+Alt+M)',
    unsupported: '仅支持 JSON / YAML / XML / TOML 文件格式化。',
    failed: '格式化失败：',
  },
  'en-US': {
    beautify: 'Beautify (Ctrl+Alt+F)',
    minify: 'Minify (Ctrl+Alt+M)',
    unsupported: 'Only JSON, YAML, XML, and TOML are supported.',
    failed: 'Format failed:',
  },
};

