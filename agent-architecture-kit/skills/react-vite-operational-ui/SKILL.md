# React Vite Operational UI

Use this skill when building frontend screens for this architecture.

## App Shape

- `index.tsx` mounts `App.tsx`.
- `App.tsx` owns the main workflow state.
- Shared state lives in `hooks/index.ts`.
- API calls go through `services/apiClient.ts`.
- Domain display components live in `components/`.
- Small reusable primitives live in `components/ui/`.
- If embeddable mode is needed, expose a `widget.tsx` custom element with Shadow DOM.

## UI Principles

- Build the usable app as the first screen.
- Prefer operational dashboards and workflows over marketing layouts.
- Use stable responsive dimensions for grids, tables, boards and toolbars.
- Use icons in icon buttons when a clear icon exists.
- Avoid visible explanatory text for obvious interactions.
- Make tables/forms/filtering/search/export states complete enough for real use.
- Reuse small primitives such as `cn`, Button, Badge, Tooltip, Progress, ScrollArea, Separator and Skeleton.

## State Rules

- Store only safe preferences in localStorage: session id, tenant/context id, dark mode.
- Do not store secrets or full user records in localStorage.
- Restore session before deciding the first route.
- Use role/context checks before showing privileged views.

## API Client Rules

- Use `API_BASE = '/api'`.
- Inject `X-Session-Id`.
- Do not set JSON content type for `FormData`.
- Convert non-OK responses into `ApiError`.
- Keep blob/download helpers in the api client.

## Optional Widget Pattern

Only add this if the product needs embedding:

- Register one custom element.
- Mount React inside Shadow DOM.
- Inject compiled CSS with an inline import such as `index.css?inline`.
- Pass widget-specific props to `App`.
