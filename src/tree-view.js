// === 授業資料フォルダ展開 ===

(function () {
  "use strict";

  var table = document.querySelector("table.resourcesList");
  if (!table) return;

  function initFolderFeatures(settings) {
    console.log("[KULMS Extension] Resources page: applying folder features");

  // --- 深さ判定 (padding-left em値から) ---
  function getDepth(td) {
    var pl = parseFloat(td.style.paddingLeft);
    if (isNaN(pl) || pl <= 0.5) return 0;
    return Math.max(0, Math.round((pl - 0.5) / 1.5));
  }

  // --- フォルダ判定 ---
  function isFolder(tr, td) {
    if (td.querySelector('a[onclick*="doExpand_collection"], a[onclick*="doCollapse_collection"]')) return true;
    if (td.querySelector(".fa-folder, .fa-folder-open")) return true;
    if (td.querySelector('img[src*="folder"]')) return true;
    return false;
  }

  // --- 深さごとの実際のpadding値を収集 (px) ---
  var paddingByDepth = new Map();
  table.querySelectorAll("tbody tr").forEach(function (tr) {
    var td = tr.querySelector("td.title");
    if (!td) return;
    var depth = getDepth(td);
    if (!paddingByDepth.has(depth)) {
      paddingByDepth.set(depth, parseFloat(window.getComputedStyle(td).paddingLeft) || 0);
    }
  });

  // --- 行を処理 ---
  function processRow(tr) {
    if (tr.dataset.kulmsProcessed) return;
    tr.dataset.kulmsProcessed = "1";

    var td = tr.querySelector("td.title");
    if (!td) return;

    var depth = getDepth(td);
    var folder = isFolder(tr, td);

    tr.dataset.kulmsDepth = String(depth);
  }

  // --- フォルダ操作の共通処理 ---
  var isBusy = false;

  function refreshTreeView() {
    table.querySelectorAll("tbody tr").forEach(function (tr) {
      var td = tr.querySelector("td.title");
      if (!td) return;
      var depth = getDepth(td);
      if (!paddingByDepth.has(depth)) {
        paddingByDepth.set(
          depth,
          parseFloat(window.getComputedStyle(td).paddingLeft) || 0
        );
      }
    });
    table.querySelectorAll("tbody tr").forEach(processRow);
    // innerHTML置換で失われた Bootstrap Popover を再初期化
    if (typeof bootstrap !== "undefined" && bootstrap.Popover) {
      table.querySelectorAll('[data-bs-toggle="popover"]').forEach(function (el) {
        if (!bootstrap.Popover.getInstance(el)) {
          new bootstrap.Popover(el);
        }
      });
    }
    // 一括ダウンロードUIを再構築
    if (typeof window.__kulmsRefreshBulkDownload === "function") {
      window.__kulmsRefreshBulkDownload();
    }
  }

  // onclick属性からsakai_actionとcollectionIdを抽出
  function parseOnclick(onclick) {
    var actionMatch = onclick.match(
      /getElementById\s*\(\s*['"]sakai_action['"]\s*\)\.value\s*=\s*'([^']*)'/
    );
    var idMatch = onclick.match(
      /getElementById\s*\(\s*['"]collectionId['"]\s*\)\.value\s*=\s*'([^']*)'/
    );
    if (!actionMatch || !idMatch) return null;
    return { action: actionMatch[1], collectionId: idMatch[1] };
  }

  // fetchでフォルダ操作を実行 (ページ遷移なし)
  async function submitFolderAction(action, collectionId) {
    var form =
      document.getElementById("showForm") ||
      table.closest("form") ||
      document.querySelector("form");
    if (!form) return false;

    var params = new URLSearchParams();
    form.querySelectorAll("input").forEach(function (inp) {
      if (inp.name) params.append(inp.name, inp.value);
    });
    params.set("sakai_action", action);
    params.set("collectionId", collectionId);

    try {
      var res = await fetch(form.action || window.location.href, {
        method: "POST",
        body: params,
        credentials: "include",
      });
      if (!res.ok) return false;

      var html = await res.text();
      var doc = new DOMParser().parseFromString(html, "text/html");
      var newTable = doc.querySelector("table.resourcesList");
      if (!newTable) return false;

      var newTbody = newTable.querySelector("tbody");
      var oldTbody = table.querySelector("tbody");
      if (!newTbody || !oldTbody) return false;
      oldTbody.innerHTML = newTbody.innerHTML;
      return true;
    } catch (e) {
      console.warn("[KULMS] folder action failed:", e);
      return false;
    }
  }

  // --- 全フォルダ自動展開 ---
  async function expandAllFolders() {
    isBusy = true;
    for (var i = 0; i < 30; i++) {
      var collapsed = table.querySelectorAll(
        'td.title a[onclick*="doExpand_collection"]'
      );
      if (collapsed.length === 0) break;

      var parsed = parseOnclick(collapsed[0].getAttribute("onclick") || "");
      if (!parsed) break;

      var ok = await submitFolderAction(parsed.action, parsed.collectionId);
      if (!ok) break;
    }
    isBusy = false;
    refreshTreeView();
  }

  // --- 手動の展開/折りたたみクリックをインターセプト ---
  if (settings.folderExpand) {
    // キャプチャフェーズで捕まえ、インラインonclickの実行(=form.submit)を阻止
    table.addEventListener(
      "click",
      function (e) {
        var link = e.target.closest(
          'a[onclick*="doExpand_collection"], a[onclick*="doCollapse_collection"]'
        );
        if (!link || isBusy) return;

        e.preventDefault();
        e.stopPropagation();

        var parsed = parseOnclick(link.getAttribute("onclick") || "");
        if (!parsed) return;

        isBusy = true;
        submitFolderAction(parsed.action, parsed.collectionId).then(function () {
          isBusy = false;
          refreshTreeView();
        });
      },
      true
    );
  }

  // --- 適用 ---
  table.classList.add("kulms-tree-view");
  table.querySelectorAll("tbody tr").forEach(processRow);

  // --- 初回自動展開 ---
  if (settings.autoExpandAll) {
    expandAllFolders();
  }

  } // end initFolderFeatures

  // === 一括ダウンロード機能 ===

  function initBulkDownload(settings) {
    // siteId をURLから取得（ストレージキーに使用）
    var siteIdMatch = window.location.href.match(/[?&]sakai_action=doNavigate&[^#]*/) ||
                      window.location.href.match(/\/site\/([^/?#]+)/);
    var siteId = siteIdMatch ? siteIdMatch[1] || "default" : "default";
    // URLパラメータからも試みる
    var urlParams = new URLSearchParams(window.location.search);
    var siteFromUrl = urlParams.get("site") || urlParams.get("siteId");
    if (siteFromUrl) siteId = siteFromUrl;
    // パスからも抽出
    var pathMatch = window.location.pathname.match(/\/portal\/site\/([^/?#]+)/);
    if (pathMatch) siteId = pathMatch[1];

    var storageKey = "kulms-downloaded-" + siteId;

    // フォルダ行かどうか判定
    function isFolderRow(tr) {
      var td = tr.querySelector("td.title");
      if (!td) return true; // tdなければスキップ
      return !!(td.querySelector('a[onclick*="doExpand_collection"], a[onclick*="doCollapse_collection"]') ||
                td.querySelector(".fa-folder, .fa-folder-open") ||
                td.querySelector('img[src*="folder"]'));
    }

    // ファイル行のダウンロードURLを取得（クエリパラメータ除去して正規化）
    function getFileUrl(tr) {
      var td = tr.querySelector("td.title");
      if (!td) return null;
      // onclickなし、かつhrefありのリンク
      var links = td.querySelectorAll("a[href]");
      for (var i = 0; i < links.length; i++) {
        var a = links[i];
        if (!a.getAttribute("onclick") && a.href && a.href !== "#") {
          return a.href.split("?")[0];
        }
      }
      return null;
    }

    // ファイル名を取得
    function getFileName(tr) {
      var td = tr.querySelector("td.title");
      if (!td) return "file";
      var a = td.querySelector("a[href]:not([onclick])");
      if (a && a.textContent.trim()) return a.textContent.trim();
      return td.textContent.trim() || "file";
    }

    // ツールバーを生成・挿入
    var toolbar = document.createElement("div");
    toolbar.className = "kulms-bulk-toolbar";
    toolbar.id = "kulms-bulk-toolbar";

    // 全選択チェックボックス（bulkDownload有効時のみ）
    var selectAllWrap = null;
    if (settings.bulkDownload) {
      selectAllWrap = document.createElement("label");
      selectAllWrap.style.cssText = "display:flex;align-items:center;gap:4px;cursor:pointer";
      var selectAllCb = document.createElement("input");
      selectAllCb.type = "checkbox";
      selectAllCb.className = "kulms-bulk-select-all";
      selectAllCb.id = "kulms-select-all";
      var selectAllLabel = document.createElement("span");
      selectAllLabel.className = "kulms-bulk-label";
      selectAllLabel.textContent = t("labelSelectAll");
      selectAllWrap.appendChild(selectAllCb);
      selectAllWrap.appendChild(selectAllLabel);
      toolbar.appendChild(selectAllWrap);
    }

    // 選択DLボタン（bulkDownload有効時）
    var downloadSelectedBtn = null;
    if (settings.bulkDownload) {
      downloadSelectedBtn = document.createElement("button");
      downloadSelectedBtn.className = "kulms-bulk-btn kulms-bulk-btn-primary";
      downloadSelectedBtn.disabled = true;
      downloadSelectedBtn.textContent = t("btnDownloadSelected", ["0"]);
      toolbar.appendChild(downloadSelectedBtn);
    }

    // 新着DLボタン（highlightNew有効時）
    var downloadNewBtn = null;
    if (settings.highlightNew) {
      downloadNewBtn = document.createElement("button");
      downloadNewBtn.className = "kulms-bulk-btn kulms-bulk-btn-new";
      downloadNewBtn.disabled = true;
      downloadNewBtn.textContent = t("btnDownloadNew", ["0"]);
      toolbar.appendChild(downloadNewBtn);
    }

    // 既読にするボタン（bulkDownload or highlightNew有効時）
    var markReadBtn = null;
    if (settings.bulkDownload || settings.highlightNew) {
      markReadBtn = document.createElement("button");
      markReadBtn.className = "kulms-bulk-btn kulms-bulk-btn-mark-read";
      markReadBtn.disabled = true;
      markReadBtn.textContent = t("btnMarkRead", ["0"]);
      toolbar.appendChild(markReadBtn);
    }

    // ツールバーを table の直前に挿入
    table.parentNode.insertBefore(toolbar, table);

    // ヘッダーに列を追加
    var thead = table.querySelector("thead tr");
    if (thead) {
      if (settings.highlightNew) {
        var thRead = document.createElement("th");
        thRead.className = "kulms-mark-read-col";
        thead.insertBefore(thRead, thead.firstChild);
      }
      if (settings.bulkDownload) {
        var th = document.createElement("th");
        th.className = "kulms-check-col";
        thead.insertBefore(th, thead.firstChild);
      }
    }

    // ダウンロード済みURLセットをストレージから読み込み、UI構築
    window.__kulmsSafeStorage.get(storageKey, function (result) {
      var downloadedSet = new Set(result[storageKey] || []);

      // 各ファイル行を処理
      var fileRows = [];
      table.querySelectorAll("tbody tr").forEach(function (tr) {
        if (isFolderRow(tr)) {
          // フォルダ行：追加列のダミーセルを挿入
          if (settings.highlightNew) {
            var emptyReadTd = document.createElement("td");
            emptyReadTd.className = "kulms-mark-read-col";
            tr.insertBefore(emptyReadTd, tr.firstChild);
          }
          if (settings.bulkDownload) {
            var emptyTd = document.createElement("td");
            emptyTd.className = "kulms-check-col";
            tr.insertBefore(emptyTd, tr.firstChild);
          }
          return;
        }

        var url = getFileUrl(tr);
        if (!url) return;
        fileRows.push({ tr: tr, url: url });

        // 既読ボタン列（highlightNew有効時、常に列を追加してレイアウトを揃える）
        if (settings.highlightNew) {
          (function (rowUrl, rowTr) {
            var readTd = document.createElement("td");
            readTd.className = "kulms-mark-read-col";
            if (!downloadedSet.has(rowUrl)) {
              rowTr.classList.add("kulms-new-file");
              var markBtn = document.createElement("button");
              markBtn.className = "kulms-mark-read-row-btn";
              markBtn.title = t("btnMarkReadRow");
              markBtn.textContent = "✕";
              markBtn.addEventListener("click", function (e) {
                e.preventDefault();
                e.stopPropagation();
                markAsRead([rowUrl]);
              });
              readTd.appendChild(markBtn);
            }
            rowTr.insertBefore(readTd, rowTr.firstChild);
          })(url, tr);
        }

        // チェックボックスを行に追加（bulkDownload有効時）
        if (settings.bulkDownload) {
          var cbTd = document.createElement("td");
          cbTd.className = "kulms-check-col";
          var cb = document.createElement("input");
          cb.type = "checkbox";
          cb.dataset.kulmsUrl = url;
          cb.dataset.kulmsName = getFileName(tr);
          cb.addEventListener("change", updateSelectedCount);
          cbTd.appendChild(cb);
          tr.insertBefore(cbTd, tr.firstChild);

          // 行の余白クリックでチェックボックスをトグル
          tr.classList.add("kulms-selectable-row");
          tr.addEventListener("click", function (e) {
            // リンク・ボタン・チェックボックス自体のクリックは除外
            if (e.target.closest("a, button, input, .btn-group")) return;
            cb.checked = !cb.checked;
            updateSelectedCount();
          });
        }
      });

      // 新着件数を更新
      function countNewFiles() {
        return fileRows.filter(function (f) { return !downloadedSet.has(f.url); }).length;
      }

      function updateNewBtn() {
        if (!downloadNewBtn) return;
        var cnt = countNewFiles();
        downloadNewBtn.textContent = t("btnDownloadNew", [String(cnt)]);
        downloadNewBtn.disabled = cnt === 0;
      }

      function updateSelectedCount() {
        var checked = table.querySelectorAll('td.kulms-check-col input[type="checkbox"]:checked');
        var cnt = checked.length;
        if (downloadSelectedBtn) {
          downloadSelectedBtn.textContent = t("btnDownloadSelected", [String(cnt)]);
          downloadSelectedBtn.disabled = cnt === 0;
        }
        if (markReadBtn) {
          markReadBtn.textContent = t("btnMarkRead", [String(cnt)]);
          markReadBtn.disabled = cnt === 0;
        }
        // 全選択チェックボックスの状態同期
        if (selectAllCb) {
          var allCbs = table.querySelectorAll('td.kulms-check-col input[type="checkbox"]');
          selectAllCb.indeterminate = cnt > 0 && cnt < allCbs.length;
          selectAllCb.checked = allCbs.length > 0 && cnt === allCbs.length;
        }
      }

      updateNewBtn();
      updateSelectedCount();

      // 全選択の動作
      if (selectAllCb) {
        selectAllCb.addEventListener("change", function () {
          table.querySelectorAll('td.kulms-check-col input[type="checkbox"]').forEach(function (cb) {
            cb.checked = selectAllCb.checked;
          });
          updateSelectedCount();
        });
      }

      // ダウンロード実行（順番に1件ずつ）
      async function downloadFiles(urls, names) {
        var newDownloaded = new Set(downloadedSet);
        for (var i = 0; i < urls.length; i++) {
          var dlUrl = urls[i];
          var dlName = names[i];
          try {
            await new Promise(function (resolve, reject) {
              if (!window.__kulmsAlive()) { reject(new Error("context invalid")); return; }
              chrome.runtime.sendMessage({ action: "downloadFile", url: dlUrl, filename: dlName }, function (resp) {
                if (chrome.runtime.lastError) { reject(chrome.runtime.lastError); return; }
                if (resp && resp.error) { reject(new Error(resp.error)); return; }
                resolve(resp && resp.id);
              });
            });
          } catch (e) {
            console.warn("[KULMS] download failed:", dlUrl, e);
          }
          newDownloaded.add(dlUrl);
        }
        // ストレージ更新
        var arr = Array.from(newDownloaded);
        var item = {};
        item[storageKey] = arr;
        window.__kulmsSafeStorage.set(item);
        downloadedSet.clear();
        arr.forEach(function (u) { downloadedSet.add(u); });

        // ハイライト除去
        if (settings.highlightNew) {
          fileRows.forEach(function (f) {
            if (downloadedSet.has(f.url)) {
              f.tr.classList.remove("kulms-new-file");
            }
          });
          updateNewBtn();
        }
      }

      // URLを既読としてストレージに記録しハイライト除去
      function markAsRead(urls) {
        var newDownloaded = new Set(downloadedSet);
        urls.forEach(function (u) { newDownloaded.add(u); });
        var arr = Array.from(newDownloaded);
        var item = {};
        item[storageKey] = arr;
        window.__kulmsSafeStorage.set(item);
        downloadedSet.clear();
        arr.forEach(function (u) { downloadedSet.add(u); });
        fileRows.forEach(function (f) {
          if (downloadedSet.has(f.url)) {
            f.tr.classList.remove("kulms-new-file");
            var readTd = f.tr.querySelector("td.kulms-mark-read-col");
            if (readTd) readTd.innerHTML = "";
          }
        });
        updateNewBtn();
        updateSelectedCount();
      }

      // 選択ファイルをダウンロード
      if (downloadSelectedBtn) {
        downloadSelectedBtn.addEventListener("click", function () {
          var checked = table.querySelectorAll('td.kulms-check-col input[type="checkbox"]:checked');
          var urls = [], names = [];
          checked.forEach(function (cb) {
            urls.push(cb.dataset.kulmsUrl);
            names.push(cb.dataset.kulmsName);
            cb.checked = false;
          });
          if (urls.length === 0) return;
          if (selectAllCb) { selectAllCb.checked = false; selectAllCb.indeterminate = false; }
          updateSelectedCount();
          downloadFiles(urls, names);
        });
      }

      // 選択行を既読にする
      if (markReadBtn) {
        markReadBtn.addEventListener("click", function () {
          var checked = table.querySelectorAll('td.kulms-check-col input[type="checkbox"]:checked');
          var urls = [];
          checked.forEach(function (cb) {
            urls.push(cb.dataset.kulmsUrl);
            cb.checked = false;
          });
          if (urls.length === 0) return;
          if (selectAllCb) { selectAllCb.checked = false; selectAllCb.indeterminate = false; }
          markAsRead(urls);
        });
      }

      // 新着ファイルをすべてダウンロード
      if (downloadNewBtn) {
        downloadNewBtn.addEventListener("click", function () {
          var newFiles = fileRows.filter(function (f) { return !downloadedSet.has(f.url); });
          var urls = newFiles.map(function (f) { return f.url; });
          var names = newFiles.map(function (f) { return getFileName(f.tr); });
          if (urls.length === 0) return;
          downloadFiles(urls, names);
        });
      }

      // tbody更新後にUI再構築（folderExpand連携）
      var origRefreshTreeView = window.__kulmsRefreshBulkDownload;
      window.__kulmsRefreshBulkDownload = function () {
        // チェックボックス列を再追加
        table.querySelectorAll("tbody tr").forEach(function (tr) {
          if (tr.querySelector("td.kulms-check-col")) return; // 既に追加済み
          if (isFolderRow(tr)) {
            if (settings.bulkDownload) {
              var emptyTd = document.createElement("td");
              emptyTd.className = "kulms-check-col";
              tr.insertBefore(emptyTd, tr.firstChild);
            }
            return;
          }
          var url = getFileUrl(tr);
          if (!url) return;

          var alreadyTracked = fileRows.some(function (f) { return f.url === url; });
          if (!alreadyTracked) fileRows.push({ tr: tr, url: url });

          if (settings.highlightNew && !downloadedSet.has(url)) {
            tr.classList.add("kulms-new-file");
          }

          if (settings.bulkDownload) {
            var cbTd = document.createElement("td");
            cbTd.className = "kulms-check-col";
            var cb = document.createElement("input");
            cb.type = "checkbox";
            cb.dataset.kulmsUrl = url;
            cb.dataset.kulmsName = getFileName(tr);
            cb.addEventListener("change", updateSelectedCount);
            cbTd.appendChild(cb);
            tr.insertBefore(cbTd, tr.firstChild);
          }
        });
        updateNewBtn();
        updateSelectedCount();
      };
    });
  } // end initBulkDownload

  window.__kulmsSettingsReady.then(function (s) {
    if (s.hideResourceColumns) {
      table.classList.add("kulms-hide-columns");
    }
    if (s.bulkDownload || s.highlightNew) {
      initBulkDownload(s);
    }
    if (!s.folderExpand && !s.autoExpandAll) return;
    initFolderFeatures(s);
  });
})();
