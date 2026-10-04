function showModal(modalId) { var el = document.getElementById(modalId); if (el) el.style.display = "block"; }
function hideModals() { document.querySelectorAll(".modal").forEach(function(m) { m.style.display = "none"; }); }

var currentOffset = 0;
var limit = 10;
var totalNews = 0;
var isLoading = false;
var allLoaded = false;

function showToast(msg) {
    var toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;bottom:30px;left:50%;transform:translateX(-50%);background:#0b3b5f;color:#fff;padding:12px 24px;border-radius:30px;font-size:0.9rem;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.2);animation:fadeInOut 2s ease forwards;';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(function() { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 2500);
}

function escapeHtml(str) { if (!str) return ""; return str.replace(/[&<>]/g, function(m) { return { '&':'&amp;', '<':'&lt;', '>':'&gt;' }[m]; }); }

// ===== КНОПКА ПОДЕЛИТЬСЯ =====
function attachShareHandlers() {
    document.querySelectorAll('.share-overlay-btn').forEach(function(btn) {
        btn.removeEventListener('click', shareHandler);
        btn.addEventListener('click', shareHandler);
    });
}

function shareHandler(e) {
    e.stopPropagation();
    e.preventDefault();
    var btn = e.currentTarget;
    var newsId = btn.dataset.id;
    var title = btn.dataset.title || 'Новость';
    var url = window.location.origin + '/news/' + newsId;
    if (navigator.share) {
        navigator.share({ title: title, text: title, url: url }).catch(function(err) {});
    } else {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(function() {
                showToast('Ссылка скопирована!');
            }).catch(function() { fallbackCopy(url); });
        } else {
            fallbackCopy(url);
        }
    }
}

function fallbackCopy(text) {
    var textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    try { document.execCommand('copy'); showToast('Ссылка скопирована!'); } catch (err) { alert('Скопируйте ссылку: ' + text); }
    document.body.removeChild(textarea);
}

// ===== ПОСТРОЕНИЕ КОЛЛАЖА =====
function buildMediaCollage(mediaUrls, title, newsId) {
    if (!mediaUrls || mediaUrls.length === 0) {
        return '<div class="news-title">' + escapeHtml(title) + '</div>';
    }
    var count = mediaUrls.length;
    var countClass = count === 1 ? 'count-1' :
                    count === 2 ? 'count-2' :
                    count === 3 ? 'count-3' :
                    count === 4 ? 'count-4' :
                    'count-many';

    var shareBtn = `
        <button class="share-overlay-btn" data-id="${newsId}" data-title="${escapeHtml(title).replace(/"/g, '&quot;')}" title="Поделиться">
            <svg viewBox="0 0 24 24">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                <polyline points="16 6 12 2 8 6"/>
                <line x1="12" y1="2" x2="12" y2="15"/>
            </svg>
        </button>
    `;

    var html = '<div class="gallery-with-title">' + shareBtn + '<div class="news-media-grid ' + countClass + '">';
    var mainUrl = mediaUrls[0];
    var isMainVideo = /\.(mp4|mov|avi|mkv)$/i.test(mainUrl);
    html += '<div class="main-media" data-url="' + escapeHtml(mainUrl) + '">';
    html += isMainVideo ? '<video controls src="' + escapeHtml(mainUrl) + '"></video>' : '<img src="' + escapeHtml(mainUrl) + '" alt="Изображение" loading="lazy">';
    html += '</div>';

    if (count > 1) {
        html += '<div class="side-grid">';
        var maxSide = (count === 4 || count > 4) ? 4 : count - 1;
        for (var i = 1; i <= maxSide && i < mediaUrls.length; i++) {
            var url = mediaUrls[i];
            if (!url) continue;
            var isVideo = /\.(mp4|mov|avi|mkv)$/i.test(url);
            html += '<div class="media-item" data-url="' + escapeHtml(url) + '">';
            html += isVideo ? '<video controls src="' + escapeHtml(url) + '"></video>' : '<img src="' + escapeHtml(url) + '" alt="Изображение" loading="lazy">';
            html += '</div>';
        }
        html += '</div>';
    }
    html += '</div><div class="overlay-title">' + escapeHtml(title) + '</div></div>';
    return html;
}

function buildNewsItem(item) {
    var wrapper = document.createElement("div");
    wrapper.className = "news-item";
    wrapper.dataset.id = item.id;

    var mediaUrls = [];
    if (item.media) {
        mediaUrls = item.media.split(";").filter(function(u) { return u.trim() !== ''; });
    }

    var galleryHtml = buildMediaCollage(mediaUrls, item.title, item.id);
    var titleLink = '<a href="/news/' + item.id + '" class="news-title-link">' + escapeHtml(item.title) + '</a>';
    var fullContent = escapeHtml(item.content);
    var shortContent = fullContent.length > 200 ? fullContent.slice(0, 200) + '...' : fullContent;
    var readMoreHtml = fullContent.length > 200 ? '<button class="read-more-btn">Читать далее</button>' : '';

    var authorDisplay = window.isAdmin ? '👤 ' + escapeHtml(item.author_name || 'Администратор') + ' &nbsp;|&nbsp; ' + (item.created_date || '').slice(0, 10) : (item.created_date || '').slice(0, 10);

    var actionsHtml = window.isAdmin ? '<div class="news-actions"><button class="edit-news-btn" data-id="' + item.id + '">Редактировать</button><button class="delete-news-btn" data-id="' + item.id + '">Удалить</button></div>' : '';

    wrapper.innerHTML = galleryHtml + titleLink +
        '<div class="news-content" data-fulltext="' + fullContent.replace(/"/g, '&quot;') + '">' +
        '<span class="short-text">' + shortContent + '</span>' +
        '<span class="full-text" style="display: none;">' + fullContent + '</span>' +
        readMoreHtml + '</div>' +
        '<div class="news-date"><span>' + authorDisplay + '</span><div style="display:flex;align-items:center;gap:8px;">' + actionsHtml + '</div></div>';

    return wrapper;
}

function appendNewsItems(items) {
    var list = document.getElementById("newsList");
    if (!list) return;
    var empty = list.querySelector(".empty-news");
    if (empty) empty.remove();
    items.forEach(function(item) {
        var el = buildNewsItem(item);
        list.appendChild(el);
    });
    attachDeleteHandlers();
    attachEditHandlers();
    attachReadMoreHandlers();
    attachLightboxToNews();
    attachShareHandlers();
}

// ===== УДАЛЕНИЕ НОВОСТИ =====
function attachDeleteHandlers() {
    document.querySelectorAll(".delete-news-btn").forEach(function(btn) {
        btn.removeEventListener("click", handleDeleteClick);
        btn.addEventListener("click", handleDeleteClick);
    });
}
async function handleDeleteClick(e) {
    e.stopPropagation();
    var newsId = e.currentTarget.dataset.id;
    if (!confirm("Удалить новость?")) return;
    var res = await fetch("/admin/delete_news/" + newsId, { method: "POST" });
    var data = await res.json();
    if (data.success) {
        var item = document.querySelector('.news-item[data-id="' + newsId + '"]');
        if (item) item.remove();
        totalNews--;
        if (document.querySelectorAll(".news-item").length === 0) {
            var list = document.getElementById("newsList");
            if (list) list.innerHTML = '<div class="empty-news">Пусто</div>';
            var btn = document.getElementById("loadMoreNewsBtn");
            if (btn) btn.style.display = "none";
        }
        syncMobilePanels();
    } else alert("Ошибка: " + data.message);
}

// ===== РЕДАКТИРОВАНИЕ НОВОСТИ =====
function attachEditHandlers() {
    document.querySelectorAll(".edit-news-btn").forEach(function(btn) {
        btn.removeEventListener("click", handleEditClick);
        btn.addEventListener("click", handleEditClick);
    });
}

async function handleEditClick(e) {
    e.stopPropagation();
    var newsId = e.currentTarget.dataset.id;
    try {
        var res = await fetch("/api/news/" + newsId);
        var data = await res.json();
        if (data.success) {
            var news = data.news;
            document.getElementById("editNewsId").value = newsId;
            document.getElementById("newsModalTitle").textContent = "Редактировать новость";
            document.getElementById("newsTitle").value = news.title || "";
            document.getElementById("newsContent").value = news.content || "";
            if (news.created_date) {
                var dateObj = new Date(news.created_date);
                var year = dateObj.getFullYear();
                var month = String(dateObj.getMonth()+1).padStart(2, '0');
                var day = String(dateObj.getDate()).padStart(2, '0');
                document.getElementById("newsDate").value = year + '-' + month + '-' + day;
            } else {
                document.getElementById("newsDate").value = new Date().toISOString().split('T')[0];
            }
            selectedNewsFiles = [];
            updateNewsPreview();
            if (document.getElementById("newsMediaFile")) {
                document.getElementById("newsMediaFile").value = "";
            }
            if (news.media) {
                var mediaUrls = news.media.split(";").filter(function(u) { return u.trim() !== ''; });
                var container = document.getElementById("newsPreviewContainer");
                if (container) {
                    container.innerHTML = "";
                    for (var i = 0; i < mediaUrls.length; i++) {
                        var url = mediaUrls[i];
                        var div = document.createElement("div");
                        div.className = "preview-item";
                        var isVideo = /\.(mp4|mov|avi|mkv)$/i.test(url);
                        if (isVideo) {
                            var video = document.createElement("video");
                            video.src = url;
                            video.controls = true;
                            div.appendChild(video);
                        } else {
                            var img = document.createElement("img");
                            img.src = url;
                            div.appendChild(img);
                        }
                        var rm = document.createElement("div");
                        rm.className = "remove-file";
                        rm.innerHTML = "×";
                        rm.dataset.mediaUrl = url;
                        rm.onclick = function(e) {
                            e.stopPropagation();
                            var item = e.currentTarget.closest('.preview-item');
                            if (item) item.remove();
                        };
                        div.appendChild(rm);
                        container.appendChild(div);
                    }
                }
            }
            document.getElementById("submitNews").textContent = "Сохранить изменения";
            showModal("newsModal");
        } else {
            alert("Ошибка загрузки новости: " + data.message);
        }
    } catch (err) {
        console.error(err);
        alert("Ошибка загрузки новости");
    }
}

async function loadNews(offset) {
    if (isLoading) return;
    if (allLoaded) return;
    isLoading = true;
    var url = "/api/news?offset=" + offset + "&limit=" + limit;
    try {
        var res = await fetch(url);
        var data = await res.json();
        if (data.success) {
            totalNews = data.total;
            if (data.news.length > 0) {
                appendNewsItems(data.news);
                currentOffset = offset + data.news.length;
                var btn = document.getElementById("loadMoreNewsBtn");
                if (currentOffset >= totalNews) {
                    allLoaded = true;
                    if (btn) btn.style.display = "none";
                } else {
                    allLoaded = false;
                    if (btn) btn.style.display = "inline";
                }
            } else {
                if (offset === 0) {
                    var list = document.getElementById("newsList");
                    if (list) list.innerHTML = '<div class="empty-news">Пусто</div>';
                    var btn2 = document.getElementById("loadMoreNewsBtn");
                    if (btn2) btn2.style.display = "none";
                } else {
                    allLoaded = true;
                    var btn3 = document.getElementById("loadMoreNewsBtn");
                    if (btn3) btn3.style.display = "none";
                }
            }
        } else {
            alert("Ошибка загрузки новостей");
        }
    } catch (e) {
        console.error(e);
    }
    isLoading = false;
}

function attachReadMoreHandlers() {
    document.querySelectorAll('.read-more-btn').forEach(function(btn) {
        btn.removeEventListener('click', readMoreHandler);
        btn.addEventListener('click', readMoreHandler);
    });
}
function readMoreHandler(e) {
    var btn = e.currentTarget;
    var contentDiv = btn.closest('.news-content');
    var shortSpan = contentDiv.querySelector('.short-text');
    var fullSpan = contentDiv.querySelector('.full-text');
    if (fullSpan.style.display === 'none') {
        shortSpan.style.display = 'none';
        fullSpan.style.display = 'inline';
        btn.textContent = 'Скрыть';
    } else {
        shortSpan.style.display = 'inline';
        fullSpan.style.display = 'none';
        btn.textContent = 'Читать далее';
    }
}

// ===== ПРОМО-БЛОКИ =====
if (document.getElementById("addPromoBtn")) {
    var selectedPromoFile = null;

    // Переключение между типами контента
    document.querySelectorAll('input[name="promoContentType"]').forEach(function(radio) {
        radio.addEventListener('change', function() {
            var isImage = this.value === 'image';
            var imageSection = document.getElementById('promoImageSection');
            var htmlSection = document.getElementById('promoHtmlSection');
            if (imageSection) imageSection.style.display = isImage ? 'block' : 'none';
            if (htmlSection) htmlSection.style.display = isImage ? 'none' : 'block';
        });
    });

    function updatePromoPreview() {
        var container = document.getElementById("promoPreviewContainer");
        if (!container) return;
        container.innerHTML = "";
        if (!selectedPromoFile) return;
        var div = document.createElement("div");
        div.className = "preview-item";
        var isVideo = selectedPromoFile.type.startsWith("video/");
        if (isVideo) {
            var video = document.createElement("video");
            video.src = URL.createObjectURL(selectedPromoFile);
            video.controls = true;
            div.appendChild(video);
        } else {
            var img = document.createElement("img");
            img.src = URL.createObjectURL(selectedPromoFile);
            div.appendChild(img);
        }
        var rm = document.createElement("div");
        rm.className = "remove-file";
        rm.innerHTML = "×";
        rm.onclick = function(e) { e.stopPropagation(); selectedPromoFile = null; updatePromoPreview(); updatePromoFileInput(); };
        div.appendChild(rm);
        container.appendChild(div);
    }

    function updatePromoFileInput() {
        var dt = new DataTransfer();
        if (selectedPromoFile) dt.items.add(selectedPromoFile);
        var input = document.getElementById("promoMediaFile");
        if (input) input.files = dt.files;
    }

    var promoDragArea = document.getElementById("promoDragDropArea");
    var promoFileInput = document.getElementById("promoMediaFile");
    if (promoFileInput) {
        promoFileInput.addEventListener("change", function(e) {
            if (e.target.files.length) selectedPromoFile = e.target.files[0];
            else selectedPromoFile = null;
            updatePromoPreview();
        });
    }
    if (promoDragArea) {
        promoDragArea.addEventListener("dragover", function(e) { e.preventDefault(); promoDragArea.classList.add("drag-over"); });
        promoDragArea.addEventListener("dragleave", function() { promoDragArea.classList.remove("drag-over"); });
        promoDragArea.addEventListener("drop", function(e) {
            e.preventDefault();
            promoDragArea.classList.remove("drag-over");
            if (e.dataTransfer.files.length) selectedPromoFile = e.dataTransfer.files[0];
            updatePromoPreview();
            updatePromoFileInput();
        });
        promoDragArea.addEventListener("click", function() { if (promoFileInput) promoFileInput.click(); });
    }

    document.getElementById("addPromoBtn").onclick = function() {
        selectedPromoFile = null;
        updatePromoPreview();
        if (promoFileInput) promoFileInput.value = "";
        document.getElementById("promoTitle").value = "";
        document.getElementById("promoLink").value = "";
        document.getElementById("promoHtmlContent").value = "";
        document.querySelector('input[name="promoContentType"][value="image"]').checked = true;
        document.getElementById('promoImageSection').style.display = 'block';
        document.getElementById('promoHtmlSection').style.display = 'none';
        showModal("promoModal");
    };

    document.getElementById("submitPromo").onclick = async function() {
        var contentType = document.querySelector('input[name="promoContentType"]:checked').value;
        var title = document.getElementById("promoTitle").value.trim();
        var link = document.getElementById("promoLink").value.trim();
        var formData = new FormData();

        console.log('Выбран тип:', contentType);

        if (contentType === 'image') {
            if (!selectedPromoFile) {
                alert("Выберите изображение или видео");
                return;
            }
            formData.append("type", "media");
            formData.append("media_file", selectedPromoFile);
            formData.append("content", title);
            formData.append("html_content", "");
        } else {
            var htmlContent = document.getElementById("promoHtmlContent").value.trim();
            if (!htmlContent) {
                alert("Вставьте HTML-код");
                return;
            }
            formData.append("type", "html");
            formData.append("html_content", htmlContent);
            formData.append("content", title || htmlContent);
            formData.append("media_file", "");
        }

        if (link) formData.append("link", link);

        try {
            var res = await fetch("/admin/add_right_ad", { method: "POST", body: formData });
            var data = await res.json();
            console.log('Ответ сервера:', data);
            if (data.success) {
                var container = document.getElementById("promoContainer");
                if (!container) return;
                var emptyDiv = container.querySelector(".empty-info");
                if (emptyDiv) emptyDiv.remove();

                var newPromo = document.createElement("div");
                newPromo.className = "promo-block";
                newPromo.dataset.promoId = data.item.id;

                var innerHtml = '<div class="promo-content">';

                if (data.item.media) {
                    var isVideo = /\.(mp4|mov|avi|mkv)$/i.test(data.item.media);
                    innerHtml += '<div class="promo-media">' +
                        (isVideo ? '<video controls src="' + escapeHtml(data.item.media) + '"></video>' :
                        '<img src="' + escapeHtml(data.item.media) + '" alt="Изображение">') +
                        '</div>';
                    if (data.item.content) {
                        innerHtml += '<div class="promo-text">' + escapeHtml(data.item.content) + '</div>';
                    }
                } else if (data.item.html_content) {
                    innerHtml += '<div class="promo-html-wrapper">' + data.item.html_content + '</div>';
                }

                var linkHtml = data.item.link ? '<div class="promo-link"><a href="' + escapeHtml(data.item.link) + '" target="_blank" rel="noopener noreferrer">Подробнее →</a></div>' : "";
                innerHtml += linkHtml + '</div>' +
                    '<button class="delete-promo-btn" data-id="' + data.item.id + '">✖</button>';
                newPromo.innerHTML = innerHtml;
                container.appendChild(newPromo);

                hideModals();
                selectedPromoFile = null;
                updatePromoPreview();
                if (promoFileInput) promoFileInput.value = "";
                document.getElementById("promoTitle").value = "";
                document.getElementById("promoLink").value = "";
                document.getElementById("promoHtmlContent").value = "";
                attachPromoDeleteHandlers();
                initPromosSortable();
                syncMobilePanels();
            } else {
                alert("Ошибка: " + (data.message || 'Неизвестная ошибка'));
            }
        } catch (err) {
            console.error('Ошибка при отправке:', err);
            alert('Ошибка при отправке запроса: ' + err.message);
        }
    };
}

// ===== ОСТАЛЬНЫЕ ФУНКЦИИ =====
function attachPromoDeleteHandlers() {
    document.querySelectorAll(".delete-promo-btn").forEach(function(btn) {
        btn.removeEventListener("click", handlePromoDelete);
        btn.addEventListener("click", handlePromoDelete);
    });
}

async function handlePromoDelete(e) {
    e.stopPropagation();
    var promoId = e.currentTarget.dataset.id;
    if (!confirm("Удалить этот блок?")) return;
    var res = await fetch("/admin/delete_right_ad/" + promoId, { method: "POST" });
    var data = await res.json();
    if (data.success) {
        var promoBlock = document.querySelector('.promo-block[data-promo-id="' + promoId + '"]');
        if (promoBlock) promoBlock.remove();
        if (document.querySelectorAll(".promo-block").length === 0) {
            var container = document.getElementById("promoContainer");
            if (container) container.innerHTML = '<div class="empty-info">Пусто</div>';
        }
        initPromosSortable();
        syncMobilePanels();
    } else alert("Ошибка: " + data.message);
}

var promosSortable = null;
function initPromosSortable() {
    var promosContainer = document.getElementById('promoContainer');
    if (!promosContainer) return;
    if (promosSortable) promosSortable.destroy();
    if (window.isAdmin) {
        promosSortable = new Sortable(promosContainer, {
            animation: 200,
            handle: '.promo-block',
            onEnd: async function() {
                var promoBlocks = document.querySelectorAll('#promoContainer .promo-block');
                var ids = Array.from(promoBlocks).map(function(block) { return parseInt(block.dataset.promoId); });
                if (ids.length === 0) return;
                try {
                    var res = await fetch('/admin/reorder_right_ads', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ids: ids })
                    });
                    var data = await res.json();
                    if (!data.success) console.error('Ошибка сохранения порядка:', data.message);
                    syncMobilePanels();
                } catch (err) {
                    console.error('Ошибка при reorder:', err);
                }
            }
        });
    } else if (promosSortable) {
        promosSortable.destroy();
        promosSortable = null;
    }
}

function attachLightboxToNews() {
    var allMediaItems = document.querySelectorAll('.news-media-grid .main-media, .news-media-grid .side-grid .media-item');
    allMediaItems.forEach(function(item) {
        item.style.cursor = "pointer";
        item.onclick = function(e) {
            e.stopPropagation();
            var gallery = item.closest('.gallery-with-title');
            if (!gallery) return;
            var items = gallery.querySelectorAll('.main-media, .media-item');
            var mediaElements = [];
            items.forEach(function(el) {
                var media = el.querySelector('img') || el.querySelector('video');
                if (media) mediaElements.push(media);
            });
            if (!mediaElements.length) return;
            currentMediaItems = mediaElements;
            var idx = mediaElements.indexOf(item.querySelector('img') || item.querySelector('video'));
            if (idx === -1) idx = 0;
            openLightbox(idx);
        };
    });
}

var currentMediaItems = [], currentIndex = 0, currentZoom = 1, currentTranslateX = 0, currentTranslateY = 0;
var isDragging = false, dragStartX = 0, dragStartY = 0, initialTranslateX = 0, initialTranslateY = 0;

function openLightbox(index) {
    if (!currentMediaItems.length) return;
    currentIndex = index;
    var media = currentMediaItems[currentIndex];
    var container = document.querySelector("#lightbox .lightbox-content");
    if (!container) return;
    container.innerHTML = "";
    currentZoom = 1; currentTranslateX = 0; currentTranslateY = 0;

    if (media.tagName === "VIDEO") {
        var video = document.createElement("video");
        video.src = media.src; video.controls = true; video.autoplay = true;
        video.style.maxWidth = "100%"; video.style.maxHeight = "90vh";
        container.appendChild(video);
        var ind = document.querySelector(".zoom-indicator");
        if (ind) ind.remove();
    } else {
        var img = document.createElement("img");
        img.src = media.src; img.alt = media.alt || "";
        img.style.transform = "scale(" + currentZoom + ") translate(" + currentTranslateX + "px, " + currentTranslateY + "px)";
        img.style.cursor = "grab";
        container.appendChild(img);
        var indicator = document.querySelector(".zoom-indicator");
        if (!indicator) { indicator = document.createElement("div"); indicator.className = "zoom-indicator"; document.getElementById("lightbox").appendChild(indicator); }
        indicator.style.display = "block"; indicator.textContent = "100%";
        img.onmousedown = function(e) {
            if (currentZoom <= 1) return;
            e.preventDefault();
            isDragging = true;
            dragStartX = e.clientX; dragStartY = e.clientY;
            initialTranslateX = currentTranslateX; initialTranslateY = currentTranslateY;
            img.style.cursor = "grabbing";
        };
        window.onmousemove = function(e) {
            if (!isDragging) return;
            currentTranslateX = initialTranslateX + (e.clientX - dragStartX);
            currentTranslateY = initialTranslateY + (e.clientY - dragStartY);
            img.style.transform = "scale(" + currentZoom + ") translate(" + currentTranslateX + "px, " + currentTranslateY + "px)";
        };
        window.onmouseup = function() { isDragging = false; if (img) img.style.cursor = "grab"; };
        img.onwheel = function(e) {
            e.preventDefault();
            var newZoom = currentZoom + (e.deltaY > 0 ? -0.1 : 0.1);
            newZoom = Math.min(Math.max(0.5, newZoom), 5);
            if (newZoom !== currentZoom) {
                currentZoom = newZoom;
                img.style.transform = "scale(" + currentZoom + ") translate(" + currentTranslateX + "px, " + currentTranslateY + "px)";
                var ind = document.querySelector(".zoom-indicator");
                if (ind) ind.textContent = Math.round(currentZoom * 100) + "%";
                if (currentZoom <= 1) { currentTranslateX = 0; currentTranslateY = 0; img.style.transform = "scale(" + currentZoom + ") translate(0px, 0px)"; }
            }
        };
    }
    var lightbox = document.getElementById("lightbox");
    if (lightbox) lightbox.classList.add("active");
}

function closeLightbox() {
    var lightbox = document.getElementById("lightbox");
    if (lightbox) lightbox.classList.remove("active");
    window.onmousemove = null; window.onmouseup = null;
}

function nextMedia() {
    if (currentIndex + 1 < currentMediaItems.length) {
        openLightbox(currentIndex + 1);
    } else if (currentMediaItems.length > 0) {
        openLightbox(0);
    }
}

function prevMedia() {
    if (currentIndex - 1 >= 0) {
        openLightbox(currentIndex - 1);
    } else if (currentMediaItems.length > 0) {
        openLightbox(currentMediaItems.length - 1);
    }
}

// ===== ЛЕВОЕ МЕНЮ =====
async function showMenuText(itemId, title) {
    try {
        var res = await fetch("/api/left_menu_text/" + itemId);
        var data = await res.json();
        if (data.success) {
            var titleEl = document.getElementById("textViewTitle");
            var contentEl = document.getElementById("textViewContent");
            if (titleEl) titleEl.textContent = data.title;
            if (contentEl) contentEl.innerHTML = data.text || "<p><em>Нет содержимого</em></p>";
            showModal("textViewModal");
        } else {
            alert("Ошибка загрузки текста");
        }
    } catch (err) {
        console.error(err);
        alert("Ошибка загрузки");
    }
}

var sortableInstance = null;
async function refreshLeftMenu() {
    var res = await fetch('/api/left_menu_items');
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
                        await fetch('/admin/reorder_left_menu', {
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
    var id = e.currentTarget.dataset.id;
    if (!confirm("Удалить пункт?")) return;
    var res = await fetch("/admin/delete_left_menu/" + id, { method: 'POST' });
    var data = await res.json();
    if (data.success) refreshLeftMenu();
    else alert("Ошибка: " + data.message);
}

async function handleMenuEdit(e) {
    e.stopPropagation();
    var id = e.currentTarget.dataset.id;
    try {
        var res = await fetch("/api/left_menu_text/" + id);
        var data = await res.json();
        if (data.success) {
            document.getElementById("editMenuId").value = id;
            document.getElementById("editMenuLetter").value = data.title || "";
            document.getElementById("editMenuText").value = data.text || "";
            var itemsRes = await fetch('/api/left_menu_items');
            var items = await itemsRes.json();
            var item = items.find(function(i) { return i.id == id; });
            if (item) {
                document.getElementById("editMenuLink").value = item.link || "";
            }
            showModal("editLeftMenuModal");
        }
    } catch (err) {
        console.error(err);
        alert("Ошибка загрузки данных для редактирования");
    }
}

// ===== НОВОСТИ (добавление/редактирование) =====
if (document.getElementById("addNewsBtn")) {
    var selectedNewsFiles = [];
    var STORAGE_KEY = "news_draft";

    function updateNewsPreview() {
        var container = document.getElementById("newsPreviewContainer");
        if (!container) return;
        var fileItems = container.querySelectorAll('.preview-item[data-type="file"]');
        fileItems.forEach(function(el) { el.remove(); });

        for (var i = 0; i < selectedNewsFiles.length; i++) {
            var file = selectedNewsFiles[i];
            var div = document.createElement("div");
            div.className = "preview-item";
            div.dataset.type = "file";
            div.dataset.fileIndex = i;
            var isVideo = file.type.startsWith("video/");
            if (isVideo) {
                var video = document.createElement("video");
                video.src = URL.createObjectURL(file);
                video.controls = true;
                div.appendChild(video);
            } else {
                var img = document.createElement("img");
                img.src = URL.createObjectURL(file);
                div.appendChild(img);
            }
            var rm = document.createElement("div");
            rm.className = "remove-file";
            rm.innerHTML = "×";
            rm.onclick = function(e) {
                e.stopPropagation();
                var idx = parseInt(e.currentTarget.closest('.preview-item').dataset.fileIndex);
                if (!isNaN(idx)) {
                    selectedNewsFiles.splice(idx, 1);
                    updateNewsPreview();
                    updateNewsFileInput();
                    saveNewsDraft();
                }
            };
            div.appendChild(rm);
            container.appendChild(div);
        }
    }

    function updateNewsFileInput() {
        var dt = new DataTransfer();
        selectedNewsFiles.forEach(function(f) { dt.items.add(f); });
        var input = document.getElementById("newsMediaFile");
        if (input) input.files = dt.files;
    }

    function saveNewsDraft() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            title: document.getElementById("newsTitle").value,
            content: document.getElementById("newsContent").value,
            date: document.getElementById("newsDate").value,
            hasFiles: selectedNewsFiles.length > 0
        }));
    }

    function clearNewsDraft() { localStorage.removeItem(STORAGE_KEY); }

    var newsDragArea = document.getElementById("newsDragDropArea");
    var newsFileInput = document.getElementById("newsMediaFile");

    if (newsFileInput) {
        newsFileInput.addEventListener("change", function(e) {
            var newFiles = Array.from(e.target.files);
            for (var i = 0; i < newFiles.length; i++) {
                var f = newFiles[i];
                if (!selectedNewsFiles.some(function(existing) { return existing.name === f.name && existing.size === f.size && existing.lastModified === f.lastModified; })) {
                    selectedNewsFiles.push(f);
                }
            }
            updateNewsPreview();
            updateNewsFileInput();
            saveNewsDraft();
        });
    }

    if (newsDragArea) {
        newsDragArea.addEventListener("dragover", function(e) { e.preventDefault(); newsDragArea.classList.add("drag-over"); });
        newsDragArea.addEventListener("dragleave", function() { newsDragArea.classList.remove("drag-over"); });
        newsDragArea.addEventListener("drop", function(e) {
            e.preventDefault();
            newsDragArea.classList.remove("drag-over");
            var newFiles = Array.from(e.dataTransfer.files);
            for (var i = 0; i < newFiles.length; i++) {
                var f = newFiles[i];
                if (!selectedNewsFiles.some(function(existing) { return existing.name === f.name && existing.size === f.size && existing.lastModified === f.lastModified; })) {
                    selectedNewsFiles.push(f);
                }
            }
            updateNewsPreview();
            updateNewsFileInput();
            saveNewsDraft();
        });
        newsDragArea.addEventListener("click", function() { if (newsFileInput) newsFileInput.click(); });
    }

    document.getElementById("newsTitle").addEventListener("input", saveNewsDraft);
    document.getElementById("newsContent").addEventListener("input", saveNewsDraft);
    document.getElementById("newsDate").addEventListener("change", saveNewsDraft);

    document.getElementById("addNewsBtn").onclick = function() {
        document.getElementById("editNewsId").value = "";
        document.getElementById("newsModalTitle").textContent = "Добавить новость";
        document.getElementById("submitNews").textContent = "Добавить новость";
        document.getElementById("newsDate").value = new Date().toISOString().split('T')[0];
        selectedNewsFiles = [];
        var container = document.getElementById("newsPreviewContainer");
        if (container) container.innerHTML = "";
        if (newsFileInput) newsFileInput.value = "";
        showModal("newsModal");
    };

    document.getElementById("submitNews").onclick = async function() {
        var title = document.getElementById("newsTitle").value.trim();
        var content = document.getElementById("newsContent").value.trim();
        var date = document.getElementById("newsDate").value;
        if (!title || !content) return alert("Заполните заголовок и содержание");

        var editId = document.getElementById("editNewsId").value;
        var formData = new FormData();
        formData.append("title", title);
        formData.append("content", content);
        if (date) formData.append("date", date);

        selectedNewsFiles.forEach(function(f) { formData.append("media_files", f); });

        var existingMediaUrls = [];
        var previewItems = document.querySelectorAll('#newsPreviewContainer .preview-item:not([data-type="file"])');
        previewItems.forEach(function(item) {
            var img = item.querySelector('img');
            var video = item.querySelector('video');
            if (img) existingMediaUrls.push(img.src);
            else if (video) existingMediaUrls.push(video.src);
        });
        formData.append("existing_media", existingMediaUrls.join(";"));

        var url = editId ? "/admin/edit_news/" + editId : "/admin/add_news";
        var res = await fetch(url, { method: "POST", body: formData });
        var data = await res.json();

        if (data.success) {
            hideModals();
            var list = document.getElementById("newsList");
            if (list) list.innerHTML = '<div class="empty-news">Загрузка...</div>';
            currentOffset = 0;
            allLoaded = false;
            loadNews(0);
            selectedNewsFiles = [];
            updateNewsPreview();
            if (newsFileInput) newsFileInput.value = "";
            document.getElementById("newsTitle").value = "";
            document.getElementById("newsContent").value = "";
            document.getElementById("editNewsId").value = "";
            document.getElementById("newsModalTitle").textContent = "Добавить новость";
            document.getElementById("submitNews").textContent = "Добавить новость";
            clearNewsDraft();
            syncMobilePanels();
        } else {
            alert("Ошибка: " + data.message);
        }
    };
}

// ===== СИНХРОНИЗАЦИЯ МОБИЛЬНЫХ ПАНЕЛЕЙ =====
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

function addMenuHandler() { showModal("leftMenuModal"); }
function addPromoHandler() { showModal("promoModal"); }

var currentOpenPanel = null;
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

// ===== ИНИЦИАЛИЗАЦИЯ =====
document.addEventListener('DOMContentLoaded', function() {
    // window.isAdmin уже установлен в home.html

    document.querySelectorAll(".close").forEach(function(btn) { btn.onclick = hideModals; });
    window.onclick = function(e) { if (e.target.classList.contains("modal")) hideModals(); };

    var loadMoreBtn = document.getElementById("loadMoreNewsBtn");
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener("click", function(e) {
            e.preventDefault();
            loadNews(currentOffset);
        });
    }

    var addLeftBtn = document.getElementById("addLeftMenuBtn");
    if (addLeftBtn) {
        addLeftBtn.addEventListener("click", function() { showModal("leftMenuModal"); });
    }

    var submitLeft = document.getElementById("submitLeftMenu");
    if (submitLeft) {
        submitLeft.addEventListener("click", async function() {
            var letter = document.getElementById("menuLetter").value.trim();
            var text = document.getElementById("menuText").value;
            var link = document.getElementById("menuLink").value.trim();
            if (!letter) return alert("Заполните название");
            if (link && !link.startsWith('http://') && !link.startsWith('https://') && !link.startsWith('/') && !link.startsWith('#')) {
                link = '/' + link;
            }
            var res = await fetch("/admin/add_left_menu", {
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
            var id = document.getElementById("editMenuId").value;
            var letter = document.getElementById("editMenuLetter").value.trim();
            var text = document.getElementById("editMenuText").value;
            var link = document.getElementById("editMenuLink").value.trim();
            if (!letter) return alert("Заполните название");
            if (link && !link.startsWith('http://') && !link.startsWith('https://') && !link.startsWith('/') && !link.startsWith('#')) {
                link = '/' + link;
            }
            var res = await fetch("/admin/update_left_menu/" + id, {
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

    // Mobile bottom buttons
    var mobileLeft = document.getElementById('mobileLeftBtn');
    if (mobileLeft) mobileLeft.addEventListener('click', function() { openPanel('mobileLeftPanel'); });
    var mobileRight = document.getElementById('mobileRightBtn');
    if (mobileRight) mobileRight.addEventListener('click', function() { openPanel('mobileRightPanel'); });
    var panelOverlay = document.getElementById('panelOverlay');
    if (panelOverlay) panelOverlay.addEventListener('click', closePanel);
    document.querySelectorAll('.close-panel-btn').forEach(function(btn) {
        btn.addEventListener('click', function(e) { closePanel(); });
    });

    var lightboxClose = document.querySelector(".lightbox-close");
    if (lightboxClose) lightboxClose.onclick = closeLightbox;
    var lightboxPrev = document.querySelector(".lightbox-prev");
    if (lightboxPrev) lightboxPrev.onclick = prevMedia;
    var lightboxNext = document.querySelector(".lightbox-next");
    if (lightboxNext) lightboxNext.onclick = nextMedia;
    var lightbox = document.getElementById("lightbox");
    if (lightbox) {
        lightbox.addEventListener("wheel", function(e) { if (e.target.closest(".lightbox-content img")) e.preventDefault(); }, { passive: false });
    }

    refreshLeftMenu();
    attachPromoDeleteHandlers();
    initPromosSortable();
    loadNews(0);
    syncMobilePanels();
});
