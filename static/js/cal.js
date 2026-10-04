var currentOffset = 0;
var limit = 10;
var totalNews = 0;
var isLoading = false;
var allLoaded = false;
var selectedDate = null;

var currentYear = new Date().getFullYear();
var currentMonth = new Date().getMonth();
var newsDates = new Set();

function renderCalendar(year, month) {
    var grid = document.getElementById("calendarGrid");
    if (!grid) return;
    var monthNames = [
        "Январь",
        "Февраль",
        "Март",
        "Апрель",
        "Май",
        "Июнь",
        "Июль",
        "Август",
        "Сентябрь",
        "Октябрь",
        "Ноябрь",
        "Декабрь",
    ];
    document.getElementById("monthLabel").textContent =
        monthNames[month] + " " + year;

    var firstDay = new Date(year, month, 1).getDay();
    firstDay = firstDay === 0 ? 6 : firstDay - 1;
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var today = new Date();
    var todayStr =
        today.getFullYear() +
        "-" +
        String(today.getMonth() + 1).padStart(2, "0") +
        "-" +
        String(today.getDate()).padStart(2, "0");

    var html = "";
    var dayNames = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
    for (var d = 0; d < 7; d++) {
        html += '<div class="day-name">' + dayNames[d] + "</div>";
    }

    for (var i = 0; i < firstDay; i++) {
        html += '<div class="day-cell empty"></div>';
    }

    for (var day = 1; day <= daysInMonth; day++) {
        var dateStr =
            year +
            "-" +
            String(month + 1).padStart(2, "0") +
            "-" +
            String(day).padStart(2, "0");
        var isToday = dateStr === todayStr;
        var isSelected = dateStr === selectedDate;
        var hasNews = newsDates.has(dateStr);

        var classes = "day-cell";
        if (isToday) classes += " today";
        if (isSelected) classes += " selected";
        if (hasNews) classes += " has-news";

        html +=
            '<button class="' +
            classes +
            '" data-date="' +
            dateStr +
            '">' +
            day +
            "</button>";
    }

    grid.innerHTML = html;

    grid.querySelectorAll(".day-cell:not(.empty)").forEach(function (cell) {
        cell.addEventListener("click", function () {
            var date = this.dataset.date;
            if (selectedDate === date) {
                selectedDate = null;
            } else {
                selectedDate = date;
            }
            document.getElementById("dateBadge").textContent = selectedDate
                ? "📅 " + selectedDate
                : "Все новости";
            currentOffset = 0;
            allLoaded = false;
            var list = document.getElementById("newsList");
            if (list)
                list.innerHTML = '<div class="loader">Загрузка...</div>';
            loadNews(0, selectedDate);
            renderCalendar(currentYear, currentMonth);
        });
    });
}

function fetchNewsDates() {
    fetch("/api/news_dates")
        .then(function (res) {
            return res.json();
        })
        .then(function (data) {
            if (data.success && data.dates) {
                newsDates = new Set(data.dates);
                renderCalendar(currentYear, currentMonth);
            }
        })
        .catch(function (err) {
            console.error("Ошибка загрузки дат:", err);
        });
}

document.getElementById("prevMonthBtn").addEventListener("click", function () {
    currentMonth--;
    if (currentMonth < 0) {
        currentMonth = 11;
        currentYear--;
    }
    renderCalendar(currentYear, currentMonth);
});

document.getElementById("nextMonthBtn").addEventListener("click", function () {
    currentMonth++;
    if (currentMonth > 11) {
        currentMonth = 0;
        currentYear++;
    }
    renderCalendar(currentYear, currentMonth);
});

function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/[&<>]/g, function (m) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[m];
    });
}

function buildMediaCollage(mediaUrls, title) {
    if (!mediaUrls || mediaUrls.length === 0) {
        return '<div class="news-title">' + escapeHtml(title) + "</div>";
    }

    var count = mediaUrls.length;
    var countClass =
        count === 1
            ? "count-1"
            : count === 2
              ? "count-2"
              : count === 3
                ? "count-3"
                : count === 4
                  ? "count-4"
                  : "count-many";

    var html =
        '<div class="gallery-with-title"><div class="news-media-grid ' +
        countClass +
        '">';

    var mainUrl = mediaUrls[0];
    var isMainVideo = /\.(mp4|mov|avi|mkv)$/i.test(mainUrl);
    html +=
        '<div class="main-media" data-url="' + escapeHtml(mainUrl) + '">';
    if (isMainVideo) {
        html += '<video controls src="' + escapeHtml(mainUrl) + '"></video>';
    } else {
        html +=
            '<img src="' +
            escapeHtml(mainUrl) +
            '" alt="Изображение" loading="lazy">';
    }
    html += "</div>";

    if (count > 1) {
        html += '<div class="side-grid">';
        var maxSide = count === 4 || count > 4 ? 4 : count - 1;
        for (var i = 1; i <= maxSide && i < mediaUrls.length; i++) {
            var url = mediaUrls[i];
            if (!url) continue;
            var isVideo = /\.(mp4|mov|avi|mkv)$/i.test(url);
            html +=
                '<div class="media-item" data-url="' + escapeHtml(url) + '">';
            if (isVideo) {
                html +=
                    '<video controls src="' + escapeHtml(url) + '"></video>';
            } else {
                html +=
                    '<img src="' +
                    escapeHtml(url) +
                    '" alt="Изображение" loading="lazy">';
            }
            html += "</div>";
        }
        html += "</div>";
    }

    html +=
        '</div><div class="overlay-title">' +
        escapeHtml(title) +
        "</div></div>";
    return html;
}

function buildNewsItem(item) {
    var wrapper = document.createElement("div");
    wrapper.className = "news-item";
    wrapper.dataset.id = item.id;

    var mediaUrls = [];
    if (item.media) {
        mediaUrls = item.media.split(";").filter(function (u) {
            return u.trim() !== "";
        });
    }

    var galleryHtml = buildMediaCollage(mediaUrls, item.title);

    var fullContent = escapeHtml(item.content);
    var shortContent =
        fullContent.length > 200
            ? fullContent.slice(0, 200) + "..."
            : fullContent;
    var readMoreHtml =
        fullContent.length > 200
            ? '<button class="read-more-btn">Читать далее</button>'
            : "";
    var authorDisplay = (item.created_date || "").slice(0, 10);

    wrapper.innerHTML =
        galleryHtml +
        '<div class="news-content" data-fulltext="' +
        fullContent.replace(/"/g, "&quot;") +
        '">' +
        '<span class="short-text">' +
        shortContent +
        "</span>" +
        '<span class="full-text" style="display: none;">' +
        fullContent +
        "</span>" +
        readMoreHtml +
        "</div>" +
        '<div class="news-date"><span>' +
        authorDisplay +
        "</span></div>";

    return wrapper;
}

function appendNewsItems(items) {
    var list = document.getElementById("newsList");
    if (!list) return;
    var empty = list.querySelector(".empty-news");
    if (empty) empty.remove();
    var loader = list.querySelector(".loader");
    if (loader) loader.remove();

    items.forEach(function (item) {
        var el = buildNewsItem(item);
        list.appendChild(el);
    });
    attachReadMoreHandlers();
    attachLightboxToNews();
}

function attachReadMoreHandlers() {
    document.querySelectorAll(".read-more-btn").forEach(function (btn) {
        btn.removeEventListener("click", readMoreHandler);
        btn.addEventListener("click", readMoreHandler);
    });
}

function readMoreHandler(e) {
    var btn = e.currentTarget;
    var contentDiv = btn.closest(".news-content");
    var shortSpan = contentDiv.querySelector(".short-text");
    var fullSpan = contentDiv.querySelector(".full-text");
    if (fullSpan.style.display === "none") {
        shortSpan.style.display = "none";
        fullSpan.style.display = "inline";
        btn.textContent = "Скрыть";
    } else {
        shortSpan.style.display = "inline";
        fullSpan.style.display = "none";
        btn.textContent = "Читать далее";
    }
}

async function loadNews(offset, date) {
    if (isLoading) return;
    if (allLoaded) return;
    isLoading = true;

    var url = "/api/news?offset=" + offset + "&limit=" + limit;
    if (date) url += "&date=" + date;

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
                    if (list)
                        list.innerHTML =
                            '<div class="empty-news">Новостей не найдено</div>';
                } else {
                    allLoaded = true;
                    var btn2 = document.getElementById("loadMoreNewsBtn");
                    if (btn2) btn2.style.display = "none";
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

var currentMediaItems = [],
    currentIndex = 0,
    currentZoom = 1,
    currentTranslateX = 0,
    currentTranslateY = 0;
var isDragging = false,
    dragStartX = 0,
    dragStartY = 0,
    initialTranslateX = 0,
    initialTranslateY = 0;

function openLightbox(index) {
    if (!currentMediaItems.length) return;
    currentIndex = index;
    var media = currentMediaItems[currentIndex];
    var container = document.querySelector("#lightbox .lightbox-content");
    if (!container) return;
    container.innerHTML = "";
    currentZoom = 1;
    currentTranslateX = 0;
    currentTranslateY = 0;

    var indicator = document.querySelector(".zoom-indicator");
    if (indicator) {
        indicator.style.display = "block";
        indicator.textContent = "100%";
    }

    if (media.tagName === "VIDEO") {
        var video = document.createElement("video");
        video.src = media.src;
        video.controls = true;
        video.autoplay = true;
        video.style.maxWidth = "100%";
        video.style.maxHeight = "90vh";
        container.appendChild(video);
        if (indicator) indicator.style.display = "none";
    } else {
        var img = document.createElement("img");
        img.src = media.src;
        img.alt = media.alt || "";
        img.style.transform = "scale(1) translate(0px, 0px)";
        img.style.cursor = "grab";
        container.appendChild(img);

        img.onmousedown = function (e) {
            if (currentZoom <= 1) return;
            e.preventDefault();
            isDragging = true;
            dragStartX = e.clientX;
            dragStartY = e.clientY;
            initialTranslateX = currentTranslateX;
            initialTranslateY = currentTranslateY;
            img.style.cursor = "grabbing";
        };

        window.onmousemove = function (e) {
            if (!isDragging) return;
            currentTranslateX = initialTranslateX + (e.clientX - dragStartX);
            currentTranslateY = initialTranslateY + (e.clientY - dragStartY);
            img.style.transform =
                "scale(" +
                currentZoom +
                ") translate(" +
                currentTranslateX +
                "px, " +
                currentTranslateY +
                "px)";
        };

        window.onmouseup = function () {
            isDragging = false;
            if (img) img.style.cursor = "grab";
        };

        img.onwheel = function (e) {
            e.preventDefault();
            var newZoom = currentZoom + (e.deltaY > 0 ? -0.1 : 0.1);
            newZoom = Math.min(Math.max(0.5, newZoom), 5);
            if (newZoom !== currentZoom) {
                currentZoom = newZoom;
                if (currentZoom <= 1) {
                    currentTranslateX = 0;
                    currentTranslateY = 0;
                    img.style.transform = "scale(1) translate(0px, 0px)";
                } else {
                    img.style.transform =
                        "scale(" +
                        currentZoom +
                        ") translate(" +
                        currentTranslateX +
                        "px, " +
                        currentTranslateY +
                        "px)";
                }
                var ind = document.querySelector(".zoom-indicator");
                if (ind) ind.textContent = Math.round(currentZoom * 100) + "%";
            }
        };
    }

    document.getElementById("lightbox").classList.add("active");
}

function closeLightbox() {
    document.getElementById("lightbox").classList.remove("active");
    window.onmousemove = null;
    window.onmouseup = null;
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

function attachLightboxToNews() {
    var allMediaItems = document.querySelectorAll(
        ".news-media-grid .main-media, .news-media-grid .side-grid .media-item",
    );
    allMediaItems.forEach(function (item) {
        item.style.cursor = "pointer";
        item.onclick = function (e) {
            e.stopPropagation();
            var gallery = item.closest(".gallery-with-title");
            if (!gallery) return;
            var items = gallery.querySelectorAll(".main-media, .media-item");
            var mediaElements = [];
            items.forEach(function (el) {
                var media = el.querySelector("img") || el.querySelector("video");
                if (media) mediaElements.push(media);
            });
            if (!mediaElements.length) return;
            currentMediaItems = mediaElements;
            var idx = mediaElements.indexOf(
                item.querySelector("img") || item.querySelector("video"),
            );
            if (idx === -1) idx = 0;
            openLightbox(idx);
        };
    });
}

document
    .getElementById("loadMoreNewsBtn")
    .addEventListener("click", function (e) {
        e.preventDefault();
        loadNews(currentOffset, selectedDate);
    });

document.addEventListener("DOMContentLoaded", function () {
    document.querySelector(".lightbox-close").onclick = closeLightbox;
    document.querySelector(".lightbox-prev").onclick = prevMedia;
    document.querySelector(".lightbox-next").onclick = nextMedia;
    document.getElementById("lightbox").addEventListener(
        "wheel",
        function (e) {
            if (e.target.closest(".lightbox-content img")) e.preventDefault();
        },
        { passive: false },
    );

    fetchNewsDates();
    loadNews(0, null);
});
