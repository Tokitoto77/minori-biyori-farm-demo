/**
 * Firebaseクライアント初期化はフェーズBで管理者認証だけに限定して実装する。
 * フェーズAのデモ画面からこのモジュールを参照してはならない。
 */
export const firebaseClientStatus = 'not-configured' as const;
