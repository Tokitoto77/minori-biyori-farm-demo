# みのり日和ファーム

観光農園・収穫体験向け予約アプリの販売デモです。農園側の開催枠作成から、利用者の予約、管理画面への反映までを、ブラウザ内のダミーデータだけで一続きに試せます。

> 現在はフェーズA（販売デモ）です。Firebase、Vercel Functions、EmailJSへ接続せず、実在する個人情報を扱いません。実運用化はフェーズBの対象です。

## できること

### 利用者

- 月間カレンダーから開催日、時間、残席、受付状態を確認
- 大人・子ども・幼児の人数と料金をリアルタイム計算
- 代表者入力、確認、完了の3ステップ予約
- 残席不足時のキャンセル待ち
- 予約番号とデモ用メールアドレスによる照会・キャンセル
- 予約受付・キャンセルのメール内容プレビュー

### デモ管理者

- 既存3プランから単日または毎週（最大12枠）の開催枠を作成
- 下書き保存と公開、既存枠の編集・複製・削除
- 本日または直近の予約人数、残席、待機数、通知失敗を確認
- 開催枠の定員変更、受付停止・再開、開催中止
- 電話予約の登録
- 予約者・待機者の確認と手動繰り上げ
- 通知履歴、失敗サンプルの再送
- 操作履歴の確認
- デモデータの初期化

## デモの個人情報保護

フォームへ入力した氏名、電話番号、メールアドレスは送信時に破棄します。`localStorage`へ保存する前に、必ず次の固定値へ置き換えます。

```text
氏名: デモ利用者
電話番号: 000-0000-0000
メール: demo@example.invalid
```

予約照会では、完了画面に表示された予約番号と `demo@example.invalid` を使用します。初期データの確認用予約番号は `MB-DEMO-7K3P` です。

## 起動方法

必要環境は Node.js 22.12以上です。

```bash
npm install
cp .env.example .env.local
npm run dev
```

ブラウザで `http://localhost:3000` を開きます。デモモードは既定値ですが、`.env.local`へ次を指定できます。

```dotenv
VITE_APP_MODE="demo"
```

## 品質確認

```bash
npm run lint
npm test
npm run build
npm audit --omit=dev
```

確認済み項目:

- TypeScript型検査
- 業務ルール・個人情報非保存・公開制御・状態遷移を含む自動テスト27件
- Vite本番ビルド
- 予約作成、照会、キャンセル、電話予約、通知再送、デモ初期化の既存テスト

イベント作成UIは390px / 1280pxで、一覧、3ステップ入力、確認・完了、公開予約フローの横ずれがないことを確認済みです。詳細は[品質ゲート記録](docs/phase-a-quality-gate.md)に記録しています。

## 構成

```text
src/
├── app/createServices.ts       # 動作モード判定と依存注入
├── domain/                     # 共通型、定員・料金・状態規則
├── repositories/contracts.ts  # 画面とデータ層の契約
├── demo/                       # seed、localStorage、デモRepository
├── components/                 # 共通UI、利用者レイアウト
├── pages/                      # 利用者予約・照会・管理画面
└── App.tsx                     # ハッシュルーティング
```

UIから `localStorage`、Firebase、EmailJSを直接参照しません。`src/app/createServices.ts` だけが `VITE_APP_MODE` を判定し、同じRepository契約を画面へ渡します。

## 生成画像

`imagegen`で本プロジェクト専用に生成した写真を `public/images/` に保存しています。

- `strawberry-field.jpg`
- `blueberry-basket.jpg`
- `herb-garden.jpg`

いずれも文字・ロゴ・透かしを含まないオリジナル生成素材です。

## 関連文書

- [管理者マニュアル](docs/admin_manual.md)
- [アーキテクチャ](docs/architecture.md)
- [フェーズAのSOW](docs/phase-a-sow.md)
- [実運用化への引き継ぎ](docs/production-handoff.md)
- [品質ゲート記録](docs/phase-a-quality-gate.md)
- [状態遷移・決定表](docs/state-transition-matrix.md)
- [承認済み計画書](plans/minori-biyori-farm-demo.md)

## 重要な制限

- データは同じブラウザ内だけに保存されます。
- デモリセットやブラウザデータ削除で内容は消えます。
- 外部メールは送信しません。
- 管理画面に本物の認証・権限管理はありません。
- 本番公開して実予約を受け付ける用途には使用できません。
