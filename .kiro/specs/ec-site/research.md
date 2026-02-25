# 発見ログ: ECサイト

## 調査サマリー

- **対象フィーチャー:** ec-site
- **既存コードベース:** なし（新規プロジェクト）
- **調査スコープ:** 完全な発見（外部調査含む）
- **調査日:** 2026-02-24

---

## 1. 既存コードベース調査

### プロジェクト構造

| パス | 内容 |
|------|------|
| `package.json` | takt スクリプト定義のみ。アプリケーションコードなし |
| `node_modules/` | takt CLI のみ |
| `references/` | okite-ai・takt のドキュメント参照用資材 |
| `.kiro/specs/ec-site/requirements.md` | EARS形式要件ドキュメント（444行、22要件） |

**結論:** 実装コードはゼロ。アーキテクチャ上の制約は requirements.md と技術スタック指定のみ。

---

## 2. 技術スタックの制約分析

### Cloudflare Workers

- **制約:** ステートレス。リクエストごとに独立したランタイム
- **CPU時間制限:** 50ms（無料）/ 30秒（有料 Workers Unbound）
- **メモリ:** 128MB
- **影響:** DB接続はD1（HTTP API経由）。TCP直接接続不可

### Cloudflare D1

- **特性:** SQLite互換。ACID保証あり
- **制約:** Write は同一リージョン。Read はエッジにレプリケート
- **用途:** イベントストア + 読み取りモデル（CQRS Read Side）
- **楽観的ロック:** `UNIQUE(aggregate_id, version)` 制約で実現可能
- **フルテキスト検索:** SQLite FTS5 使用可能。ただし D1 での利用可否は要確認 → **代替: `LIKE '%keyword%'` を使用**

### Cloudflare Durable Objects

- **特性:** グローバルで唯一のインスタンス。強一貫性
- **用途:** カート（ユーザー/セッションごとの強一貫性が必要）
- **注意:** 物理ロケーションによりレイテンシが変動しうる（要件21で500ms制約）

### Cloudflare R2

- **特性:** S3互換オブジェクトストレージ
- **用途:** 商品画像の保存
- **制約:** オブジェクトキーは最大1024バイト

### Hono

- **特性:** Cloudflare Workers 対応の軽量HTTPフレームワーク
- **バリデーション:** Zod v4 との組み合わせで型安全なリクエスト検証が可能

### Drizzle ORM

- **D1対応:** `drizzle-orm/d1` アダプタあり
- **マイグレーション:** `drizzle-kit` で管理

### Zod v4

- **変更点（v4）:** `z.string().email()` 等の挙動は v3 と互換あり。`z.object()` のストリクトモードが変更
- **全層適用:** リクエスト・ドメイン・レスポンスすべてに適用

---

## 3. アーキテクチャパターン評価

### Event Sourcing on Cloudflare

| 選択肢 | 評価 |
|--------|------|
| D1 をイベントストアとして使用 | **採用**。UNIQUE(aggregate_id, version) で楽観的ロック。ACID保証あり |
| Durable Object をイベントストアとして使用 | 複雑すぎる。レプリケーション管理が困難 |
| KV をイベントストアとして使用 | 結果整合性のみ。楽観的ロック不可 → 不適 |

### CQRS 投影戦略

| 選択肢 | 評価 |
|--------|------|
| 同期投影（コマンド後即時） | **採用**。シンプル。要件22.3（1秒以内更新）を確実に満たす |
| Cloudflare Queue 経由の非同期投影 | 結果整合性。1秒保証が難しい。追加インフラ必要 |

### カート実装

| 選択肢 | 評価 |
|--------|------|
| Durable Object（ユーザー/セッションごと） | **採用**。強一貫性。同時並行書き込みを自然に排除 |
| D1 に保存 | 並行書き込み制御が複雑。セッション管理も必要 |

### 決済プロバイダー

- 要件6は外部決済プロバイダーを抽象化して定義
- **推奨:** Stripe（Workers環境での実績多数）
- 設計レベルでは `PaymentGateway` インターフェースで抽象化

### メール送信

- **選択肢:** Cloudflare Email Workers / Resend / SendGrid（Workers経由）
- 設計レベルでは `EmailService` インターフェースで抽象化
- 要件7.1（5分以内）・7.3（30分間隔3回リトライ）は Workers の `waitUntil()` で対応可能

---

## 4. 統合ポイント

| 統合 | 手段 | 備考 |
|------|------|------|
| D1 ← Drizzle | `drizzle-orm/d1` アダプタ | Workers Bindings 経由 |
| R2 ← Workers | `env.BUCKET.put()` / `.get()` | Workers Bindings 経由 |
| Durable Objects ← Workers | `env.CART_DO.get(id)` stub | Workers Bindings 経由 |
| 外部決済 ← Workers | `fetch()` | Stripe API |
| 外部メール ← Workers | `fetch()` | Resend / SendGrid API |

---

## 5. リスク評価

| リスク | 影響 | 対策 |
|--------|------|------|
| D1 書き込みレイテンシ | 商品一覧500ms制約（要件21.1）に影響 | 読み取りモデル分離（CQRS）で軽減 |
| D1 LIKE 検索のパフォーマンス | 商品数が増えると劣化 | インデックス追加（`name`・`description` カラム）。FTS5 移行は将来検討 |
| Durable Object 位置 | カートレイテンシが地理的に変動 | ユーザーの地理的な近いリージョンに自動配置（Cloudflare の仕組みに依存） |
| カードトークン漏洩 | セキュリティ違反（要件20.2・6.7） | カード番号・CVVは Workers メモリ内でのみ処理。D1・R2・ログに記録しない |
| セッションID管理 | 未認証カートのセッション追跡 | Cookie + HttpOnly + SameSite=Strict で管理 |
| bcrypt on Workers | CPU時間制限（50ms）を超える可能性 | `cost=12` は Unbound Workers（30秒）前提。または `argon2` / `scrypt` 検討 |

---

## 6. 設計レビューによる追加発見（v2）

### 問題1: Workers のステートレス制約とメール再送

- **コンテキスト:** 要件7.3（30分間隔で最大3回再送）の実装手段の不足
- **参照元:** Cloudflare Workers ドキュメント（CPU時間制限・stateless制約）、Cloudflare Queues ドキュメント
- **発見:** Workers は HTTP リクエストごとに終了するため、30分後の実行スケジュールを自身で保持できない。Cloudflare Queues の `delaySeconds` パラメータ（最大12時間遅延）を使えば、30分後のメッセージ再配信が実現可能
- **影響:** 境界マップに Cloudflare Queues と EmailQueueConsumer を追加。EmailRetryRepository で試行回数を D1 に管理

### 問題2: コンビニ払い払込票番号の読み取りモデル欠落

- **コンテキスト:** 要件18.5（キャンセル時の払込票番号無効化）の実装経路の不足
- **参照元:** 設計の OrderEvent 定義、PaymentGateway.voidConvenienceStorePayment()
- **発見:** `ConvenienceStorePaymentIssued` イベントには `paymentCode` が含まれるが、読み取りモデルに保存していないと、CancelOrderCommand ハンドラーが `voidConvenienceStorePayment()` に渡す値を取得できない
- **影響:** `orders_rm` に `payment_code`・`payment_expires_at` カラムを追加。`OrderProjection` で当該イベントの投影処理を追加

### 問題3: ProductCommandHandlers の単一責任原則違反

- **コンテキスト:** 商品・在庫・カテゴリ・画像の4責務が一つのコンポーネントに集中していた
- **参照元:** 設計書 Architecture Knowledge（1インターフェース＝1責任）
- **発見:** カテゴリは独立したドメイン集約・リポジトリを持ち、画像は R2 という独立インフラを使用する。これらを同一コンポーネントに集約すると、将来の変更が Shotgun Surgery を引き起こす
- **影響:** ProductCommandHandlers / StockCommandHandlers / CategoryCommandHandlers / ImageCommandHandlers の4コンポーネントに分割

## 7. 要調査事項

| 項目 | 内容 | 優先度 |
|------|------|--------|
| bcrypt コスト係数 | Workers の CPU時間制限内で cost=12 が処理可能か計測 | 高 |
| D1 FTS5 | D1 上でSQLite FTS5 が使用可能かドキュメント確認 | 中 |
| Stripe Workers 対応 | Stripe Node.js SDK が Workers 環境で動作するか確認 | 高 |
| Cloudflare Queues delaySeconds | 30分遅延の Queue 再エンキューの実装パターン確認 | 高 |
| セッション管理 | 未認証カートのセッションID（Cookie vs JWT claim） | 中 |

---

## 9. validate-design 指摘への対応調査（v4）

### 問題1: UserCommandHandlers God Class → 3コンポーネントへ分割

- **コンテキスト:** validate-design で `UserCommandHandlers` が Register/Login/Logout/VerifyEmail/RefreshToken/RequestPasswordReset/ConfirmPasswordReset/AddAddress/UpdateAddress/DeleteAddress/AddToWishlist/RemoveFromWishlist の12コマンドを持つGod Classと指摘された
- **調査内容:** 各コマンドの責務境界を分析し、ドメイン境界に従った分割方針を決定
- **発見:** 認証/ID管理・住所帳・ウィッシュリストは変更理由が完全に独立している。認証フローの変更が住所ロジックのテストを壊す構造は不適切
- **対応:** `AuthCommandHandlers`（認証7コマンド）・`AddressCommandHandlers`（住所3コマンド）・`WishlistCommandHandlers`（ウィッシュリスト2コマンド）に分割。同様に `UserQueryHandlers` も `AddressQueryHandlers` / `WishlistQueryHandlers` / `CustomerQueryHandlers` に分割

### 問題2: UserRegistered ペイロード不整合 → B案（ハイブリッド）採用

- **コンテキスト:** `UserRegistered` イベントに `passwordHash` がなく、ProjectionService の「全カラム INSERT」が `users.password_hash NOT NULL` 制約に違反する
- **調査内容:** A案（passwordHash をイベントに含める）vs B案（UserRepository が users テーブルに直接書き込む）を比較
- **発見:**
  - A案: `passwordHash` がイミュータブルなイベントストアに永続化される。パスワード変更のたびに旧ハッシュが蓄積。問題3の「セキュリティトークンをイベントストアに含めない」原則と矛盾する
  - B案: `users` テーブルを `UserRepository.save()` で直接管理。イベントストアには「UserRegistered という事実」のみ記録。`EmailVerified` イベントによる `email_verified` フラグ更新のみ ProjectionService を経由
- **採用:** B案（ハイブリッド）。ProjectionService から `UserRegistered → users 全カラムINSERT` の行を削除

### 問題3: PasswordResetRequested にセキュリティトークンを含めない

- **コンテキスト:** `PasswordResetRequested` イベントに `token` と `expiresAt` が含まれており、要件22.4（イベントストアの不変性）によりトークンが永久に残存する
- **調査内容:** イベントストアのセキュリティ設計要件と、トークン管理の実装経路を確認
- **発見:** `password_reset_tokens` テーブルに同一トークンが既に保存される設計。イベントストアに同じトークンが2箇所存在し、イベントストアへのアクセス漏洩でトークン窃取リスクが生じる。`email_verification_tokens` との非対称性（こちらにはイベントにトークンなし）も確認
- **対応:** `PasswordResetRequested` イベントから `token` と `expiresAt` を削除。設計原則「セキュリティトークンはイベントストアに含めない」を明記

---

## 8. 要件23・24 の追加設計調査（v3）

### 要件23: メールアドレス確認

- **コンテキスト:** 要件8.1で確認メール送信は定義済み。要件23は確認リンクのクリック後（トークン検証）の処理を定義する
- **調査内容:** 既存設計における `email_verification_tokens` テーブルの欠落と `VerifyEmailCommand` の未定義を確認
- **発見1: テーブル欠落**
  - `password_reset_tokens` と完全に対称な構造が必要（`token`, `user_id`, `expires_at`, `used`）
  - 要件23.2（有効期限切れ → HTTP 410）・23.3（使用済み → HTTP 410）はテーブルの `expires_at` と `used` カラムで実現
- **発見2: Projection未定義**
  - `EmailVerified` ドメインイベントは既存設計に定義済みだが、`ProjectionService` テーブルに当該イベントの投影先（`users.email_verified = 1`）が欠落していた
  - `UserRegistered` イベントの投影（INSERT into `users`）も同様に未記載だったため追加
- **対応エラーコード:** `VERIFICATION_TOKEN_EXPIRED`（HTTP 410）・`VERIFICATION_TOKEN_USED`（HTTP 410）
  - `password_reset_tokens` の `RESET_TOKEN_EXPIRED` / `RESET_TOKEN_USED` と並列構造

### 要件24: ログアウト

- **コンテキスト:** 要件9.4（リフレッシュトークン更新）の逆操作。`refresh_tokens.invalidated = 1` に設定するだけ
- **調査内容:** ディレクトリ構造コメントには `Logout` が既に記載されていたが、コンポーネント説明と要件トレーサビリティ表に反映されていなかった
- **発見: ドメインイベント不要**
  - ログアウトは `User` 集約の状態を変更しない（`emailVerified`・`failedLoginAttempts` 等は不変）
  - `refresh_tokens` テーブルの `invalidated` フラグ更新はインフラ層の単純な書き込みであり、Event Sourcing の対象外
  - よって `UserEvent` への `LoggedOut` 追加は不要。`UserRepository`（または `UserCommandHandlers` 内で直接）が `refresh_tokens` テーブルを更新する
- **既存インフラとの整合性:** `refresh_tokens` テーブルに `invalidated INTEGER NOT NULL DEFAULT 0` カラムが既に定義済み → 追加スキーマ変更なし
