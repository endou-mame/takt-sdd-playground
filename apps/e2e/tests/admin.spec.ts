import { test, expect } from "@playwright/test";

const API_BASE = "http://localhost:8787";

const MOCK_CATEGORIES = [{ categoryId: "cat-001", name: "テストカテゴリ" }];

const MOCK_PRODUCT = {
  productId: "prod-001",
  name: "テスト商品A",
  description: "テスト商品の説明",
  price: 1000,
  stockQuantity: 10,
  stockStatus: "IN_STOCK",
  isPublished: true,
  categoryId: "cat-001",
  imageUrls: [],
};

const MOCK_ORDER = {
  orderId: "order-001",
  customerId: "user-001",
  orderedAt: new Date().toISOString(),
  status: "PAID",
  paymentMethod: "CREDIT_CARD",
  subtotal: 1000,
  shippingFee: 500,
  total: 1500,
  items: [
    {
      productId: "prod-001",
      productName: "テスト商品A",
      unitPrice: 1000,
      quantity: 1,
    },
  ],
  shippingAddress: {
    name: "テスト 太郎",
    postalCode: "100-0001",
    prefecture: "東京都",
    city: "千代田区",
    street: "1-1-1",
    phone: "03-1234-5678",
  },
};

function setupAdminSession(
  page: import("@playwright/test").Page
): Promise<void> {
  return page.evaluate(() => {
    localStorage.setItem("auth_access_token", "admin-access-token");
    localStorage.setItem("auth_refresh_token", "admin-refresh-token");
  });
}

function setupAdminAuthMock(page: import("@playwright/test").Page): void {
  page.route(`${API_BASE}/auth/me`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        userId: "admin-001",
        email: "admin@example.com",
        role: "ADMIN",
      }),
    })
  );
}

test.describe("管理者フロー", () => {
  test.describe("アクセス制御", () => {
    test("未認証ユーザーが管理者ページにアクセスするとログインページへリダイレクトされる", async ({
      page,
    }) => {
      await page.goto("/admin/products");

      await expect(page).toHaveURL("/auth/login");
    });
  });

  test.describe("商品管理", () => {
    test.beforeEach(async ({ page }) => {
      setupAdminAuthMock(page);
      page.route(`${API_BASE}/admin/categories`, (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ categories: MOCK_CATEGORIES }),
        })
      );
    });

    test("商品登録フォームのバリデーション: 商品名が空の場合にエラーが出る", async ({
      page,
    }) => {
      page.route(`${API_BASE}/admin/products`, (route) => {
        if (route.request().method() === "POST") {
          return route.fulfill({
            status: 400,
            contentType: "application/json",
            body: JSON.stringify({
              error: {
                code: "VALIDATION_ERROR",
                message: "入力値が不正です。各項目を確認してください",
                fields: ["name"],
              },
            }),
          });
        }
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ products: [], total: 0, page: 1, limit: 20 }),
        });
      });

      await page.goto("/");
      await setupAdminSession(page);
      await page.goto("/admin/products/new");

      await page.getByLabel("説明（必須）").fill("テスト商品の説明");
      await page.getByLabel("価格（円）").fill("1000");
      await page.getByRole("button", { name: "登録する" }).click();

      await expect(
        page.getByText("入力値が不正です。各項目を確認してください")
      ).toBeVisible();
    });

    test("商品登録フォームに入力して登録できる", async ({ page }) => {
      page.route(`${API_BASE}/admin/products`, (route) => {
        if (route.request().method() === "POST") {
          return route.fulfill({
            status: 201,
            contentType: "application/json",
            body: JSON.stringify({ productId: "prod-new-001" }),
          });
        }
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            products: [MOCK_PRODUCT],
            total: 1,
            page: 1,
            limit: 20,
          }),
        });
      });

      await page.goto("/");
      await setupAdminSession(page);
      await page.goto("/admin/products/new");

      await page.getByLabel("商品名（必須）").fill("新しいテスト商品");
      await page.getByLabel("説明（必須）").fill("新商品の説明文");
      await page.getByLabel("価格（円）").fill("1500");
      await page.getByLabel("在庫数").fill("5");
      await page.getByRole("button", { name: "登録する" }).click();

      await expect(page).toHaveURL("/admin/products");
    });
  });

  test.describe("在庫更新フロー", () => {
    test("商品一覧から在庫更新できる", async ({ page }) => {
      page.route(`${API_BASE}/admin/products`, (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            products: [MOCK_PRODUCT],
            total: 1,
            page: 1,
            limit: 20,
          }),
        })
      );
      page.route(`${API_BASE}/admin/products/prod-001/stock`, (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ stockQuantity: 20 }),
        })
      );
      page.route(`${API_BASE}/admin/products/prod-001`, (route) => {
        if (route.request().method() === "GET") {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ ...MOCK_PRODUCT, stockQuantity: 20 }),
          });
        }
        return route.continue();
      });

      await page.goto("/");
      await setupAdminSession(page);
      await page.goto("/admin/products");

      await expect(page.getByText("テスト商品A")).toBeVisible();
    });
  });

  test.describe("注文ステータス管理", () => {
    test("注文詳細ページで発送済みボタンが表示される（PAIDステータス時）", async ({
      page,
    }) => {
      page.route(`${API_BASE}/admin/orders/order-001`, (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_ORDER),
        })
      );

      await page.goto("/");
      await setupAdminSession(page);
      await page.goto("/admin/orders/order-001");

      await expect(
        page.getByRole("button", { name: "発送済みにする" })
      ).toBeVisible();
    });

    test("発送済みボタンクリックでステータスが更新される", async ({ page }) => {
      let callCount = 0;
      const shippedOrder = { ...MOCK_ORDER, status: "SHIPPED" };

      page.route(`${API_BASE}/admin/orders/order-001`, (route) => {
        callCount++;
        const orderToReturn = callCount === 1 ? MOCK_ORDER : shippedOrder;
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(orderToReturn),
        });
      });
      page.route(
        `${API_BASE}/admin/orders/order-001/status`,
        (route) =>
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ status: "SHIPPED" }),
          })
      );

      await page.goto("/");
      await setupAdminSession(page);
      await page.goto("/admin/orders/order-001");

      await page.getByRole("button", { name: "発送済みにする" }).click();

      await expect(
        page.getByRole("button", { name: "完了にする" })
      ).toBeVisible();
      await expect(page.getByText("発送済み")).toBeVisible();
    });
  });
});
