/**
 * note Time Ledger - Content Script
 *
 * note の /sitesettings/stats ページ上で動作。
 * DOM から記事データを読み取り、service-worker 経由で保存する。
 */

// @ts-check
/* global NTL */

(() => {
  'use strict';

  if (document.getElementById('ntl-capture-btn')) return;

  function todayString() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /**
   * service-worker にメッセージを送る（タイムアウト付き）
   */
  function sendMessage(message) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Service worker応答なし（5秒タイムアウト）。chrome://extensions で拡張を更新してください。'));
      }, 5000);

      try {
        chrome.runtime.sendMessage(message, (response) => {
          clearTimeout(timeout);
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response && response.error) {
            reject(new Error(response.error));
          } else {
            resolve(response);
          }
        });
      } catch (e) {
        clearTimeout(timeout);
        reject(e);
      }
    });
  }

  function showStatus(message, type) {
    let el = document.getElementById('ntl-status');
    if (!el) {
      el = document.createElement('div');
      el.id = 'ntl-status';
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.className = 'ntl-status ntl-status--' + type;
    el.style.display = 'block';

    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(() => { el.style.display = 'none'; }, 5000);
  }

  async function captureAndSave() {
    const btn = document.getElementById('ntl-capture-btn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '取得中…';
    }

    try {
      const result = NTL.parser.parseNoteArticles();

      if (!result.success) {
        showStatus('DOM取得失敗:\n' + result.errors.join('\n'), 'error');
        console.warn('[note Time Ledger]', result.errors);
        return;
      }

      const now = new Date().toISOString();
      const date = todayString();
      const snapshots = result.articles.map((a) => ({
        articleId: a.articleId,
        title: a.title,
        url: a.url,
        views: a.views,
        likes: a.likes,
        comments: a.comments,
        capturedAt: now,
        date: date,
      }));

      const response = await sendMessage({ type: 'saveSnapshots', snapshots });

      showStatus(
        `${response.saved}件保存しました（累計 ${response.count} レコード）`,
        response.errors && response.errors.length > 0 ? 'error' : 'success'
      );
    } catch (e) {
      showStatus('保存エラー: ' + e.message, 'error');
      console.error('[note Time Ledger]', e);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '📊 記録する';
      }
    }
  }

  function injectUI() {
    const btn = document.createElement('button');
    btn.id = 'ntl-capture-btn';
    btn.className = 'ntl-capture-btn';
    btn.textContent = '📊 記録する';
    btn.title = 'note Time Ledger: 現在の数値をローカルに保存します';
    btn.addEventListener('click', captureAndSave);
    document.body.appendChild(btn);
  }

  injectUI();
  console.log('[note Time Ledger] Content script loaded.');
})();
