/**
 * note Time Ledger - Popup UI Logic
 *
 * popup は拡張コンテキストで動くため、service-worker と同じ IndexedDB に
 * 直接アクセスできる。読み取り系はすべて NTL.db を直接使う。
 */

// @ts-check
/* global NTL */

(() => {
  'use strict';

  const mainBody = document.getElementById('ntl-main-body');
  const emptyEl = document.getElementById('ntl-empty');
  const recordCount = document.getElementById('ntl-record-count');
  const historyPanel = document.getElementById('ntl-history-panel');
  const historyTitle = document.getElementById('ntl-history-title');
  const historyBody = document.getElementById('ntl-history-body');

  // ============================================================
  //  Utility
  // ============================================================

  function diffHtml(current, previous) {
    if (previous === undefined || previous === null) {
      return '<span class="ntl-diff ntl-diff--zero">—</span>';
    }
    const d = current - previous;
    if (d > 0) return `<span class="ntl-diff ntl-diff--positive">+${d}</span>`;
    if (d < 0) return `<span class="ntl-diff ntl-diff--negative">${d}</span>`;
    return '<span class="ntl-diff ntl-diff--zero">±0</span>';
  }

  function formatDate(dateStr) {
    if (!dateStr) return '-';
    const parts = dateStr.split('-');
    if (parts.length === 3) return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
    return dateStr;
  }

  function formatTimestamp(isoStr) {
    if (!isoStr) return '-';
    try {
      const d = new Date(isoStr);
      return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    } catch {
      return isoStr;
    }
  }

  function esc(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ============================================================
  //  Render
  // ============================================================

  async function render() {
    try {
      const summaries = await NTL.db.getArticleSummaries();
      const total = await NTL.db.count();

      recordCount.textContent = `${summaries.length} 記事 / ${total} レコード`;

      if (summaries.length === 0) {
        mainBody.innerHTML = '';
        emptyEl.style.display = 'block';
        return;
      }

      emptyEl.style.display = 'none';

      mainBody.innerHTML = summaries.map((s) => {
        const prev = s.previous;
        const prevViews = prev ? prev.views : undefined;
        const prevComments = prev ? prev.comments : undefined;
        const prevLikes = prev ? prev.likes : undefined;

        return `
          <tr data-article-id="${esc(s.articleId)}" class="ntl-clickable-row" title="クリックで履歴を表示">
            <td class="ntl-title-cell">
              <a href="${esc(s.url)}" target="_blank" title="${esc(s.title)}">${esc(s.title)}</a>
            </td>
            <td class="ntl-num">
              ${s.latest.views}${diffHtml(s.latest.views, prevViews)}
            </td>
            <td class="ntl-num">
              ${s.latest.comments}${diffHtml(s.latest.comments, prevComments)}
            </td>
            <td class="ntl-num">
              ${s.latest.likes}${diffHtml(s.latest.likes, prevLikes)}
            </td>
            <td class="ntl-date">${formatTimestamp(s.latest.capturedAt)}</td>
          </tr>
        `;
      }).join('');

      mainBody.querySelectorAll('.ntl-clickable-row').forEach((row) => {
        row.style.cursor = 'pointer';
        row.addEventListener('click', (e) => {
          if (e.target.closest('a')) return;
          const articleId = row.getAttribute('data-article-id');
          if (articleId) showHistory(articleId);
        });
      });
    } catch (e) {
      mainBody.innerHTML = `<tr><td colspan="5" style="color:red;">読み込みエラー: ${esc(e.message)}</td></tr>`;
      console.error('[note Time Ledger] render error:', e);
    }
  }

  async function showHistory(articleId) {
    try {
      const history = await NTL.db.getArticleHistory(articleId);
      if (!history || history.length === 0) {
        historyPanel.classList.remove('ntl-visible');
        return;
      }

      historyTitle.textContent = history[0].title;

      historyBody.innerHTML = history.map((snap) => `
        <tr>
          <td>${formatDate(snap.date)}</td>
          <td class="ntl-num">${snap.views}</td>
          <td class="ntl-num">${snap.comments}</td>
          <td class="ntl-num">${snap.likes}</td>
        </tr>
      `).join('');

      historyPanel.classList.add('ntl-visible');
    } catch (e) {
      console.error('[note Time Ledger] showHistory error:', e);
    }
  }

  // ============================================================
  //  Export / Import
  // ============================================================

  async function handleExport() {
    try {
      const data = await NTL.db.exportAll();
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `note-time-ledger-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('エクスポートエラー: ' + e.message);
    }
  }

  function handleImportClick() {
    document.getElementById('ntl-import-input').click();
  }

  async function handleImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!data.snapshots || !Array.isArray(data.snapshots)) {
        alert('無効なファイル形式です。');
        return;
      }

      if (!confirm(`${data.snapshots.length} 件インポートしますか？\n同日・同記事は上書きされます。`)) return;

      const result = await NTL.db.importData(data);
      alert(`${result.saved} 件インポートしました。`);
      await render();
    } catch (e) {
      alert('インポートエラー: ' + e.message);
    }
    e.target.value = '';
  }

  async function handleClear() {
    const count = await NTL.db.count();
    if (count === 0) { alert('データはありません。'); return; }
    if (!confirm(`全 ${count} レコードを削除します。\nこの操作は取り消せません。\n先にエクスポートを推奨します。`)) return;

    try {
      await NTL.db.clearAll();
      historyPanel.classList.remove('ntl-visible');
      await render();
    } catch (e) {
      alert('削除エラー: ' + e.message);
    }
  }

  // ============================================================
  //  Event Listeners
  // ============================================================

  document.getElementById('ntl-btn-refresh').addEventListener('click', render);
  document.getElementById('ntl-btn-export').addEventListener('click', handleExport);
  document.getElementById('ntl-btn-import').addEventListener('click', handleImportClick);
  document.getElementById('ntl-import-input').addEventListener('change', handleImportFile);
  document.getElementById('ntl-btn-clear').addEventListener('click', handleClear);
  document.getElementById('ntl-history-close').addEventListener('click', () => {
    historyPanel.classList.remove('ntl-visible');
  });

  render();
})();
