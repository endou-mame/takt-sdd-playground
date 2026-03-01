import { test, expect } from "@playwright/test";

const API_BASE = "http://localhost:8787";

test.describe("認証フロー", () => {
  test.describe("会員登録フォームバリデーション", () => {
    test("パスワードが8文字未満の場合エラーメッセージを表示する", async ({
      page,
    }) => {
      await page.goto("/auth/register");

      await page.getByLabel("メールアドレス").fill("test@example.com");
      await page.getByLabel("パスワード（8文字以上）").fill("short");
      await page.getByRole("button", { name: "登録する" }).click();

      await expect(
        page.getByText("パスワードは8文字以上で入力してください")
      ).toBeVisible();
    });

    test("無効なメールアドレス形式の場合エラーメッセージを表示する", async ({
      page,
    }) => {
      await page.route(`${API_BASE}/auth/register`, (route) =>
        route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            error: {
              code: "INVALID_EMAIL",
              message: "メールアドレスの形式が正しくありません",
            },
          }),
        })
      );

      await page.goto("/auth/register");

      await page.getByLabel("メールアドレス").fill("invalid-email");
      await page.getByLabel("パスワード（8文字以上）").fill("validpass123");
      await page.getByRole("button", { name: "登録する" }).click();

      await expect(
        page.getByText("メールアドレスの形式が正しくありません")
      ).toBeVisible();
    });
  });

  test.describe("会員登録→ログインフロー", () => {
    test("登録成功後にログインページへ遷移できる", async ({ page }) => {
      await page.route(`${API_BASE}/auth/register`, (route) =>
        route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ userId: "user-001" }),
        })
      );

      await page.goto("/auth/register");

      await page.getByLabel("お名前").fill("テストユーザー");
      await page.getByLabel("メールアドレス").fill("newuser@example.com");
      await page
        .getByLabel("パスワード（8文字以上）")
        .fill("securepassword123");
      await page.getByRole("button", { name: "登録する" }).click();

      await expect(
        page.getByText(
          "登録が完了しました。確認メールをお送りしましたのでご確認ください。"
        )
      ).toBeVisible();
    });

    test("ログイン成功後にトップページへ遷移する", async ({ page }) => {
      const makeTestJwt = (sub: string, role: string) => {
        const payload = btoa(JSON.stringify({ sub, role, iat: 0, exp: 9999999999 }));
        return `header.${payload}.sig`;
      };

      await page.route(`${API_BASE}/auth/login`, (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            accessToken: makeTestJwt("user-001", "CUSTOMER"),
            refreshToken: "test-refresh-token",
          }),
        })
      );
      await page.route(`${API_BASE}/products*`, (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ products: [], total: 0, page: 1, limit: 20 }),
        })
      );
      await page.route(`${API_BASE}/categories`, (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ categories: [] }),
        })
      );

      await page.goto("/auth/login");

      await page.getByLabel("メールアドレス").fill("user@example.com");
      await page.getByLabel("パスワード").fill("password123");
      await page.getByRole("button", { name: "ログイン" }).click();

      await expect(page).toHaveURL("/");
    });
  });

  test.describe("ログイン失敗", () => {
    test("認証情報が誤っている場合エラーメッセージをrole=alertで表示する", async ({
      page,
    }) => {
      await page.route(`${API_BASE}/auth/login`, (route) =>
        route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({
            error: {
              code: "INVALID_CREDENTIALS",
              message: "メールアドレスまたはパスワードが正しくありません",
            },
          }),
        })
      );

      await page.goto("/auth/login");

      await page.getByLabel("メールアドレス").fill("user@example.com");
      await page.getByLabel("パスワード").fill("wrongpassword");
      await page.getByRole("button", { name: "ログイン" }).click();

      await expect(page.getByRole("alert")).toBeVisible();
      await expect(
        page.getByText(
          "メールアドレスまたはパスワードが正しくありません"
        )
      ).toBeVisible();
    });

    test("アカウントロック時にロックエラーメッセージを表示する", async ({
      page,
    }) => {
      await page.route(`${API_BASE}/auth/login`, (route) =>
        route.fulfill({
          status: 423,
          contentType: "application/json",
          body: JSON.stringify({
            error: {
              code: "ACCOUNT_LOCKED",
              message:
                "アカウントがロックされています。しばらく待ってから再試行してください",
            },
          }),
        })
      );

      await page.goto("/auth/login");

      await page.getByLabel("メールアドレス").fill("locked@example.com");
      await page.getByLabel("パスワード").fill("anypassword");
      await page.getByRole("button", { name: "ログイン" }).click();

      await expect(page.getByRole("alert")).toBeVisible();
      await expect(
        page.getByText(
          "アカウントがロックされています。しばらく待ってから再試行してください"
        )
      ).toBeVisible();
    });
  });

  test.describe("パスワードリセット", () => {
    test("リセットメール送信フォームが成功メッセージを表示する", async ({
      page,
    }) => {
      await page.route(`${API_BASE}/auth/password-reset`, (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({}),
        })
      );

      await page.goto("/auth/reset-password");

      await page
        .getByLabel("メールアドレス")
        .fill("user@example.com");
      await page
        .getByRole("button", { name: "リセットメールを送信" })
        .click();

      await expect(
        page.getByText(
          "パスワードリセットのメールをお送りしました。メールをご確認ください。"
        )
      ).toBeVisible();
    });

    test("トークン付きURLでパスワード変更フォームが表示される", async ({
      page,
    }) => {
      await page.goto("/auth/reset-password?token=valid-reset-token");

      await expect(
        page.getByLabel("新しいパスワード（8文字以上）")
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "パスワードを変更する" })
      ).toBeVisible();
    });
  });
});
