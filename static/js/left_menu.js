function showModal(modalId) { var el = document.getElementById(modalId); if (el) el.style.display = "block"; }
function hideModals() { document.querySelectorAll(".modal").forEach(function(m) { m.style.display = "none"; }); }

function escapeHtml(str) { if (!str) return ""; return str.replace(/[&<>]/g, function(m) { return { '&':'&amp;', '<':'&lt;', '>':'&gt;' }[m]; }); }

var currentOpenPanel = null;
var sortableTop = null;
var sortableSubs = [];
var editorChoiceMode = null;
var editorChoiceOriginalName = null;
var editorChoiceEditId = null;
var editorChoiceEditParentId = null;
var editorChoiceChildren = [];
var expandedParents = {};

function showMenuText(itemId, title) {
    var menuEl = document.querySelector('.side-menu[data-page-type]');
    var pageType = menuEl ? menuEl.dataset.pageType : 'home';
    window.open('/menu/view/' + pageType + '/' + itemId, '_blank');
}

function getApi() {
    return window.LEFT_MENU_API || {};
}

function buildMenuTree(items) {
    var byId = {};
    var roots = [];
    items.forEach(function(it) {
        byId[it.id] = Object.assign({}, it, { children: [] });
    });
    items.forEach(function(it) {
        var node = byId[it.id];
        var pid = (it.parent_id !== undefined && it.parent_id !== null) ? it.parent_id : null;
        if (pid && byId[pid]) {
            byId[pid].children.push(node);
        } else {
            roots.push(node);
        }
    });
    roots.forEach(function(r) {
        r.children.sort(function(a, b) { return (a.sort_order || 0) - (b.sort_order || 0); });
    });
    return roots;
}

function renderLeafItem(item, isChild) {
    var id = item.id;
    var childClass = isChild ? ' sub-child' : '';
    var pid = item.parent_id || '';
    if (item.link && item.link.trim()) {
        var href = item.link.trim();
        return '<div class="menu-item' + childClass + '" data-id="' + id + '" data-has-link="true" data-parent-id="' + pid + '">' +
               '<a href="' + escapeHtml(href) + '" class="menu-link" ' + (href.startsWith('http') ? 'target="_blank" rel="noopener noreferrer"' : '') + '>' + escapeHtml(item.letter) + '</a>' +
               (window.isAdmin ? '<div class="menu-actions"><button class="edit-menu-btn" data-id="' + id + '" title="Редактировать">✎</button><button class="delete-menu-btn" data-id="' + id + '" title="Удалить">✖</button></div>' : '') +
               '</div>';
    }
    return '<div class="menu-item' + childClass + '" data-id="' + id + '" data-has-link="false" data-parent-id="' + pid + '">' +
           '<span class="menu-link" style="cursor:pointer;">' + escapeHtml(item.letter) + '</span>' +
           (window.isAdmin ? '<div class="menu-actions"><button class="edit-menu-btn" data-id="' + id + '" title="Редактировать">✎</button><button class="delete-menu-btn" data-id="' + id + '" title="Удалить">✖</button></div>' : '') +
           '</div>';
}

function renderParentItem(item) {
    var id = item.id;
    var isExpanded = !!expandedParents[id];
    var arrow = '<span class="menu-toggle-arrow" title="Развернуть/свернуть">▶</span>';
    var childrenHtml = '<div class="menu-subitems' + (isExpanded ? ' open' : '') + '" data-parent-id="' + id + '">';
    item.children.forEach(function(child) {
        childrenHtml += renderLeafItem(child, true);
    });
    childrenHtml += '</div>';
    return '<div class="menu-item parent-item' + (isExpanded ? ' expanded' : '') + '" data-id="' + id + '" data-has-children="true" data-has-link="false" data-parent-id="' + (item.parent_id || '') + '">' +
           '<span class="menu-link parent-link" style="cursor:pointer;">' + escapeHtml(item.letter) + '</span>' +
           (window.isAdmin ? '<div class="menu-actions"><button class="edit-menu-btn" data-id="' + id + '" title="Редактировать подменю">✎</button><button class="delete-menu-btn" data-id="' + id + '" title="Удалить">✖</button></div>' : '') +
           arrow +
           '</div>' + childrenHtml;
}

async function refreshLeftMenu() {
    var api = getApi();
    var res = await fetch(api.items);
    if (!res.ok) return;
    var items = await res.json();
    var container = document.getElementById('leftMenuContainer');
    if (!container) return;
    destroySortables();
    if (items.length === 0) {
        container.innerHTML = '<div class="empty-menu">Пусто</div>';
    } else {
        var tree = buildMenuTree(items);
        var html = '';
        tree.forEach(function(node) {
            if (node.children && node.children.length > 0) {
                html += renderParentItem(node);
            } else {
                html += renderLeafItem(node, false);
            }
        });
        container.innerHTML = html;

        container.querySelectorAll('.menu-item.parent-item').forEach(function(el) {
            var arrow = el.querySelector('.menu-toggle-arrow');
            var link = el.querySelector('.parent-link');
            function toggle(e) {
                e.preventDefault();
                e.stopPropagation();
                var id = el.dataset.id;
                expandedParents[id] = !expandedParents[id];
                el.classList.toggle('expanded');
                var sub = container.querySelector('.menu-subitems[data-parent-id="' + id + '"]');
                if (sub) sub.classList.toggle('open');
            }
            if (arrow) arrow.addEventListener('click', toggle);
            if (link) link.addEventListener('click', toggle);
        });

        container.querySelectorAll('.menu-item').forEach(function(el) {
            var hasLink = el.dataset.hasLink === 'true';
            var isParent = el.dataset.hasChildren === 'true';
            if (!hasLink && !isParent) {
                var span = el.querySelector('.menu-link');
                if (span) {
                    var itemId = el.dataset.id;
                    var title = span.textContent;
                    span.addEventListener('click', function(e) {
                        e.preventDefault();
                        showMenuText(itemId, title);
                    });
                }
            }
        });

        if (window.isAdmin) {
            initSortables(container, api);
        }
    }
    document.querySelectorAll('.delete-menu-btn').forEach(function(btn) {
        btn.removeEventListener('click', handleMenuDelete);
        btn.addEventListener('click', handleMenuDelete);
    });
    document.querySelectorAll('.edit-menu-btn').forEach(function(btn) {
        btn.removeEventListener('click', handleMenuEdit);
        btn.addEventListener('click', handleMenuEdit);
    });
    syncMobilePanels();
}

function destroySortables() {
    if (sortableTop) { sortableTop.destroy(); sortableTop = null; }
    sortableSubs.forEach(function(s) { try { s.destroy(); } catch(e) {} });
    sortableSubs = [];
}

function initSortables(container, api) {
    var group = { name: 'left-menu', pull: true, put: true };

    function findParentIdOfList(listEl) {
        if (listEl === container) return null;
        var pid = listEl.dataset.parentId;
        return pid ? parseInt(pid) : null;
    }

    function collectAll() {
        var ids = [];
        var parentIds = {};
        container.querySelectorAll('.menu-item').forEach(function(el) {
            var itemId = parseInt(el.dataset.id);
            ids.push(itemId);
            var sub = el.querySelector('.menu-actions');
            parentIds[itemId] = el.dataset.parentId ? parseInt(el.dataset.parentId) : null;
        });
        return { ids: ids, parent_ids: parentIds };
    }

    async function handleDrop(evt) {
        var fromList = evt.from;
        var toList = evt.to;
        var targetParentId = findParentIdOfList(toList);
        var itemEl = evt.item;
        if (targetParentId !== null) {
            itemEl.dataset.parentId = targetParentId;
            itemEl.classList.add('sub-child');
        } else {
            itemEl.dataset.parentId = '';
            itemEl.classList.remove('sub-child');
        }
        var payload = collectAll();
        try {
            await fetch(api.reorder, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } catch (e) {}
        await refreshLeftMenu();
        syncMobilePanels();
    }

    function commonOptions(listEl) {
        return {
            group: group,
            animation: 200,
            handle: '.menu-item',
            draggable: '.menu-item',
            emptyInsertThreshold: 20,
            onEnd: handleDrop
        };
    }

    sortableTop = new Sortable(container, commonOptions(container));

    container.querySelectorAll('.menu-subitems').forEach(function(subList) {
        sortableSubs.push(new Sortable(subList, commonOptions(subList)));
    });
}

async function handleMenuDelete(e) {
    e.stopPropagation();
    var api = getApi();
    var id = e.currentTarget.dataset.id;
    if (!confirm("Удалить пункт?")) return;
    var res = await fetch(api.delete + id, { method: 'POST' });
    var data = await res.json();
    if (data.success) refreshLeftMenu();
    else alert("Ошибка: " + data.message);
}

async function handleMenuEdit(e) {
    e.stopPropagation();
    var id = e.currentTarget.dataset.id;
    var itemEl = document.querySelector('#leftMenuContainer .menu-item[data-id="' + id + '"]');
    var isParent = itemEl && itemEl.dataset.hasChildren === 'true';
    if (isParent) {
        openSubmenuEditModal(id);
        return;
    }
    var menuEl = document.querySelector('.side-menu[data-page-type]');
    var pageType = menuEl ? menuEl.dataset.pageType : 'home';
    window.open('/menu/edit/' + pageType + '/' + id, '_blank');
}

async function openSubmenuEditModal(parentId) {
    var api = getApi();
    var res = await fetch(api.items);
    if (!res.ok) return;
    var items = await res.json();
    var parent = items.find(function(x) { return parseInt(x.id) === parseInt(parentId); });
    if (!parent) return;
    var children = items
        .filter(function(x) { return x.parent_id !== null && x.parent_id !== undefined && parseInt(x.parent_id) === parseInt(parentId); })
        .sort(function(a, b) { return (a.sort_order || 0) - (b.sort_order || 0); });

    editorChoiceEditId = parseInt(parentId);
    editorChoiceEditParentId = parent.parent_id || null;
    editorChoiceChildren = children.slice();

    var modal = document.getElementById('editorChoiceModal');
    var nameInput = document.getElementById('editorChoiceName');
    var submenuSection = document.getElementById('submenuSection');
    var submenuContainer = document.getElementById('submenuInputsContainer');
    var createBtn = document.getElementById('editorChoiceCreate');
    var newBtn = document.getElementById('choiceNewEditor');
    var submenuBtn = document.getElementById('choiceSubmenu');
    var htmlSection = document.getElementById('editorChoiceHtmlSection');

    if (nameInput) nameInput.value = parent.letter || '';
    if (htmlSection) htmlSection.style.display = 'none';
    editorChoiceMode = 'submenu';
    if (newBtn) newBtn.classList.remove('active');
    if (submenuBtn) submenuBtn.classList.add('active');
    if (submenuSection) submenuSection.style.display = 'flex';
    if (createBtn) { createBtn.textContent = 'Готово'; createBtn.disabled = false; }

    if (submenuContainer) {
        submenuContainer.innerHTML = '';
        if (children.length === 0) {
            submenuContainer.innerHTML =
                '<div class="input-group submenu-input-group">' +
                    '<input type="text" class="input submenu-input" placeholder=" " />' +
                    '<label class="user-label">Подпункт 1</label>' +
                '</div>';
        } else {
            children.forEach(function(child, idx) {
                var g = document.createElement('div');
                g.className = 'input-group submenu-input-group';
                g.dataset.childId = child.id;
                g.innerHTML =
                    '<input type="text" class="input submenu-input" placeholder=" " value="' + escapeHtml(child.letter || '') + '" />' +
                    '<label class="user-label">Подпункт ' + (idx + 1) + '</label>';
                submenuContainer.appendChild(g);
            });
            var last = submenuContainer.lastElementChild;
            if (last) {
                var lastInp = last.querySelector('.submenu-input');
                if (lastInp && lastInp.value.trim() !== '') {
                    var g = document.createElement('div');
                    g.className = 'input-group submenu-input-group';
                    g.innerHTML =
                        '<input type="text" class="input submenu-input" placeholder=" " />' +
                        '<label class="user-label">Подпункт ' + (children.length + 1) + '</label>';
                    submenuContainer.appendChild(g);
                }
            }
        }
        bindSubmenuInputs();
    }

    if (modal) {
        modal.classList.add('show');
        modal.style.display = 'block';
    }
    setTimeout(function() {
        var first = submenuContainer ? submenuContainer.querySelector('.submenu-input') : null;
        if (first) first.focus();
    }, 100);
}

function syncMobilePanels() {
    var leftOriginal = document.querySelector('.side-menu');
    var leftContainer = document.getElementById('mobileLeftMenuContainer');
    if (leftOriginal && leftContainer) {
        var clone = leftOriginal.cloneNode(true);
        clone.removeAttribute('id');
        leftContainer.innerHTML = '';
        leftContainer.appendChild(clone);
        var addMenuBtnInPanel = leftContainer.querySelector('.add-menu-btn');
        if (addMenuBtnInPanel) {
            addMenuBtnInPanel.removeEventListener('click', addMenuHandler);
            addMenuBtnInPanel.addEventListener('click', addMenuHandler);
        }
        leftContainer.querySelectorAll('.delete-menu-btn').forEach(function(btn) {
            btn.removeEventListener('click', handleMenuDelete);
            btn.addEventListener('click', handleMenuDelete);
        });
        leftContainer.querySelectorAll('.edit-menu-btn').forEach(function(btn) {
            btn.removeEventListener('click', handleMenuEdit);
            btn.addEventListener('click', handleMenuEdit);
        });
        leftContainer.querySelectorAll('.menu-item.parent-item').forEach(function(el) {
            var arrow = el.querySelector('.menu-toggle-arrow');
            var link = el.querySelector('.parent-link');
            function toggle(e) {
                e.preventDefault();
                e.stopPropagation();
                var id = el.dataset.id;
                expandedParents[id] = !expandedParents[id];
                el.classList.toggle('expanded');
                var sub = leftContainer.querySelector('.menu-subitems[data-parent-id="' + id + '"]');
                if (sub) sub.classList.toggle('open');
            }
            if (arrow) arrow.addEventListener('click', toggle);
            if (link) link.addEventListener('click', toggle);
        });
        leftContainer.querySelectorAll('.menu-item').forEach(function(el) {
            var hasLink = el.dataset.hasLink === 'true';
            var isParent = el.dataset.hasChildren === 'true';
            if (!hasLink && !isParent) {
                var span = el.querySelector('.menu-link');
                if (span) {
                    var itemId = el.dataset.id;
                    var title = span.textContent;
                    span.addEventListener('click', function(e) {
                        e.preventDefault();
                        showMenuText(itemId, title);
                    });
                }
            }
        });
    }
    var rightOriginal = document.querySelector('.extra-info-section');
    var rightContainer = document.getElementById('mobileRightContent');
    if (rightOriginal && rightContainer) {
        var clone2 = rightOriginal.cloneNode(true);
        clone2.removeAttribute('id');
        rightContainer.innerHTML = '';
        rightContainer.appendChild(clone2);
        var addPromoBtnInPanel = rightContainer.querySelector('.add-info-header-btn');
        if (addPromoBtnInPanel) {
            addPromoBtnInPanel.removeEventListener('click', addPromoHandler);
            addPromoBtnInPanel.addEventListener('click', addPromoHandler);
        }
        rightContainer.querySelectorAll('.delete-promo-btn').forEach(function(btn) {
            btn.removeEventListener('click', handlePromoDelete);
            btn.addEventListener('click', handlePromoDelete);
        });
    }
}

function addMenuHandler() { openEditorChoiceModal(); }
function addPromoHandler() { showModal("promoModal"); }

function openPanel(panelId) {
    closePanel();
    var panel = document.getElementById(panelId);
    var overlay = document.getElementById('panelOverlay');
    if (panel) {
        panel.classList.add('open');
        if (overlay) overlay.style.display = 'block';
        currentOpenPanel = panelId;
        syncMobilePanels();
    }
}
function closePanel() {
    var overlay = document.getElementById('panelOverlay');
    if (currentOpenPanel) {
        var panel = document.getElementById(currentOpenPanel);
        if (panel) panel.classList.remove('open');
        currentOpenPanel = null;
    }
    if (overlay) overlay.style.display = 'none';
}

function resetEditorChoice() {
    editorChoiceMode = null;
    editorChoiceOriginalName = null;
    editorChoiceEditId = null;
    editorChoiceEditParentId = null;
    editorChoiceChildren = [];
    var name = document.getElementById('editorChoiceName');
    var preview = document.getElementById('editorChoicePreview');
    var htmlSection = document.getElementById('editorChoiceHtmlSection');
    var submenuSection = document.getElementById('submenuSection');
    var createBtn = document.getElementById('editorChoiceCreate');
    var newBtn = document.getElementById('choiceNewEditor');
    var submenuBtn = document.getElementById('choiceSubmenu');

    if (name) name.value = '';
    if (preview) { preview.textContent = ''; preview.classList.remove('error'); }
    if (htmlSection) htmlSection.style.display = 'none';
    if (submenuSection) submenuSection.style.display = 'none';
    if (createBtn) { createBtn.disabled = true; createBtn.textContent = 'Открыть редактор'; }
    if (newBtn) newBtn.classList.remove('active');
    if (submenuBtn) submenuBtn.classList.remove('active');

    var submenuContainer = document.getElementById('submenuInputsContainer');
    if (submenuContainer) {
        submenuContainer.innerHTML =
            '<div class="input-group submenu-input-group">' +
                '<input type="text" class="input submenu-input" placeholder=" " />' +
                '<label class="user-label">Подпункт 1</label>' +
            '</div>';
        bindSubmenuInputs();
    }
}

function openEditorChoiceModal() {
    resetEditorChoice();
    var modal = document.getElementById('editorChoiceModal');
    if (modal) {
        modal.classList.add('show');
        modal.style.display = 'block';
    }
    setTimeout(function() {
        var name = document.getElementById('editorChoiceName');
        if (name) name.focus();
    }, 100);
}

function closeEditorChoiceModal() {
    var modal = document.getElementById('editorChoiceModal');
    if (modal) {
        modal.classList.remove('show');
        modal.style.display = 'none';
    }
    editorChoiceEditId = null;
    editorChoiceEditParentId = null;
    editorChoiceChildren = [];
}

function updateEditorChoiceCreateButton() {
    var name = document.getElementById('editorChoiceName');
    var createBtn = document.getElementById('editorChoiceCreate');
    if (!name || !createBtn) return;
    var nameOk = name.value.trim().length > 0;
    if (editorChoiceMode === 'new' || editorChoiceMode === 'submenu') {
        createBtn.disabled = !nameOk;
    } else {
        createBtn.disabled = true;
    }
}

function bindSubmenuInputs() {
    var container = document.getElementById('submenuInputsContainer');
    if (!container) return;
    var inputs = container.querySelectorAll('.submenu-input');
    inputs.forEach(function(input) {
        input.removeEventListener('input', handleSubmenuInput);
        input.addEventListener('input', handleSubmenuInput);
    });
    var groups = container.querySelectorAll('.submenu-input-group');
    groups.forEach(function(group, idx) {
        var label = group.querySelector('.user-label');
        if (label) label.textContent = 'Подпункт ' + (idx + 1);
    });
}

function handleSubmenuInput(e) {
    var container = document.getElementById('submenuInputsContainer');
    if (!container) return;

    var groups = Array.from(container.querySelectorAll('.submenu-input-group'));

    for (var i = groups.length - 2; i >= 0; i--) {
        var inp = groups[i].querySelector('.submenu-input');
        if (inp && inp.value.trim() === '') {
            var nextInp = groups[i + 1] ? groups[i + 1].querySelector('.submenu-input') : null;
            if (!nextInp || nextInp.value.trim() === '') {
                groups[i].remove();
            }
        }
    }

    groups = Array.from(container.querySelectorAll('.submenu-input-group'));
    var allFilled = groups.length > 0;
    for (var j = 0; j < groups.length; j++) {
        var gi = groups[j].querySelector('.submenu-input');
        if (!gi || gi.value.trim() === '') { allFilled = false; break; }
    }
    var lastInput = groups.length > 0 ? groups[groups.length - 1].querySelector('.submenu-input') : null;
    if (allFilled && lastInput && lastInput.value.trim() !== '') {
        var newGroup = document.createElement('div');
        newGroup.className = 'input-group submenu-input-group';
        newGroup.innerHTML =
            '<input type="text" class="input submenu-input" placeholder=" " />' +
            '<label class="user-label">Подпункт ' + (groups.length + 1) + '</label>';
        container.appendChild(newGroup);
    }

    bindSubmenuInputs();
}

function collectSubmenuEntries() {
    var container = document.getElementById('submenuInputsContainer');
    if (!container) return [];
    var entries = [];
    container.querySelectorAll('.submenu-input-group').forEach(function(group) {
        var inp = group.querySelector('.submenu-input');
        var v = inp ? inp.value.trim() : '';
        if (!v) return;
        var childId = group.dataset.childId;
        entries.push({ value: v, childId: childId ? parseInt(childId) : null });
    });
    return entries;
}

function createMenuItemWithHtml(name, link, html, editId) {
    var api = getApi();
    var payload = {
        letter: name,
        text: html || '',
        link: link || ''
    };
    var url = editId ? (api.update + editId) : api.add;
    fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(function(r) {
        if (!r.ok) throw new Error('save failed');
        return r.json();
    })
    .then(function(resp) {
        if (resp && resp.success === false) {
            throw new Error(resp.message || 'save failed');
        }
        editorChoiceEditId = null;
        refreshLeftMenu();
    })
    .catch(function(err) {
        var preview = document.getElementById('editorChoicePreview');
        if (preview) {
            preview.textContent = 'Ошибка сохранения: ' + (err && err.message ? err.message : 'попробуйте ещё раз');
            preview.classList.add('error');
        }
    });
}

async function createSubmenuItems(parentName, entries) {
    var api = getApi();
    try {
        var parentId;
        if (editorChoiceEditId) {
            var upd = await fetch(api.update + editorChoiceEditId, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ letter: parentName, text: '', link: '' })
            });
            var updData = await upd.json();
            if (updData && updData.success === false) {
                throw new Error(updData.message || 'Не удалось обновить подменю');
            }
            parentId = editorChoiceEditId;
        } else {
            var parentRes = await fetch(api.add, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ letter: parentName, text: '', link: '', parent_id: editorChoiceEditParentId })
            });
            var parentData = await parentRes.json();
            if (parentData && parentData.success === false) {
                throw new Error(parentData.message || 'Не удалось создать подменю');
            }
            parentId = parentData.item ? parentData.item.id : null;
        }
        if (parentId) expandedParents[parentId] = true;

        var existingIds = editorChoiceChildren.map(function(c) { return parseInt(c.id); });
        var keptIds = [];

        for (var i = 0; i < entries.length; i++) {
            var entry = entries[i];
            if (entry.childId && existingIds.indexOf(entry.childId) !== -1) {
                await fetch(api.update + entry.childId, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ letter: entry.value, text: '', link: '' })
                });
                keptIds.push(entry.childId);
            } else {
                var subRes = await fetch(api.add, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        letter: entry.value,
                        text: '',
                        link: '',
                        parent_id: parentId
                    })
                });
                var subData = await subRes.json();
                if (subData && subData.success === false) {
                    console.warn('Не удалось создать подпункт:', entry.value, subData.message);
                } else if (subData && subData.item) {
                    keptIds.push(parseInt(subData.item.id));
                }
            }
        }

        for (var k = 0; k < existingIds.length; k++) {
            if (keptIds.indexOf(existingIds[k]) === -1) {
                await fetch(api.delete + existingIds[k], { method: 'POST' });
            }
        }

        refreshLeftMenu();
    } catch (err) {
        var preview = document.getElementById('editorChoicePreview');
        if (preview) {
            preview.textContent = 'Ошибка сохранения подменю: ' + (err && err.message ? err.message : 'попробуйте ещё раз');
            preview.classList.add('error');
        }
    }
}

function closeNewEditorModal() {
    var modal = document.getElementById('newEditorModal');
    var frame = document.getElementById('newEditorFrame');
    var saveBtn = document.getElementById('newEditorSave');
    if (modal) {
        modal.classList.remove('show');
        modal.style.display = 'none';
    }
    if (frame) frame.src = 'about:blank';
    if (saveBtn) saveBtn.style.display = '';
    editorChoiceMode = null;
}

function openNewEditor(name, initialHtml) {
    var frame = document.getElementById('newEditorFrame');
    var modal = document.getElementById('newEditorModal');
    var titleEl = document.getElementById('newEditorTitle');
    var saveBtn = document.getElementById('newEditorSave');
    if (!frame || !modal) return;
    if (titleEl) titleEl.textContent = 'Новый редактор — ' + name;
    if (saveBtn) saveBtn.style.display = '';
    frame.src = '/text_redactor?admin=1';
    modal.classList.add('show');
    modal.style.display = 'flex';
    editorChoiceOriginalName = name;
    editorChoiceMode = 'new';

    frame.onload = function() {
        try {
            var win = frame.contentWindow;
            setTimeout(function() {
                try {
                    if (win.VD5Editor) win.VD5Editor.setEditing(true);
                    if (initialHtml && initialHtml.trim()) {
                        win.postMessage({ type: 'setContent', html: initialHtml }, '*');
                    } else {
                        win.postMessage({ type: 'clearContent' }, '*');
                    }
                } catch (e) {}
            }, 300);
        } catch (e) {}
    };
}

function saveNewEditorContent() {
    var name = editorChoiceOriginalName;
    if (!name) {
        closeNewEditorModal();
        return;
    }
    var frame = document.getElementById('newEditorFrame');
    var content = '';
    try {
        var win = frame.contentWindow;
        if (win && win.VD5Editor) {
            content = win.VD5Editor.getHTML();
        } else {
            var doc = frame.contentDocument || win.document;
            if (doc) {
                var editorEl = doc.getElementById('editor');
                if (editorEl) content = editorEl.innerHTML;
            }
        }
    } catch (e) {
        content = '';
    }
    if (!content || !content.trim()) {
        alert('Редактор пуст. Добавьте содержимое.');
        return;
    }
    var editId = editorChoiceEditId;
    createMenuItemWithHtml(name, '', content, editId);
    closeNewEditorModal();
}

function initEditorChoiceHandlers() {
    var nameInput = document.getElementById('editorChoiceName');
    var createBtn = document.getElementById('editorChoiceCreate');
    var cancelBtn = document.getElementById('editorChoiceCancel');
    var choiceNew = document.getElementById('choiceNewEditor');
    var choiceSubmenu = document.getElementById('choiceSubmenu');
    var choiceModal = document.getElementById('editorChoiceModal');
    var newEditorCancelBtn = document.getElementById('newEditorCancel');
    var newEditorSaveBtn = document.getElementById('newEditorSave');
    var submenuSection = document.getElementById('submenuSection');

    if (nameInput) nameInput.addEventListener('input', updateEditorChoiceCreateButton);

    if (choiceNew) {
        choiceNew.addEventListener('click', function() {
            editorChoiceMode = 'new';
            editorChoiceEditId = null;
            editorChoiceEditParentId = null;
            editorChoiceChildren = [];
            choiceNew.classList.add('active');
            if (choiceSubmenu) choiceSubmenu.classList.remove('active');
            if (submenuSection) submenuSection.style.display = 'none';
            if (createBtn) {
                createBtn.textContent = 'Открыть редактор';
                createBtn.disabled = !nameInput || nameInput.value.trim().length === 0;
            }
        });
    }

    if (choiceSubmenu) {
        choiceSubmenu.addEventListener('click', function() {
            editorChoiceMode = 'submenu';
            choiceSubmenu.classList.add('active');
            if (choiceNew) choiceNew.classList.remove('active');
            if (submenuSection) submenuSection.style.display = 'flex';
            if (createBtn) {
                createBtn.textContent = 'Готово';
                createBtn.disabled = !nameInput || nameInput.value.trim().length === 0;
            }
            bindSubmenuInputs();
            setTimeout(function() {
                var firstInput = document.querySelector('#submenuInputsContainer .submenu-input');
                if (firstInput) firstInput.focus();
            }, 100);
        });
    }

    if (cancelBtn) cancelBtn.addEventListener('click', closeEditorChoiceModal);

    if (choiceModal) {
        choiceModal.addEventListener('mousedown', function(e) {
            if (e.target === choiceModal) closeEditorChoiceModal();
        });
    }

    if (createBtn) {
        createBtn.addEventListener('click', function() {
            var name = nameInput ? nameInput.value.trim() : '';
            if (!name) return;

            if (editorChoiceMode === 'new') {
                var menuEl = document.querySelector('.side-menu[data-page-type]');
                var pageType = menuEl ? menuEl.dataset.pageType : 'home';
                var url = '/menu/new/' + pageType + '?title=' + encodeURIComponent(name);
                window.open(url, '_blank');
                closeEditorChoiceModal();
            } else if (editorChoiceMode === 'submenu') {
                var entries = collectSubmenuEntries();
                createSubmenuItems(name, entries).then(function() {
                    closeEditorChoiceModal();
                });
            }
        });
    }

    if (newEditorCancelBtn) newEditorCancelBtn.addEventListener('click', closeNewEditorModal);
    if (newEditorSaveBtn) newEditorSaveBtn.addEventListener('click', saveNewEditorContent);
}

document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll(".close").forEach(function(btn) { btn.onclick = hideModals; });
    window.onclick = function(e) { if (e.target.classList.contains("modal")) hideModals(); };

    initEditorChoiceHandlers();

    var addLeftBtn = document.getElementById("addLeftMenuBtn");
    if (addLeftBtn) {
        addLeftBtn.addEventListener("click", function(e) {
            e.preventDefault();
            e.stopPropagation();
            openEditorChoiceModal();
        });
    }

    var submitLeft = document.getElementById("submitLeftMenu");
    if (submitLeft) {
        submitLeft.addEventListener("click", async function() {
            var api = getApi();
            var letter = document.getElementById("menuLetter").value.trim();
            var text = document.getElementById("menuText").value;
            var link = document.getElementById("menuLink").value.trim();
            if (!letter) return alert("Заполните название");
            if (link && !link.startsWith('http://') && !link.startsWith('https://') && !link.startsWith('/') && !link.startsWith('#')) {
                link = '/' + link;
            }
            var res = await fetch(api.add, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ letter: letter, text: text, link: link })
            });
            var data = await res.json();
            if (data.success) {
                hideModals();
                document.getElementById("menuLetter").value = "";
                document.getElementById("menuText").value = "";
                document.getElementById("menuLink").value = "";
                refreshLeftMenu();
            } else alert("Ошибка: " + data.message);
        });
    }

    var submitEdit = document.getElementById("submitEditMenu");
    if (submitEdit) {
        submitEdit.addEventListener("click", async function() {
            var api = getApi();
            var id = document.getElementById("editMenuId").value;
            var letter = document.getElementById("editMenuLetter").value.trim();
            var text = document.getElementById("editMenuText").value;
            var link = document.getElementById("editMenuLink").value.trim();
            if (!letter) return alert("Заполните название");
            if (link && !link.startsWith('http://') && !link.startsWith('https://') && !link.startsWith('/') && !link.startsWith('#')) {
                link = '/' + link;
            }
            var res = await fetch(api.update + id, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ letter: letter, text: text, link: link })
            });
            var data = await res.json();
            if (data.success) {
                hideModals();
                refreshLeftMenu();
            } else alert("Ошибка: " + data.message);
        });
    }

    var mobileLeft = document.getElementById('mobileLeftBtn');
    if (mobileLeft) mobileLeft.addEventListener('click', function() { openPanel('mobileLeftPanel'); });
    var panelOverlay = document.getElementById('panelOverlay');
    if (panelOverlay) panelOverlay.addEventListener('click', closePanel);
    document.querySelectorAll('.close-panel-btn').forEach(function(btn) {
        btn.addEventListener('click', function(e) { closePanel(); });
    });

    refreshLeftMenu();
});
