/**
 * note Time Ledger - DOM Parser Adapter
 *
 * ===================================================================
 *  note の DOM 構造に依存するセレクタは【すべてこのファイル】に集約。
 *  note 側の UI 変更で壊れた場合、このファイルだけを修正する。
 * ===================================================================
 *
 * 実際のページ: https://note.com/sitesettings/stats
 *
 * 2026-03-08 DevTools で確認した実DOM構造:
 *
 *   <table class="o-statsContent__table">
 *     <thead class="o-statsContent__thead">...</thead>
 *     <tbody>
 *       <tr>
 *         <td class="o-statsContent__tableTitle">
 *           <a class="o-statsContent__tableTitleLink a-link"
 *              href="/mizuoishii/n/n19d7ec8c1c95"
 *              target="_blank" rel="noopener">
 *             <span>[⭐⭐]ドバイというノード、弾けたバブル</span>
 *           </a>
 *         </td>
 *         <td class="... o-statsContent__tableStat--type_view"> 53 </td>
 *         <td class="... o-statsContent__tableStat--type_comment"> 0 </td>
 *         <td class="... o-statsContent__tableStat--type_suki"> 1 </td>
 *       </tr>
 *     </tbody>
 *   </table>
 *
 * 注意:
 *   - data-v-XXXXXXXX 属性は Vue.js のスコープ属性。ビルドごとに変わるため使用しない。
 *   - BEM命名の class は CSS設計の一部であり、比較的安定。これをセレクタに使う。
 *   - href は "/ユーザー名/n/記事ID" の形式。記事IDは /n/ の直後。
 *
 * セレクタ変更手順:
 *   1. note にログインし /sitesettings/stats を開く
 *   2. DevTools (F12) > Elements で記事テーブルの構造を確認
 *   3. 下記 SELECTORS の該当箇所を書き換える
 */

// @ts-check

/**
 * ============================================================
 *  セレクタ定義（2026-03-08 実DOM確認済み）
 * ============================================================
 *
 * 各セレクタの横に [VERIFIED] / [FRAGILE] を記載。
 * [VERIFIED] = DevToolsで実DOM確認済み
 * [FRAGILE]  = 将来的に変わりやすい部分
 */
const SELECTORS = {
  /**
   * [VERIFIED] 記事テーブル本体
   * BEM命名クラス。table タグ + クラスの二重指定で安全性を確保。
   */
  table: 'table.o-statsContent__table',

  /**
   * [VERIFIED] 記事テーブルの各行（tbody内）
   * table から辿る形にすることで、ページ内に他のテーブルがあっても誤認しない。
   */
  articleRow: 'table.o-statsContent__table tbody tr',

  /**
   * [VERIFIED] 行内の記事タイトルリンク
   * BEMクラス名で特定。
   */
  titleLink: 'a.o-statsContent__tableTitleLink',

  /**
   * [VERIFIED] 各数値セル（クラス名ベースで取得 → カラム順序に依存しない）
   * --type_view, --type_comment, --type_suki は BEM modifier。
   * カラムの並び替えがあっても壊れない。
   */
  viewCell: 'td.o-statsContent__tableStat--type_view',
  commentCell: 'td.o-statsContent__tableStat--type_comment',
  likeCell: 'td.o-statsContent__tableStat--type_suki',
};

/**
 * URL/IDパターン
 */
const URL_PATTERNS = {
  /** [VERIFIED] このページがダッシュボード統計ページかどうか */
  isDashboardStats: /^https:\/\/note\.com\/sitesettings\/stats/,

  /**
   * [VERIFIED] 記事URLから記事IDを抽出
   * 実際の href: "/mizuoishii/n/n19d7ec8c1c95"
   * → /n/ の後ろの英数字部分を抽出
   */
  articleId: /\/n\/([a-zA-Z0-9]+)/,
};

// ============================================================

/**
 * @typedef {{
 *   articleId: string,
 *   title: string,
 *   url: string,
 *   views: number,
 *   likes: number,
 *   comments: number
 * }} ParsedArticle
 *
 * @typedef {{
 *   success: boolean,
 *   articles: ParsedArticle[],
 *   errors: string[],
 *   timestamp: string
 * }} ParseResult
 */

/**
 * 数値テキストをパース（カンマ区切り対応）
 * @param {string} text
 * @returns {number}
 */
function parseNumber(text) {
  if (!text) return 0;
  const cleaned = text.trim().replace(/,/g, '').replace(/\s/g, '');
  const n = parseInt(cleaned, 10);
  return isNaN(n) ? 0 : n;
}

/**
 * 1行をパースして記事データを返す
 * @param {Element} row
 * @param {number} index - デバッグ用行番号
 * @returns {{ article: ParsedArticle | null, error: string | null }}
 */
function parseSingleRow(row, index) {
  try {
    // タイトルリンクを探す
    const link = row.querySelector(SELECTORS.titleLink);
    if (!link) {
      // リンクがない行はヘッダー行か無関係な行 → スキップ（エラーではない）
      return { article: null, error: null };
    }

    const href = link.getAttribute('href') || '';
    const fullUrl = href.startsWith('http') ? href : 'https://note.com' + href;

    // 記事IDを抽出
    const idMatch = fullUrl.match(URL_PATTERNS.articleId);
    if (!idMatch) {
      return { article: null, error: `行${index}: URLから記事IDを抽出できません (${href})` };
    }
    const articleId = idMatch[1];

    // タイトル
    const title = (link.textContent || '').trim();
    if (!title) {
      return { article: null, error: `行${index}: タイトルが空です (${articleId})` };
    }

    // 各数値をクラス名ベースで取得（カラム順序に依存しない）
    const viewEl = row.querySelector(SELECTORS.viewCell);
    const commentEl = row.querySelector(SELECTORS.commentCell);
    const likeEl = row.querySelector(SELECTORS.likeCell);

    const views = viewEl ? parseNumber(viewEl.textContent || '') : 0;
    const comments = commentEl ? parseNumber(commentEl.textContent || '') : 0;
    const likes = likeEl ? parseNumber(likeEl.textContent || '') : 0;

    // 数値セルが1つも見つからなかった場合は警告（記事データ自体は返す）
    if (!viewEl && !commentEl && !likeEl) {
      return {
        article: { articleId, title, url: fullUrl, views: 0, likes: 0, comments: 0 },
        error: `行${index}: 数値セルが見つかりません (${articleId})。SELECTORS.viewCell 等を確認してください。`,
      };
    }

    return {
      article: { articleId, title, url: fullUrl, views, likes, comments },
      error: null,
    };
  } catch (e) {
    return { article: null, error: `行${index}: パース例外 - ${e.message}` };
  }
}

/**
 * ページ全体から記事データをパースする
 * content script から呼ばれるメイン関数。
 * @returns {ParseResult}
 */
function parseNoteArticles() {
  const errors = [];
  const articles = [];
  const timestamp = new Date().toISOString();

  // ページ判定
  if (!URL_PATTERNS.isDashboardStats.test(window.location.href)) {
    return {
      success: false,
      articles: [],
      errors: ['このページはnoteの統計ページではありません: ' + window.location.href],
      timestamp,
    };
  }

  // テーブル自体の存在確認
  const table = document.querySelector(SELECTORS.table);
  if (!table) {
    errors.push(
      `統計テーブルが見つかりません。セレクタ "${SELECTORS.table}" を確認してください。` +
      ' noteのUI構造が変更された可能性があります。'
    );
    return { success: false, articles: [], errors, timestamp };
  }

  // 記事行を取得
  const rows = document.querySelectorAll(SELECTORS.articleRow);
  if (rows.length === 0) {
    errors.push(
      `テーブルは見つかりましたが行がありません。セレクタ "${SELECTORS.articleRow}" を確認してください。`
    );
    return { success: false, articles: [], errors, timestamp };
  }

  // 各行をパース
  rows.forEach((row, i) => {
    const { article, error } = parseSingleRow(row, i);
    if (article) articles.push(article);
    if (error) errors.push(error);
  });

  if (articles.length === 0 && errors.length === 0) {
    errors.push('テーブル行は見つかりましたが、記事リンクを含む行がありません。SELECTORS.titleLink を確認してください。');
  }

  return {
    success: articles.length > 0,
    articles,
    errors,
    timestamp,
  };
}

// content script から参照するためにグローバルに公開
self.NTL = self.NTL || {};
self.NTL.parser = { parseNoteArticles, SELECTORS, URL_PATTERNS };
