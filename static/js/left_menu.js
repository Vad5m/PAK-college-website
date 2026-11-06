function showModal(modalId) { var el = document.getElementById(modalId); if (el) el.style.display = "block"; }
function hideModals() { document.querySelectorAll(".modal").forEach(function(m) { m.style.display = "none"; }); }

function escapeHtml(str) { if (!str) return ""; return str.replace(/[&<>]/g, function(m) { return { '&':'&amp;', '<':'&lt;', '>':'&gt;' }[m]; }); }

var currentOpenPanel = null;
var sortableInstance = null;
var editorChoiceMode = null;
var editorChoiceOriginalName = null;
var editorChoiceEditId = null;

function showMenuText(itemId, title) {
    var menuEl = document.querySelector('.side-menu[data-page-type]');
    var pageType = menuEl ? menuEl.dataset.pageType : 'home';
    window.open('/menu/view/' + pageType + '/' + itemId, '_blank');
}

function getApi() {
    return window.LEFT_MENU_API || {};
}

async function refreshLeftMenu() {
    var api = getApi();
    var res = await fetch(api.items);
    if (!res.ok) return;
    var items = await res.json();
    var container = document.getElementById('leftMenuContainer');
    if (!container) return;
    if (items.length === 0) {
        container.innerHTML = '<div class="empty-menu">Пусто</div>';
        if (sortableInstance) sortableInstance.destroy();
        sortableInstance = null;
    } else {
        var html = '';
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            if (item.link && item.link.trim()) {
                var href = item.link.trim();
                html += '<div class="menu-item" data-id="' + item.id + '" data-has-link="true">' +
                        '<a href="' + escapeHtml(href) + '" class="menu-link" ' + (href.startsWith('http') ? 'target="_blank" rel="noopener noreferrer"' : '') + '>' + escapeHtml(item.letter) + '</a>' +
                        (window.isAdmin ? '<div class="menu-actions"><button class="edit-menu-btn" data-id="' + item.id + '" title="Редактировать">✎</button><button class="delete-menu-btn" data-id="' + item.id + '" title="Удалить">✖</button></div>' : '') +
                        '</div>';
            } else {
                html += '<div class="menu-item" data-id="' + item.id + '" data-has-link="false">' +
                        '<span class="menu-link" style="cursor:pointer;">' + escapeHtml(item.letter) + '</span>' +
                        (window.isAdmin ? '<div class="menu-actions"><button class="edit-menu-btn" data-id="' + item.id + '" title="Редактировать">✎</button><button class="delete-menu-btn" data-id="' + item.id + '" title="Удалить">✖</button></div>' : '') +
                        '</div>';
            }
        }
        container.innerHTML = html;
        document.querySelectorAll('#leftMenuContainer .menu-item').forEach(function(el) {
            var hasLink = el.dataset.hasLink === 'true';
            if (!hasLink) {
                var span = el.querySelector('.menu-link');
                var itemId = el.dataset.id;
                var title = span ? span.textContent : '';
                span.addEventListener('click', function(e) {
                    e.preventDefault();
                    showMenuText(itemId, title);
                });
            }
        });
        if (window.isAdmin) {
            document.querySelectorAll('#leftMenuContainer .menu-item').forEach(function(el) {
                el.classList.add('draggable');
            });
            if (sortableInstance) sortableInstance.destroy();
            sortableInstance = new Sortable(container, {
                animation: 200,
                handle: '.menu-item',
                onEnd: async function() {
                    var ids = Array.from(document.querySelectorAll('#leftMenuContainer .menu-item')).map(function(el) { return parseInt(el.dataset.id); });
                    if (ids.length) {
                        await fetch(api.reorder, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ ids: ids })
                        });
                        syncMobilePanels();
                    }
                }
            });
        } else if (sortableInstance) { sortableInstance.destroy(); sortableInstance = null; }
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
    window.open('/left_menu/edit/' + id, '_blank');
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
        leftContainer.querySelectorAll('.menu-item').forEach(function(el) {
            var hasLink = el.dataset.hasLink === 'true';
            if (!hasLink) {
                var span = el.querySelector('.menu-link');
                var itemId = el.dataset.id;
                var title = span ? span.textContent : '';
                span.addEventListener('click', function(e) {
                    e.preventDefault();
                    showMenuText(itemId, title);
                });
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
    var name = document.getElementById('editorChoiceName');
    var link = document.getElementById('editorChoiceLink');
    var html = document.getElementById('editorChoiceHtml');
    var preview = document.getElementById('editorChoicePreview');
    var htmlSection = document.getElementById('editorChoiceHtmlSection');
    var createBtn = document.getElementById('editorChoiceCreate');
    var newBtn = document.getElementById('choiceNewEditor');
    var htmlBtn = document.getElementById('choiceHtmlEditor');
    if (name) name.value = '';
    if (link) link.value = '';
    if (html) html.value = '';
    if (preview) { preview.textContent = ''; preview.classList.remove('error'); }
    if (htmlSection) htmlSection.style.display = 'none';
    if (createBtn) { createBtn.disabled = true; createBtn.textContent = 'Создать'; }
    if (newBtn) newBtn.classList.remove('active');
    if (htmlBtn) htmlBtn.classList.remove('active');
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
}

function updateEditorChoiceCreateButton() {
    var name = document.getElementById('editorChoiceName');
    var createBtn = document.getElementById('editorChoiceCreate');
    if (!name || !createBtn) return;
    var nameOk = name.value.trim().length > 0;
    if (editorChoiceMode === 'html' || editorChoiceMode === 'new' || editorChoiceMode === 'edit') {
        createBtn.disabled = !nameOk;
    } else {
        createBtn.disabled = true;
    }
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
    var linkInput = document.getElementById('editorChoiceLink');
    var link = linkInput ? linkInput.value.trim() : '';
    var editId = editorChoiceEditId;
    createMenuItemWithHtml(name, link, content, editId);
    closeNewEditorModal();
}

function initEditorChoiceHandlers() {
    var nameInput = document.getElementById('editorChoiceName');
    var linkInput = document.getElementById('editorChoiceLink');
    var htmlInput = document.getElementById('editorChoiceHtml');
    var preview = document.getElementById('editorChoicePreview');
    var htmlSection = document.getElementById('editorChoiceHtmlSection');
    var createBtn = document.getElementById('editorChoiceCreate');
    var cancelBtn = document.getElementById('editorChoiceCancel');
    var choiceNew = document.getElementById('choiceNewEditor');
    var choiceHtml = document.getElementById('choiceHtmlEditor');
    var choiceModal = document.getElementById('editorChoiceModal');
    var newEditorCancelBtn = document.getElementById('newEditorCancel');
    var newEditorSaveBtn = document.getElementById('newEditorSave');

    if (nameInput) nameInput.addEventListener('input', updateEditorChoiceCreateButton);

    if (choiceNew) {
        choiceNew.addEventListener('click', function() {
            editorChoiceMode = 'new';
            if (choiceNew) choiceNew.classList.add('active');
            if (choiceHtml) choiceHtml.classList.remove('active');
            if (htmlSection) htmlSection.style.display = 'none';
            if (createBtn) {
                createBtn.textContent = 'Открыть редактор';
                createBtn.disabled = !nameInput || nameInput.value.trim().length === 0;
            }
        });
    }

    if (choiceHtml) {
        choiceHtml.addEventListener('click', function() {
            editorChoiceMode = 'html';
            if (choiceHtml) choiceHtml.classList.add('active');
            if (choiceNew) choiceNew.classList.remove('active');
            if (htmlSection) htmlSection.style.display = 'block';
            if (createBtn) {
                createBtn.textContent = 'Создать';
                createBtn.disabled = !nameInput || nameInput.value.trim().length === 0;
            }
            setTimeout(function() { if (htmlInput) htmlInput.focus(); }, 100);
        });
    }

    if (linkInput) {
        linkInput.addEventListener('input', function() {
            if (editorChoiceMode === 'html' && preview) {
                var link = linkInput.value.trim();
                if (link) {
                    preview.textContent = 'При клике будет переход по ссылке: ' + link;
                    preview.classList.remove('error');
                } else {
                    preview.textContent = '';
                }
            }
        });
    }

    if (htmlInput) {
        htmlInput.addEventListener('input', function() {
            if (editorChoiceMode === 'html' && preview) {
                var htmlVal = htmlInput.value.trim();
                var linkVal = linkInput ? linkInput.value.trim() : '';
                if (htmlVal && !linkVal) {
                    preview.textContent = 'При клике будет показан HTML-текст (' + htmlVal.length + ' символов)';
                    preview.classList.remove('error');
                } else if (!htmlVal && !linkVal) {
                    preview.textContent = 'Заполните ссылку или HTML-текст';
                    preview.classList.add('error');
                }
            }
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
                var initialHtml = '';
                if (editorChoiceEditId) {
                    initialHtml = htmlInput ? htmlInput.value : '';
                }
                closeEditorChoiceModal();
                openNewEditor(name, initialHtml);
            } else if (editorChoiceMode === 'html' || editorChoiceMode === 'edit') {
                var link = linkInput ? linkInput.value.trim() : '';
                var htmlVal = htmlInput ? htmlInput.value.trim() : '';
                if (!link && !htmlVal) {
                    if (preview) {
                        preview.textContent = 'Заполните ссылку или HTML-текст';
                        preview.classList.add('error');
                    }
                    return;
                }
                var editId = editorChoiceEditId;
                createMenuItemWithHtml(name, link, htmlVal, editId);
                closeEditorChoiceModal();
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
