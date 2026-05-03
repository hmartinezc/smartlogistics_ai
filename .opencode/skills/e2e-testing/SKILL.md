---
name: e2e-testing
description: End-to-end testing setup and patterns using Playwright for full-stack TypeScript applications. Use when setting up E2E tests, writing browser tests for critical user flows, or debugging flaky tests.
license: MIT
metadata:
  author: smart-logistics
  version: '1.0.0'
---

# E2E Testing

End-to-end testing for full-stack TypeScript applications using Playwright.

## When to Use E2E Tests

E2E tests are for critical user flows that span multiple layers (frontend → API → database). They are slower and more brittle than unit/integration tests, so use them sparingly for:

- User authentication flows (login, logout, session expiry)
- Invoice upload and AI extraction workflow
- Data review and editing flows
- Export/download functionality
- Multi-step business processes

Do NOT use E2E tests for:

- Individual component behavior (use Vitest + React Testing Library)
- API endpoint testing in isolation (use Vitest + Hono test helpers)
- Edge case coverage (unit tests are better for this)

## Setup

### Install Playwright

```bash
npm install -D @playwright/test
npx playwright install
```

### Configuration File: `playwright.config.ts`

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
});
```

## Test Patterns

### Page Object Model

Encapsulate page selectors and actions in page objects:

```typescript
// e2e/pages/LoginPage.ts
import { Page } from '@playwright/test';

export class LoginPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/login');
  }

  async login(email: string, password: string) {
    await this.page.fill('[data-testid="email-input"]', email);
    await this.page.fill('[data-testid="password-input"]', password);
    await this.page.click('[data-testid="login-button"]');
  }

  async getErrorMessage() {
    return this.page.textContent('[data-testid="error-message"]');
  }
}
```

### Test Structure

```typescript
// e2e/flows/auth.spec.ts
import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';

test.describe('Authentication', () => {
  test('user can log in with valid credentials', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('admin@smart.com', '1234');

    await expect(page).toHaveURL('/dashboard');
  });

  test('shows error with invalid credentials', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('wrong@email.com', 'wrong');

    const error = await loginPage.getErrorMessage();
    expect(error).toContain('Invalid credentials');
  });
});
```

### Testing API-Dependent Flows

For flows that depend on the backend API, wait for network responses:

```typescript
test('invoice extraction shows results', async ({ page }) => {
  // Start waiting for the API response before triggering the action
  const responsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/ai/extract') && resp.status() === 200,
  );

  await page.setInputFiles('[data-testid="file-input"]', 'tests/fixtures/sample-invoice.pdf');
  await page.click('[data-testid="extract-button"]');

  const response = await responsePromise;
  const data = await response.json();
  expect(data).toHaveProperty('invoiceData');
});
```

### Fixtures and Test Data

```typescript
// e2e/fixtures.ts
import { test as base } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';

export const test = base.extend<{ authenticatedPage: void }>({
  authenticatedPage: [
    async ({ page }, use) => {
      const loginPage = new LoginPage(page);
      await loginPage.goto();
      await loginPage.login('admin@smart.com', '1234');
      await page.waitForURL('/dashboard');
      await use();
    },
    { auto: true },
  ],
});
```

## Critical Flows to Test in This Project

1. **Invoice Upload → AI Extraction → Review → Save**
   - Upload a PDF invoice
   - Verify extraction starts and shows progress
   - Verify extracted data appears in review table
   - Edit a field and verify persistence
   - Verify export/download works

2. **Authentication Flow**
   - Login with valid credentials
   - Login with invalid credentials (error shown)
   - Session persistence across page reloads
   - Logout clears session

3. **Agent Selection**
   - Switch between TCBV and Generic A agents
   - Verify the correct agent is used for extraction
   - Verify agent-specific fields appear

## Running Tests

```bash
# All E2E tests
npx playwright test

# Specific file
npx playwright test e2e/flows/auth.spec.ts

# With UI mode (debugging)
npx playwright test --ui

# Headed mode (see browser)
npx playwright test --headed
```

## Best Practices

- Use `data-testid` attributes for selectors, not CSS classes or text content.
- Tests should be independent — each test sets up its own state.
- Use Playwright's auto-waiting — never use `page.waitForTimeout()` as a workaround.
- Keep E2E tests focused on happy paths and one or two error paths.
- Run E2E tests in CI only on critical flows — full suite can be slow.
