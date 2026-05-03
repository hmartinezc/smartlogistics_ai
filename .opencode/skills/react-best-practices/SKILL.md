---
name: vercel-react-best-practices
description: React performance optimization for Vite + React 18 SPAs. Use when writing, reviewing, or refactoring React components, implementing data fetching, or optimizing re-renders and bundle size.
license: MIT
metadata:
  author: vercel
  version: '2.0.0'
---

# React Best Practices (Vite + React 18 SPA Edition)

Performance optimization guide adapted for Vite + React 18 single-page applications. No SSR, no RSC, no Next.js.

## When to Apply

- Writing new React components
- Reviewing code for performance issues
- Refactoring existing React code
- Optimizing bundle size or load times
- Client-side data fetching patterns

## Rule Categories by Priority

| Priority | Category                  | Impact     |
| -------- | ------------------------- | ---------- |
| 1        | Eliminating Waterfalls    | CRITICAL   |
| 2        | Bundle Size Optimization  | CRITICAL   |
| 3        | Re-render Optimization    | MEDIUM     |
| 4        | Client-Side Data Fetching | MEDIUM     |
| 5        | Rendering Performance     | MEDIUM     |
| 6        | JavaScript Performance    | LOW-MEDIUM |

---

## 1. Eliminating Waterfalls (CRITICAL)

- **Defer await until needed** — Move `await` into branches where the value is actually used
- **Promise.all() for independent operations** — Run independent async calls concurrently
- **Check cheap sync conditions before async** — If a branch requires both a sync guard and an async flag, check sync first to skip unnecessary async work

```tsx
// Defer await
async function handleRequest(id: string, skip: boolean) {
  if (skip) return { skipped: true }; // exits immediately
  const data = await fetchData(id); // only when needed
  return process(data);
}

// Promise.all
const [user, posts, comments] = await Promise.all([fetchUser(), fetchPosts(), fetchComments()]);
```

---

## 2. Bundle Size Optimization (CRITICAL)

- **Avoid barrel file imports** — Import directly from source files, not index re-exports
- **Dynamic imports with React.lazy** — Lazy-load heavy components not needed on initial render
- **Conditional module loading** — Load modules only when feature is activated
- **Preload on user intent** — Preload heavy bundles on hover/focus

```tsx
// React.lazy for heavy components
const MonacoEditor = React.lazy(() => import('./monaco-editor'))

// Preload on hover
<button
  onMouseEnter={() => import('./heavy-module')}
  onClick={openEditor}
>
  Open Editor
</button>

// Direct imports, not barrel files
import Button from '@mui/material/Button'  // not import { Button } from '@mui/material'
```

---

## 3. Re-render Optimization (MEDIUM)

- **Defer state reads to usage point** — Don't subscribe to state only used in callbacks
- **Extract expensive work into memoized components** — Use `React.memo` + `useMemo` for expensive subtrees
- **Use primitive dependencies in effects** — `[user.id]` not `[user]`
- **Derive state during render, not in effects** — `const fullName = firstName + ' ' + lastName`
- **Use functional setState for stable callbacks** — `setCount(c => c + 1)` not `setCount(count + 1)`
- **Pass function to useState for expensive init** — `useState(() => buildIndex(items))`
- **Use useTransition for non-urgent updates** — `startTransition(() => setResults(data))`
- **Use useDeferredValue for expensive derived renders** — Keep input responsive during heavy filtering
- **Use useRef for transient frequent values** — Mouse position, intervals, flags
- **Don't define components inside components** — Creates new component type every render, destroys state
- **Extract default non-primitive props to constants** — `const NOOP = () => {}` for default callbacks in memo
- **Split hooks with independent dependencies** — Don't combine unrelated computations

```tsx
// Functional setState — stable callback, no stale closures
const addItems = useCallback((newItems: Item[]) => {
  setItems((curr) => [...curr, ...newItems]);
}, []);

// Lazy init
const [index, setIndex] = useState(() => buildSearchIndex(items));

// useDeferredValue for responsive filtering
const deferredQuery = useDeferredValue(query);
const filtered = useMemo(
  () => items.filter((i) => match(i, deferredQuery)),
  [items, deferredQuery],
);
```

---

## 4. Client-Side Data Fetching (MEDIUM)

- **Deduplicate global event listeners** — One listener shared across all component instances
- **Use passive event listeners for scroll/touch** — `{ passive: true }` for non-preventDefault listeners
- **Version and minimize localStorage** — Prefix keys with version, store only needed fields, always wrap in try-catch

```tsx
// Passive scroll listener
document.addEventListener('scroll', handler, { passive: true });

// localStorage with versioning
const VERSION = 'v2';
function savePrefs(prefs: { theme: string; lang: string }) {
  try {
    localStorage.setItem(`prefs:${VERSION}`, JSON.stringify(prefs));
  } catch {}
}
```

---

## 5. Rendering Performance (MEDIUM)

- **Hoist static JSX outside components** — Avoid recreating static elements every render
- **Use `content-visibility: auto` for long lists** — Browser skips layout/paint for off-screen items
- **Use ternary instead of `&&` for conditional rendering** — Prevents rendering `0` or `NaN`
- **Animate SVG wrapper, not SVG element** — GPU acceleration via wrapper div
- **Use CSS classes over inline styles** — Cached by browser, better separation

```tsx
// Hoist static JSX
const loadingSkeleton = <div className="animate-pulse h-20 bg-gray-200" />;

// Ternary, not &&
{
  count > 0 ? <Badge count={count} /> : null;
}
```

---

## 6. JavaScript Performance (LOW-MEDIUM)

- **Build index Maps for repeated lookups** — O(n) → O(1) for repeated `.find()` calls
- **Cache property access in loops** — Extract `arr.length` and nested properties before loop
- **Combine multiple filter/map into one loop** — Avoid multiple iterations
- **Use Set/Map for O(1) membership checks** — `set.has(x)` instead of `array.includes(x)`
- **Use `toSorted()` instead of `sort()`** — Immutable, prevents React state mutation bugs
- **Use `flatMap` to map and filter in one pass** — Avoid intermediate arrays
- **Use loop for min/max instead of sort** — O(n) vs O(n log n)
- **Hoist RegExp creation outside render/loops** — Avoid recreation every render
- **Early return from functions** — Exit loop/function as soon as result is known
- **Cache repeated function results** — Module-level Map for expensive computations

```tsx
// Build Map for O(1) lookups
const userById = new Map(users.map((u) => [u.id, u]));
const user = userById.get(order.userId);

// flatMap: map + filter in one pass
const names = users.flatMap((u) => (u.isActive ? [u.name] : []));

// Immutable sort
const sorted = items.toSorted((a, b) => a.value - b.value);
```
