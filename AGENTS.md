# Codex Instructions

## Project overview
- Stack: Vite + Vue 3 (SFC) + TypeScript + Vue Router + Tailwind CSS + TanStack Vue Query.
- Entry: `src/main.ts` mounts `src/App.vue` and registers the router/query client.

## Structure and conventions
- Pages live in `src/pages` and are routed in `src/router/index.ts` via lazy imports.
- Reusable components go in `src/components`; composables in `src/composables`; shared utils in `src/lib`.
- Use the alias `@/` for `src/` imports.
- Prefer `<script setup lang="ts">` and Composition API patterns in Vue SFCs.

## Styling
- Prefer Tailwind utility classes; keep new custom CSS minimal and centralized in `src/index.css`.
- Reuse existing design tokens/variables from `src/index.css` when possible.

## Data/state
- Use TanStack Vue Query for server state; avoid ad-hoc fetch logic in components.

## Commands
- Install: `npm install`
- Dev server: `npm run dev`
- Build: `npm run build`
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`

## Do not touch
- Avoid editing `dist/` or `node_modules/` directly.
