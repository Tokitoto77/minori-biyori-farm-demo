# 実運用化への引き継ぎ

現在のコードは販売デモです。次の作業を完了するまで実予約を受け付けてはいけません。

## フェーズBの必須項目

1. Vercel Functionsとproduction Repository adapter
2. Firebase Admin SDKとFirestore Transaction
3. Firebase Authenticationによる管理者ログイン
4. `admins/{uid}`のサーバー側権限確認
5. Zod入力検証、サイズ制限、ハニーポット
6. HMAC化IP・メールを使うFirestore永続レート制限
7. EmailJS Node SDKと4種類の通知テンプレート
8. 通知ジョブのlease、再試行、Vercel Cron
9. Firestore Rulesのクライアント直接読み書き拒否
10. 個人情報保持期間、TTL、削除手順

## 切り替え条件

- `VITE_APP_MODE=production`を設定する前にproduction adapterの契約テストを通す。
- 秘密情報はVercel環境変数だけへ保存し、`VITE_`接頭辞を付けない。
- `/api/*`をSPAフォールバックより優先する。
- ステージング環境で予約、キャンセル、待機昇格、中止、通知再送を確認する。
- Codexレビューを `ok: true` まで通す。

フェーズBの詳細仕様は `plans/minori-biyori-farm-demo.md` を参照してください。
