import { expect, test } from "@playwright/test";

test("signed-out visitors are routed to login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator("h1")).toBeVisible();
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
});

test("registration and password recovery pages render", async ({ page }) => {
  await page.goto("/register");
  await expect(page.locator("h1")).toBeVisible();
  await expect(page.locator("input")).toHaveCount(3);

  await page.goto("/forgot-password");
  await expect(page.locator("h1")).toBeVisible();
  await expect(page.locator('input[type="email"]')).toBeVisible();
});

test("billing stays behind authentication", async ({ page }) => {
  await page.goto("/billing");
  await expect(page).toHaveURL(/\/login$/);
});

test("private APIs reject signed-out requests", async ({ request }) => {
  const responses = [
    await request.put("/api/business-config", { data: {} }),
    await request.post("/api/inbox", { data: {} }),
    await request.get("/api/usage"),
  ];

  for (const response of responses) {
    expect(response.status(), response.url()).toBe(401);
  }
});

test("conversation history requires a signed widget request", async ({ request }) => {
  const response = await request.get(
    "/api/conversation/analyze?companyId=default_company&sessionId=untrusted",
  );
  expect(response.status()).toBe(403);
});
