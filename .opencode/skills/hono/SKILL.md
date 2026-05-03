---
name: hono
description: Use when building Hono web applications or when the user asks about Hono APIs, routing, middleware, validation, or testing. TRIGGER when code imports from 'hono' or 'hono/*', or user mentions Hono.
---

# Hono Skill — Backend API Patterns

This project uses Hono as a pure API backend (Node.js via `@hono/node-server`), not for JSX rendering. Frontend is React + Vite.

## App Setup (this project's pattern)

```ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';

const app = new Hono();

app.use(
  '/api/*',
  cors({
    origin: ['http://localhost:5173'],
    credentials: true,
  }),
);

app.route('/api/auth', authRoutes);
app.route('/api/users', usersRoutes);

serve({ fetch: app.fetch, port: 3001 });
```

## Routing

```ts
// Path parameters
app.get('/user/:name', (c) => {
  const name = c.req.param('name');
  return c.json({ name });
});

// Optional parameters
app.get('/api/animal/:type?', (c) => c.text('Animal!'));

// Route grouping (preferred for organizing)
const api = new Hono();
api.get('/users', (c) => c.json([]));
app.route('/api', api); // mounts at /api/users
```

## Context (c) — Response Methods

```ts
c.json({ message: 'Hello' }); // application/json
c.json({ error: 'Bad Request' }, 400); // with status
c.text('Hello'); // text/plain
c.html('<h1>Hello</h1>'); // text/html
c.redirect('/new-path'); // 302
c.redirect('/new-path', 301); // 301
c.notFound(); // 404
c.status(201);
c.header('X-Custom', 'value');
```

## Context Variables (request-scoped state)

Use `c.set()`/`c.get()` to pass data between middleware and handlers:

```ts
// Middleware sets variable
app.use(async (c, next) => {
  const session = await getSession(c.req.header('X-Session-Id'));
  c.set('session', session);
  await next();
});

// Handler reads variable
app.get('/api/me', (c) => {
  const session = c.get('session');
  return c.json(session);
});
```

## Request Parsing

```ts
c.req.param('id'); // path parameter
c.req.query('page'); // query string: ?page=1
c.req.header('Authorization'); // request header
c.req.method; // HTTP method

// Body parsing
await c.req.json(); // JSON body
await c.req.text(); // text body
await c.req.parseBody(); // multipart/form-data or urlencoded
```

## Middleware

```ts
import { logger } from 'hono/logger';
import { bodyLimit } from 'hono/body-limit';

app.use(logger()); // all routes
app.use('/api/*', bodyLimit({ maxSize: 10 * 1024 * 1024 }));

// Custom middleware with createMiddleware
import { createMiddleware } from 'hono/factory';

const auth = createMiddleware(async (c, next) => {
  const token = c.req.header('Authorization');
  if (!token) return c.json({ error: 'Unauthorized' }, 401);
  await next();
});

app.use('/api/*', auth);
```

Middleware executes in registration order. `await next()` calls the next layer; code after `next()` runs on the way back.

## Validation with Zod

```ts
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

const schema = z.object({
  title: z.string().min(1),
  body: z.string(),
});

app.post('/posts', zValidator('json', schema), (c) => {
  const data = c.req.valid('json'); // fully typed
  return c.json(data, 201);
});
```

## Error Handling

```ts
app.notFound((c) => c.json({ message: 'Not Found', path: c.req.path }, 404));

app.onError((err, c) => {
  console.error(`${c.req.method} ${c.req.path}:`, err);
  return c.json({ message: 'Internal Server Error' }, 500);
});
```

## Best Practices

- Use `app.route()` to organize by feature, not Rails-style controllers
- Use `c.set()`/`c.get()` for request-scoped data between middleware and handlers
- Write handlers inline for proper type inference of path params
- Export route modules as `new Hono()` and mount with `app.route('/prefix', module)`
- For this project: backend is API-only, no Hono JSX — frontend uses React + Vite
