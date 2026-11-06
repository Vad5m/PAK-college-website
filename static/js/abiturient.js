function showModal(modalId) {
    document.getElementById(modalId).style.display = "block";
}
function hideModals() {
    document.querySelectorAll(".modal").forEach((m) => (m.style.display = "none"));
}

let selectedItemId = null;
let currentItems = [];

async function loadMenu() {
    try {
        const res = await fetch(window.LEFT_MENU_API.items);
        if (!res.ok) throw new Error("Ошибка загрузки");
        currentItems = await res.json();

        if (currentItems.length > 0 && selectedItemId === null) {
            const firstItem = currentItems[0];
            if (firstItem.link && firstItem.link.trim()) {
                document.getElementById("contentTitle").textContent = firstItem.letter;
                document.getElementById("contentBody").innerHTML =
                    `<div class="content-empty">Этот пункт имеет внешнюю ссылку: <a href="${escapeHtml(firstItem.link)}" target="_blank">перейти →</a></div>`;
            } else {
                await selectMenuItem(firstItem.id, firstItem.letter);
            }
        } else if (currentItems.length === 0) {
            document.getElementById("contentTitle").textContent = "Информация для абитуриентов";
            document.getElementById("contentBody").innerHTML =
                '<div class="content-empty">Нет добавленных пунктов меню</div>';
        }
    } catch (err) {
        console.error(err);
        document.getElementById("contentBody").innerHTML =
            '<div class="content-empty">Ошибка загрузки данных</div>';
    }
}

function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function selectMenuItem(itemId, title) {
    selectedItemId = itemId;
    document.querySelectorAll("#leftMenuContainer .menu-item").forEach((el) => {
        const id = parseInt(el.dataset.id);
        el.classList.toggle("active", id === itemId);
    });

    document.getElementById("contentTitle").textContent = "Загрузка...";
    document.getElementById("contentBody").innerHTML =
        '<div class="content-loading">Загрузка информации</div>';

    try {
        const res = await fetch(window.LEFT_MENU_API.text + itemId);
        const data = await res.json();
        if (data.success) {
            document.getElementById("contentTitle").textContent = data.title || title;
            const body = document.getElementById("contentBody");
            body.innerHTML = data.text || "<p><em>Нет содержимого</em></p>";
        } else {
            document.getElementById("contentTitle").textContent = "Ошибка";
            document.getElementById("contentBody").innerHTML =
                '<div class="content-empty">Не удалось загрузить содержимое</div>';
        }
    } catch (err) {
        console.error(err);
        document.getElementById("contentTitle").textContent = "Ошибка";
        document.getElementById("contentBody").innerHTML =
            '<div class="content-empty">Ошибка загрузки</div>';
    }
}

document.addEventListener("DOMContentLoaded", () => {
    const container = document.getElementById("leftMenuContainer");
    if (container) {
        const observer = new MutationObserver(() => {
            document.querySelectorAll("#leftMenuContainer .menu-item").forEach((el) => {
                const hasLink = el.dataset.hasLink === "true";
                if (!hasLink) {
                    const span = el.querySelector(".menu-link");
                    const itemId = parseInt(el.dataset.id);
                    const title = span ? span.textContent : "";
                    if (span && !span.dataset.bound) {
                        span.dataset.bound = "1";
                        span.addEventListener("click", (e) => {
                            e.preventDefault();
                            selectMenuItem(itemId, title);
                        });
                    }
                }
            });
        });
        observer.observe(container, { childList: true, subtree: true });
    }
    loadMenu();
});
