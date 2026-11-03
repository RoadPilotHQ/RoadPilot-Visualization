# 0005: Browser-first development, Tauri later, pinned dependencies

Status: accepted

## Decision

- The application is developed and tested in the browser (Vite). Tauri 2 is added in the packaging phase. The `src-tauri` folder stays empty until then.
- Fonts are self-hosted through `@fontsource` packages, so the app works offline and does not call external servers.
- All dependencies are pinned to exact versions (no `latest`, no ranges). `vite` and `@vitejs/plugin-react` are development dependencies.
- TypeScript is pinned to 6.0.3 because `typescript-eslint` 8.72 supports TypeScript below 6.1 only. Revisit when `typescript-eslint` supports TypeScript 7.
- State management uses Zustand. Wire data is validated with Zod at the contract boundary.

## Consequences

- Upgrades are deliberate and reviewed.
- `npm audit` reports moderate advisories in development tooling (a transitive `minimatch` dependency of ESLint). They do not ship in the application bundle.
