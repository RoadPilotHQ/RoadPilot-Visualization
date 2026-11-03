import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

/**
 * Architecture boundaries (see docs/architecture/overview.md):
 *
 *   ui -> state -> sources -> contract -> domain
 *   ui -> render -> domain
 *
 * `domain` imports nothing else. `render` never sees data sources, and nothing outside
 * `sources` may open network connections (the application is strictly read-only).
 */
const layers = ['domain', 'contract', 'sources', 'state', 'render', 'ui', 'app']
const allowed = {
  domain: [],
  contract: ['domain'],
  sources: ['domain', 'contract'],
  state: ['domain', 'sources'],
  render: ['domain'],
  ui: ['domain', 'state', 'render', 'theme'],
  app: ['domain', 'contract', 'sources', 'state', 'render', 'ui', 'theme'],
}

const forbidden = (layer) => layers.filter((l) => l !== layer && !allowed[layer].includes(l))

const boundaryConfigs = layers
  .filter((layer) => forbidden(layer).length > 0)
  .map((layer) => ({
    files: [`src/${layer}/**/*.{ts,tsx}`],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: String.raw`^(@/|(\.\./)+)(${forbidden(layer).join('|')})(/|$)`,
              message: `The "${layer}" layer must not import from this layer. See docs/architecture/overview.md.`,
            },
          ],
        },
      ],
    },
  }))

const networkGlobals = ['fetch', 'WebSocket', 'EventSource', 'XMLHttpRequest'].map((name) => ({
  name,
  message: 'Network access is only allowed inside src/sources (read-only data sources).',
}))

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'src-tauri/target'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-restricted-globals': ['error', ...networkGlobals],
    },
  },
  {
    files: ['**/*.js', 'vite.config.ts'],
    languageOptions: { globals: globals.node },
  },
  ...boundaryConfigs,
  {
    files: ['src/sources/**/*.{ts,tsx}'],
    rules: { 'no-restricted-globals': 'off' },
  },
)
