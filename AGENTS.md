# Project agent instructions

- 新規企画、計画、実装、検証、公開では `/Users/amantomomi/.codex/skills/ai-vibe-project-orchestrator/SKILL.md` を使い、大学講義知識と工程別スキルを自動選択する。
- 実装工程以降は `downstream-project-guard`、計画・主要工程・公開前は `codex-review` の適用要否を必ず判定する。
- 詳細設計、実装、デバッグ、テスト、性能確認、リリース、導入、検収、仕様変更、新技術採用を行う際は、`skills/downstream-project-guard/SKILL.md` を読み、リスク強度と品質ゲートを定義する。
- 事実は「確認済み / 未確認 / 対象外」に分け、次の品質ゲートと必要な証拠を進捗報告へ含める。
- 既存のプロジェクト指示やユーザー指示と競合する場合は、既存指示を優先し、適用できなかった差分を報告する。
