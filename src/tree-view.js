// === 授業資料フォルダ展開 ===

(function () {
  "use strict";

  var table = document.querySelector("table.resourcesList");
  if (!table) return;

  /** Sakai Resources: onclick から sakai_action / collectionId */
  function kulmsParseFolderOnclick(onclick) {
    if (!onclick) return null;
    var actionMatch = onclick.match(
      /getElementById\s*\(\s*['"]sakai_action['"]\s*\)\.value\s*=\s*(?:'([^']*)'|"([^"]*)")/
    );
    var idMatch = onclick.match(
      /getElementById\s*\(\s*['"]collectionId['"]\s*\)\.value\s*=\s*(?:'([^']*)'|"([^"]*)")/
    );
    if (!actionMatch || !idMatch) return null;
    var action = actionMatch[1] || actionMatch[2];
    var collectionId = idMatch[1] || idMatch[2];
    if (!action || !collectionId) return null;
    return { action: action, collectionId: collectionId };
  }

  function kulmsPathKeyFromCollectionId(collectionId) {
    var id = String(collectionId || "").trim();
    if (!id) return "\uffff";
    id = id.replace(/^\/group\/[^/]+\//, "");
    id = id.replace(/\/+$/, "");
    if (!id) return "/";
    return id + "/";
  }

  function kulmsGetResourceRowSortKey(tr) {
    var td = tr.querySelector("td.title, td.specialLink.title");
    if (!td) return "\uffff";
    var links = td.querySelectorAll("a[href]");
    var i;
    for (i = 0; i < links.length; i++) {
      var a = links[i];
      if (!a.getAttribute("onclick") && a.href && a.href !== "#") {
        var u = a.href.split("?")[0];
        var m = u.match(/\/access\/content\/group\/[^/?#]+\/?([^?#]*)$/i);
        if (m) {
          var tail = (m[1] || "").replace(/\/+$/, "");
          if (!tail) return "";
          var path = decodeURIComponent(tail);
          return path.replace(/\/+$/, "");
        }
      }
    }
    var exp = td.querySelector(
      'a[onclick*="doExpand_collection"], a[onclick*="doCollapse_collection"]'
    );
    if (exp) {
      var p = kulmsParseFolderOnclick(exp.getAttribute("onclick") || "");
      if (p && p.collectionId) return kulmsPathKeyFromCollectionId(p.collectionId);
    }
    return "\uffff";
  }

  /** 共通親を持つ直下の兄弟同士のみ、名前を比べる（同一親ではファイル優先は呼び出し側） */
  function kulmsSiblingSegmentCompare(nameA, isFolderRowA, nameB, isFolderRowB) {
    var rankA = isFolderRowA ? 1 : 0;
    var rankB = isFolderRowB ? 1 : 0;
    if (rankA !== rankB) return rankA - rankB;
    return nameA.localeCompare(nameB, "ja", { numeric: true, sensitivity: "base" });
  }

  /** パスセグメントで親→子の順（ツリーに近い）になり、同一親直下ではファイル行をフォルダ行より前に並べる */
  function kulmsPathTreeCompare(ka, kb) {
    if (ka === kb) return 0;
    if (ka === "\uffff" && kb === "\uffff") return 0;
    if (ka === "\uffff") return 1;
    if (kb === "\uffff") return -1;
    var fa = /\/$/.test(ka);
    var fb = /\/$/.test(kb);
    var sa = ka.replace(/\/+$/, "").split("/").filter(function (s) { return s.length; });
    var sb = kb.replace(/\/+$/, "").split("/").filter(function (s) { return s.length; });
    var i = 0;
    while (i < sa.length && i < sb.length) {
      if (sa[i] !== sb[i]) {
        var sameDepth = sa.length === sb.length;
        var siblingLeaf = sameDepth && i === sa.length - 1;
        if (siblingLeaf) {
          return kulmsSiblingSegmentCompare(sa[i], fa, sb[i], fb);
        }
        return sa[i].localeCompare(sb[i], "ja", { numeric: true, sensitivity: "base" });
      }
      i++;
    }
    if (sa.length < sb.length) return -1;
    if (sa.length > sb.length) return 1;
    if (fa !== fb) return fa ? 1 : -1;
    return 0;
  }

  /** タイトル行・全幅ナビ行など（常にtbody先頭側に固定） */
  function kulmsIsMetaHeaderRow(tr) {
    if (tr.querySelector("td[colspan]")) return true;
    if (!tr.querySelector("td.title, td.specialLink.title")) return true;
    return false;
  }

  function kulmsReorderResourceRowsByPath(resourceTable) {
    var tb = resourceTable.querySelector("tbody");
    if (!tb) return;
    var rows = Array.prototype.slice.call(tb.querySelectorAll("tr"));
    if (rows.length < 2) return;

    var meta = [];
    var orphanTitle = [];
    var resource = [];

    rows.forEach(function (tr) {
      if (kulmsIsMetaHeaderRow(tr)) {
        meta.push(tr);
        return;
      }
      var k = kulmsGetResourceRowSortKey(tr);
      if (k === "\uffff") {
        orphanTitle.push(tr);
        return;
      }
      resource.push(tr);
    });

    resource.sort(function (a, b) {
      return kulmsPathTreeCompare(
        kulmsGetResourceRowSortKey(a),
        kulmsGetResourceRowSortKey(b)
      );
    });

    meta.concat(orphanTitle).concat(resource).forEach(function (tr) {
      tb.appendChild(tr);
    });
  }

  /** Sakai のインライン padding-left(em) から段階の目安を得る */
  function kulmsPaddingDepthFromInlineTd(td) {
    if (!td) return 0;
    var pl = parseFloat(td.style.paddingLeft);
    if (isNaN(pl) || pl <= 0.5) return 0;
    return Math.max(0, Math.round((pl - 0.5) / 1.5));
  }

  /**
   * パスキーからリスト上のインデント段数（ルート直下=0、1つネストごとに+1）
   */
  function kulmsPathDepthFromSortKey(k) {
    if (k === "\uffff") return null;
    var s = String(k || "").replace(/\/+$/, "");
    if (!s || s === "/") return 0;
    var n = s.split("/").filter(function (seg) {
      return seg.length;
    }).length;
    return Math.max(0, n - 1);
  }

  /** ツリー表示時：コンテンツパスに応じてタイトル列の左余白を揃える */
  function kulmsApplyPathIndentToResourceTable(resourceTable) {
    if (!resourceTable.classList.contains("kulms-tree-view")) return;
    resourceTable.querySelectorAll("tbody tr").forEach(function (tr) {
      if (kulmsIsMetaHeaderRow(tr)) return;
      var k = kulmsGetResourceRowSortKey(tr);
      var depth =
        k === "\uffff"
          ? kulmsPaddingDepthFromInlineTd(tr.querySelector("td.title, td.specialLink.title"))
          : kulmsPathDepthFromSortKey(k);
      var pad = 0.5 + depth * 1.5 + "em";
      tr.querySelectorAll("td.title, td.specialLink.title").forEach(function (td) {
        td.style.paddingLeft = pad;
      });
    });
  }

  function initFolderFeatures(settings) {
    console.log("[KULMS Extension] Resources page: applying folder features");

  // --- 深さ判定 (パス優先、なければインライン padding) ---
  function getDepth(tr, td) {
    var k = kulmsGetResourceRowSortKey(tr);
    var pd = kulmsPathDepthFromSortKey(k);
    if (pd !== null) return pd;
    return kulmsPaddingDepthFromInlineTd(td);
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
    var depth = getDepth(tr, td);
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

    var depth = getDepth(tr, td);
    var folder = isFolder(tr, td);

    tr.dataset.kulmsDepth = String(depth);
    if (folder) tr.classList.add("kulms-folder-toggle-row");
    else tr.classList.remove("kulms-folder-toggle-row");
  }

  // --- フォルダ操作の共通処理 ---
  var isBusy = false;

  function refreshTreeView() {
    table.querySelectorAll("tbody tr").forEach(function (tr) {
      var td = tr.querySelector("td.title");
      if (!td) return;
      var depth = getDepth(tr, td);
      if (!paddingByDepth.has(depth)) {
        paddingByDepth.set(
          depth,
          parseFloat(window.getComputedStyle(td).paddingLeft) || 0
        );
      }
    });
    kulmsApplyPathIndentToResourceTable(table);
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
    kulmsApplyPathIndentToResourceTable(table);
  }

  // onclick属性からsakai_actionとcollectionIdを抽出
  function parseOnclick(onclick) {
    return kulmsParseFolderOnclick(onclick);
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

    var oldTbody = table.querySelector("tbody");
    if (!oldTbody) return false;
    oldTbody.classList.add("kulms-tbody-folder-loading");
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
      if (!newTbody) return false;
      oldTbody.innerHTML = newTbody.innerHTML;
      kulmsReorderResourceRowsByPath(table);
      kulmsApplyPathIndentToResourceTable(table);
      oldTbody.classList.remove("kulms-tbody-folder-loading");
      var reducedMotion =
        window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!reducedMotion) {
        var resourceTrs = [];
        oldTbody.querySelectorAll("tr").forEach(function (tr) {
          if (!kulmsIsMetaHeaderRow(tr)) resourceTrs.push(tr);
        });
        var n = resourceTrs.length;
        var maxDelayMs = 1200;
        var stepMs =
          n <= 1 ? 0 : Math.min(65, Math.max(40, Math.floor(maxDelayMs / (n - 1))));
        void oldTbody.offsetWidth;
        resourceTrs.forEach(function (tr, i) {
          var delayMs = Math.min(i * stepMs, maxDelayMs);
          tr.style.setProperty("--kulms-stagger-delay", delayMs + "ms");
          tr.classList.add("kulms-row-reveal");
        });
      }
      return true;
    } catch (e) {
      console.warn("[KULMS] folder action failed:", e);
      return false;
    } finally {
      oldTbody.classList.remove("kulms-tbody-folder-loading");
    }
  }

  // --- 全フォルダ自動展開 ---
  async function expandAllFolders() {
    isBusy = true;
    for (var i = 0; i < 30; i++) {
      var collapsed = table.querySelectorAll(
        'td.title a[onclick*="doExpand_collection"], td.specialLink.title a[onclick*="doExpand_collection"]'
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
        if (e.target.closest("button, input, select, textarea, .btn-group, label")) return;

        var link = e.target.closest(
          'a[onclick*="doExpand_collection"], a[onclick*="doCollapse_collection"]'
        );

        if (!link) {
          var clickedAnchor = e.target.closest("td.title a");
          if (clickedAnchor) {
            var tr = clickedAnchor.closest("tr");
            if (tr) {
              link = tr.querySelector(
                'td.title a[onclick*="doExpand_collection"], td.title a[onclick*="doCollapse_collection"],' +
                  'td.specialLink.title a[onclick*="doExpand_collection"], td.specialLink.title a[onclick*="doCollapse_collection"]'
              );
            }
          }
        }


        // フォルダ名など「中身へ進む」実リンクはそのまま。余白・アイコン（トグル）のみ SPA 展開
        if (!link) {
          var row = e.target.closest("tbody tr.kulms-folder-toggle-row");
          if (!row || isBusy) return;
          var toggle = row.querySelector(
            'td.title a[onclick*="doExpand_collection"], td.title a[onclick*="doCollapse_collection"],' +
              'td.specialLink.title a[onclick*="doExpand_collection"], td.specialLink.title a[onclick*="doCollapse_collection"]'
          );
          if (!toggle) return;

          var hitA = e.target.closest("a");
          if (hitA && hitA !== toggle) {
            var href = (hitA.getAttribute("href") || "").trim();
            var oc = hitA.getAttribute("onclick") || "";
            var hitIsToggle = /doExpand_collection|doCollapse_collection/.test(oc);
            var placeholderHref =
              href === "" ||
              href === "#" ||
              /^javascript:/i.test(href) ||
              /^mailto:/i.test(href);
            if (!hitIsToggle && !placeholderHref) return;
          }
          link = toggle;
        }

        if (!link || isBusy) return;

        var parsed = parseOnclick(link.getAttribute("onclick") || "");
        if (!parsed) return;

        e.preventDefault();
        e.stopPropagation();

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
  kulmsApplyPathIndentToResourceTable(table);
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

      // 「既読」(左) → チェック(右)。insertBefore で先頭へ入れるときは check → read の順が先頭2列になる
      function ensureFolderRowPlaceholderCols(tr) {
        if (!settings.highlightNew && !settings.bulkDownload) return;
        var readTd = tr.querySelector("td.kulms-mark-read-col");
        var checkTd = tr.querySelector("td.kulms-check-col");

        var hasRequiredPlaceholderCols =
          (settings.highlightNew && settings.bulkDownload
            ? readTd && checkTd
            : settings.highlightNew
              ? !!readTd
              : !!checkTd);

        function touchOrderForFolder() {
          readTd = tr.querySelector("td.kulms-mark-read-col");
          checkTd = tr.querySelector("td.kulms-check-col");
          if (settings.highlightNew && settings.bulkDownload && readTd && checkTd) {
            if (readTd.nextElementSibling !== checkTd) tr.insertBefore(readTd, checkTd);
          }
        }

        if (hasRequiredPlaceholderCols) {
          touchOrderForFolder();
          return;
        }

        if (settings.bulkDownload && !checkTd) {
          checkTd = document.createElement("td");
          checkTd.className = "kulms-check-col";
          tr.insertBefore(checkTd, tr.firstChild);
        }
        if (settings.highlightNew && !readTd) {
          readTd = document.createElement("td");
          readTd.className = "kulms-mark-read-col";
          tr.insertBefore(readTd, tr.firstChild);
        }
        touchOrderForFolder();
      }

      function bindRowCheckboxToggle(tr, cb) {
        tr.classList.add("kulms-selectable-row");
        tr.addEventListener("click", function onRowToggle(e) {
          if (!tr.contains(cb)) return;
          if (e.target.closest("a, button, input, .btn-group")) return;
          cb.checked = !cb.checked;
          updateSelectedCount();
        });
      }

      function ensureFileRowCols(tr, url) {
        if (!settings.highlightNew && !settings.bulkDownload) return;

        var readTd = tr.querySelector("td.kulms-mark-read-col");
        var checkTd = tr.querySelector("td.kulms-check-col");

        if (settings.highlightNew && !readTd) {
          readTd = document.createElement("td");
          readTd.className = "kulms-mark-read-col";
          if (settings.bulkDownload && checkTd) {
            tr.insertBefore(readTd, checkTd);
          } else {
            tr.insertBefore(readTd, tr.firstChild);
          }
        }
        if (settings.bulkDownload && !checkTd) {
          checkTd = document.createElement("td");
          checkTd.className = "kulms-check-col";
          var readLead = settings.highlightNew
            ? tr.querySelector("td.kulms-mark-read-col")
            : null;
          if (readLead) {
            readLead.insertAdjacentElement("afterend", checkTd);
          } else {
            tr.insertBefore(checkTd, tr.firstChild);
          }
        }

        readTd = tr.querySelector("td.kulms-mark-read-col");
        checkTd = tr.querySelector("td.kulms-check-col");
        if (settings.highlightNew && settings.bulkDownload && readTd && checkTd && readTd.nextElementSibling !== checkTd) {
          tr.insertBefore(readTd, checkTd);
        }

        if (settings.highlightNew && readTd) {
          readTd.innerHTML = "";
          if (!downloadedSet.has(url)) {
            tr.classList.add("kulms-new-file");
            var markBtn = document.createElement("button");
            markBtn.className = "kulms-mark-read-row-btn";
            markBtn.title = t("btnMarkReadRow");
            markBtn.textContent = "既読";
            markBtn.addEventListener("click", function (e) {
              e.preventDefault();
              e.stopPropagation();
              markAsRead([url]);
            });
            readTd.appendChild(markBtn);
          } else {
            tr.classList.remove("kulms-new-file");
          }
        }

        if (settings.bulkDownload && checkTd) {
          var cb = checkTd.querySelector('input[type="checkbox"]');
          if (!cb) {
            cb = document.createElement("input");
            cb.type = "checkbox";
            cb.addEventListener("change", updateSelectedCount);
            checkTd.appendChild(cb);
          }
          cb.dataset.kulmsUrl = url;
          cb.dataset.kulmsName = getFileName(tr);
          if (!tr.dataset.kulmsRowToggleBound) {
            bindRowCheckboxToggle(tr, cb);
            tr.dataset.kulmsRowToggleBound = "1";
          }
        }
      }

      var fileRows = [];
      table.querySelectorAll("tbody tr").forEach(function (tr) {
        if (isFolderRow(tr)) {
          ensureFolderRowPlaceholderCols(tr);
          return;
        }

        var url = getFileUrl(tr);
        if (!url) return;
        fileRows.push({ tr: tr, url: url });
        ensureFileRowCols(tr, url);
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
      window.__kulmsRefreshBulkDownload = function () {
        table.querySelectorAll("tbody tr").forEach(function (tr) {
          if (isFolderRow(tr)) {
            ensureFolderRowPlaceholderCols(tr);
            return;
          }
          var url = getFileUrl(tr);
          if (!url) return;

          var alreadyTracked = fileRows.some(function (f) { return f.url === url; });
          if (!alreadyTracked) fileRows.push({ tr: tr, url: url });

          ensureFileRowCols(tr, url);
        });
        updateNewBtn();
        updateSelectedCount();
        kulmsApplyPathIndentToResourceTable(table);
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
    kulmsReorderResourceRowsByPath(table);
    if (!s.folderExpand && !s.autoExpandAll) return;
    initFolderFeatures(s);
  });
})();
