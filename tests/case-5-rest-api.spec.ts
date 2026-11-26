import { test, expect } from '@playwright/test';

test('Case 5: GET /users logs names and emails', async ({ request }) => {
  const response = await request.get('/users');
  expect(response.status()).toBe(200);

  const users: { name: string; email: string }[] = await response.json();

  for (const user of users) {
    console.log(`${user.name} | ${user.email}`);
  }

  expect(users[0].email).toContain('@');
});
