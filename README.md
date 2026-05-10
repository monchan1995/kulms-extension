# KULMS+（本リポジトリはフォーク）

[本家 KULMS+](https://github.com/Radian0523/kulms-extension)（Radian0523 氏）をベースとした改良版です。詳細な全体仕様・汎用機能の説明は [本家 README](https://github.com/Radian0523/kulms-extension/blob/main/README.md) および **[ランディングページ](https://radian0523.github.io/kulms-extension/)** を参照してください。

**[Chrome Web Store（本家ビルド）](https://chromewebstore.google.com/detail/kulms+/akfadmompgbhncnocomalofhcihpejjb)** … ストア版は本家の配布物であり、本フォークの差分は含まれません。

---

## 本家との差分

- **授業資料（リソース）一覧**  
  フォルダ開閉を **ページ遷移なし（fetch + DOM 差し替え）** で行う挙動の改善・拡張（トグルと行レイアウト、実ファイルへのリンクは維持）。
- **並び順** … 展開後に **パスに沿ったツリー順**へ再整列。同一階層では **ファイル行をフォルダ行より前**、ルート直下では **ファイルブロックをフォルダブロックより前**。
- **視覚** … 階層に応じた **行頭インデント**、展開時の **行の段階表示（ドミノ／スタッガー）**、`prefers-reduced-motion: reduce` ではアニメーション抑制。差分が出た行だけにアニメーションを当てる調整あり。
- **一括操作** … チェック列・ツールバーによる **選択ダウンロード / 新規のみ DL**、**既読**（行内ボタン・ツールバー、ストレージ永続）。フォルダ行のチェックで **配下ファイルの一括選択**。
- **テーブルまわり** … `resourcesList` の Bootstrap ストライプ廃止、列幅・「全選択」ラベル、既読列・チェック列の配置整理など UI 調整。
- **サイト内ダークモード** … ハンバーガーパネル／トップバーのドロップダウン／バルクツールバーなどを **Sakai の CSS 変数** に合わせて可読性調整。新着ハイライトの見え方調整（色系の変更を含む）。
- **設定** … `DEFAULT_SETTINGS` を本フォーク側の想定（現行の kulms-settings 相当）に更新。
- **Safari** … `safari/` に **Safari Web Extension 用の Xcode プロジェクト**を同梱（拡張リソースは `src/` 等と同期した構成）。

その他の機能（課題パネル、教科書、科目名整理、サイドバー等）は本家と共通です。変更履歴の細部は `git log` や [CHANGELOG.md](CHANGELOG.md) も参照してください。

---

## 主な機能（本フォークで手が入っている領域）

| 領域 | 内容 |
|------|------|
| 授業資料ツリー | SPA 的なフォルダ開閉、パス整列、インデント、開閉時の行アニメーション |
| 一括 DL・既読 | ツールバー・全選択、選択／新規のみ DL、既読マークとハイライト制御 |
| スタイル | ダークモード追随、バルク UI・新着表示の調整 |
| KULMS+ パネル | 上記リソース機能用の設定項目（`bulkDownload` など） |
| Safari | Xcode プロジェクトでビルド・サイドロード可能 |

---

## インストール方法（開発用・簡潔）

1. このリポジトリをクローン  
   `git clone https://github.com/monchan1995/kulms-extension.git`
2. **Chrome / Edge** … `chrome://extensions`（Edge は `edge://extensions`）でデベロッパーモードを有効にし、「パッケージ化されていない拡張機能を読み込む」でクローンしたフォルダを指定。
3. **Firefox** … `about:debugging#/runtime/this-firefox` から「一時的なアドオンを読み込む」でリポジトリ内の `manifest.json` を選択。  
   Firefox 向け ZIP が必要な場合は `./build.sh firefox`（要 `jq`）。
4. **Safari** … `safari/` の Xcode プロジェクトを開き、ご利用環境に合わせてビルド・有効化してください。

---

## ライセンス・帰属

- 本リポジトリは [MIT License](LICENSE)（Copyright (c) 2025 Radian0523）です。  
- [LICENSE](LICENSE) に記載のとおり、[Comfortable PandA](https://github.com/das08/ComfortablePandA) 由来部分（Apache-2.0）の帰属があります。  
- ベースプロジェクト: [Radian0523/kulms-extension](https://github.com/Radian0523/kulms-extension)

貢献フローや開発の注意点は [CONTRIBUTING.md](CONTRIBUTING.md)、技術メモは [DEVELOPMENT.md](DEVELOPMENT.md) を参照してください。
