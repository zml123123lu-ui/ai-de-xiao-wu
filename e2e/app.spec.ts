import { expect, test } from "@playwright/test";

const email = process.env.E2E_USER_EMAIL;
const password = process.env.E2E_USER_PASSWORD;

test("anonymous visitors only see the private login", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.goto("/today");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "回到我们的空间" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(consoleErrors).toEqual([]);
});

test("a configured member can open all three focused views", async ({ page }) => {
  test.skip(!email || !password, "Set E2E_USER_EMAIL and E2E_USER_PASSWORD to run authenticated flows");
  await page.goto("/login");
  await page.getByLabel("邮箱").fill(email!);
  await page.getByLabel("密码").fill(password!);
  await page.getByRole("button", { name: "进入爱的小屋" }).click();
  await expect(page.getByRole("heading", { name: "今天过得怎么样？" })).toBeVisible();
  await page.getByRole("link", { name: "问题" }).first().click();
  await expect(page.getByRole("heading", { name: "问题", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "信件" }).first().click();
  await expect(page.getByRole("heading", { name: "信件", exact: true })).toBeVisible();
});
