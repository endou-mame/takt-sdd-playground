import { test, expect } from "@playwright/test";

const API_BASE = "http://localhost:8787";

const MOCK_PRODUCTS = [
  {
    productId: "prod-001",
    name: "テスト商品A",
    description: "テスト用の商品説明A",
    price: 1000,
    stockStatus: "IN_STOCK",
    categoryId: "cat-001",
    imageUrls: [],
  },
  {
    productId: "prod-002",
    name: "テスト商品B",
    description: "テスト用の商品説明B",
    price: 2000,
    stockStatus: "OUT_OF_STOCK",
    categoryId: "cat-001",
    imageUrls: [],
  },
];

const MOCK_PRODUCT_DETAIL = {
  productId: "prod-001",
  name: "テスト商品A",
  description: "テスト用の商品説明A",
  price: 1000,
  stockStatus: "IN_STOCK",
  stockQuantity: 10,
  categoryId: "cat-001",
  imageUrls: [],
};

const MOCK_CATEGORIES = [{ categoryId: "cat-001", name: "テストカテゴリ" }];

const MOCK_CART_ITEMS = [
  {
    productId: "prod-001",
    productName: "テスト商品A",
    unitPrice: 1000,
    quantity: 1,
  },
];

function setupProductMocks(page: import("@playwright/test").Page): void {
  page.route(`${API_BASE}/products*`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        products: MOCK_PRODUCTS,
        total: 2,
        page: 1,
        limit: 20,
      }),
    })
  );
  page.route(`${API_BASE}/categories`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ categories: MOCK_CATEGORIES }),
    })
  );
}

function setupAuthenticatedSession(
  page: import("@playwright/test").Page
): Promise<void> {
  return page.evaluate(() => {
    localStorage.setItem("auth_access_token", "test-access-token");
    localStorage.setItem("auth_refresh_token", "test-refresh-token");
  });
}

test.describe("購買フロー", () => {
  test.describe("商品一覧・絞り込み", () => {
    test.beforeEach(({ page }) => setupProductMocks(page));

    test("商品一覧ページが商品を表示する", async ({ page }) => {
      await page.goto("/");

      await expect(page.getByText("テスト商品A")).toBeVisible();
      await expect(page.getByText("テスト商品B")).toBeVisible();
    });

    test("在庫切れ商品に在庫切れバッジを表示する", async ({ page }) => {
      await page.goto("/");

      await expect(page.getByText("在庫切れ").first()).toBeVisible();
    });

    test("キーワード入力フォームが存在する", async ({ page }) => {
      await page.goto("/");

      await expect(page.getByLabel("キーワード")).toBeVisible();
      await expect(
        page.getByRole("button", { name: "絞り込む" })
      ).toBeVisible();
    });

    test("絞り込みフォームにキーワードを入力して送信できる", async ({
      page,
    }) => {
      await page.goto("/");

      await page.getByLabel("キーワード").fill("テスト商品A");
      await page.getByRole("button", { name: "絞り込む" }).click();

      await expect(page.getByLabel("キーワード")).toHaveValue("テスト商品A");
    });
  });

  test.describe("商品詳細ページ", () => {
    test.beforeEach(({ page }) => {
      page.route(`${API_BASE}/products/prod-001`, (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_PRODUCT_DETAIL),
        })
      );
    });

    test("商品詳細ページが在庫状況を表示する", async ({ page }) => {
      await page.goto("/products/prod-001");

      await expect(page.getByText("テスト商品A")).toBeVisible();
      await expect(page.getByText("¥1,000")).toBeVisible();
      await expect(page.getByText("在庫あり")).toBeVisible();
    });
  });

  test.describe("カート操作", () => {
    test("カートに商品を追加するとカートページに反映される", async ({
      page,
    }) => {
      await page.route(`${API_BASE}/products/prod-001`, (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_PRODUCT_DETAIL),
        })
      );
      await page.route(`${API_BASE}/cart`, (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ items: MOCK_CART_ITEMS }),
        })
      );
      await page.route(`${API_BASE}/cart/items`, (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ items: MOCK_CART_ITEMS }),
        })
      );

      await page.goto("/");
      await setupAuthenticatedSession(page);

      await page.goto("/products/prod-001");
      await page.goto("/cart");

      await expect(page.getByText("テスト商品A")).toBeVisible();
      await expect(page.getByText("¥1,000")).toBeVisible();
    });

    test("カートが空の場合は空メッセージを表示する", async ({ page }) => {
      await page.route(`${API_BASE}/cart`, (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ items: [] }),
        })
      );

      await page.goto("/");
      await setupAuthenticatedSession(page);
      await page.goto("/cart");

      await expect(page.getByText("カートは空です")).toBeVisible();
    });
  });

  test.describe("チェックアウト→注文確認フロー", () => {
    test("決済モック成功後に注文確認ページへ遷移する", async ({ page }) => {
      const orderId = "order-test-001";

      await page.route(`${API_BASE}/cart`, (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ items: MOCK_CART_ITEMS }),
        })
      );
      await page.route(`${API_BASE}/addresses`, (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ addresses: [] }),
        })
      );
      await page.route(`${API_BASE}/checkout`, (route) =>
        route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ orderId }),
        })
      );
      await page.route(`${API_BASE}/orders/${orderId}`, (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            orderId,
            orderedAt: new Date().toISOString(),
            status: "PAID",
            paymentMethod: "CREDIT_CARD",
            subtotal: 1000,
            shippingFee: 500,
            total: 1500,
            items: MOCK_CART_ITEMS,
            shippingAddress: {
              name: "テスト 太郎",
              postalCode: "100-0001",
              prefecture: "東京都",
              city: "千代田区",
              street: "1-1-1",
              phone: "03-1234-5678",
            },
          }),
        })
      );

      await page.goto("/");
      await setupAuthenticatedSession(page);
      await page.goto("/checkout");

      await page.getByLabel("氏名").fill("テスト 太郎");
      await page.getByLabel("電話番号").fill("03-1234-5678");
      await page.getByLabel("郵便番号").fill("100-0001");
      await page.getByLabel("都道府県").fill("東京都");
      await page.getByLabel("市区町村").fill("千代田区");
      await page.getByLabel("番地・建物").fill("1-1-1");

      await page.getByRole("radio", { name: "クレジットカード" }).check();
      await page.getByLabel("カード番号").fill("4111111111111111");
      await page.getByLabel("有効期限（MM/YY）").first().fill("12");
      await page.getByLabel("有効期限（MM/YY）").last().fill("28");
      await page.getByLabel("CVV").fill("123");
      await page.getByLabel("名義人").fill("TARO TEST");

      await page.getByRole("button", { name: "注文を確定する" }).click();

      await expect(page).toHaveURL(`/orders/${orderId}`);
    });
  });
});
