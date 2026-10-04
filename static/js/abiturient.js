function showModal(modalId) {
    document.getElementById(modalId).style.display = "block";
}
function hideModals() {
    document.querySelectorAll(".modal").forEach((m) => (m.style.display = "none"));
}
document.querySelectorAll(".close").forEach((btn) => (btn.onclick = hideModals));
window.onclick = (e) => {
    if (e.target.classList.contains("modal")) hideModals();
};

let sortableInstance = null;
let selectedItemId = null;
let currentItems = [];

function escapeHtml(str) {
    if (!str) return "";
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

async function loadMenu() {
    try {
        const res = await fetch("/api/abiturient_menu_items");
        if (!res.ok) throw new Error("Ошибка загрузки");
        currentItems = await res.json();
        renderMenu(currentItems);

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
        document.getElementById("menuContainer").innerHTML =
            '<div class="empty-menu">Ошибка загрузки</div>';
        document.getElementById("contentBody").innerHTML =
            '<div class="content-empty">Ошибка загрузки данных</div>';
    }
}

function renderMenu(items) {
    const container = document.getElementById("menuContainer");
    if (!container) return;

    if (items.length === 0) {
        container.innerHTML = '<div class="empty-menu">Пусто</div>';
        if (sortableInstance) sortableInstance.destroy();
        sortableInstance = null;
        return;
    }

    let html = "";
    for (const item of items) {
        const isActive = selectedItemId === item.id;
        if (item.link && item.link.trim()) {
            let href = item.link.trim();
            html += `<div class="menu-item ${isActive ? 'active' : ''}" data-id="${item.id}" data-has-link="true">
                        <a href="${escapeHtml(href)}" class="menu-link" ${href.startsWith('http') ? 'target="_blank" rel="noopener noreferrer"' : ''}>${escapeHtml(item.letter)}</a>
                        ${window.isAdmin ? `<div class="menu-actions"><button class="edit-menu-btn" data-id="${item.id}" title="Редактировать">✎</button><button class="delete-menu-btn" data-id="${item.id}" title="Удалить">✖</button></div>` : ''}
                    </div>`;
        } else {
            html += `<div class="menu-item ${isActive ? 'active' : ''}" data-id="${item.id}" data-has-link="false">
                        <span class="menu-link" style="cursor:pointer;">${escapeHtml(item.letter)}</span>
                        ${window.isAdmin ? `<div class="menu-actions"><button class="edit-menu-btn" data-id="${item.id}" title="Редактировать">✎</button><button class="delete-menu-btn" data-id="${item.id}" title="Удалить">✖</button></div>` : ''}
                    </div>`;
        }
    }
    container.innerHTML = html;

    document.querySelectorAll("#menuContainer .menu-item").forEach((el) => {
        const hasLink = el.dataset.hasLink === "true";
        if (!hasLink) {
            const span = el.querySelector(".menu-link");
            const itemId = parseInt(el.dataset.id);
            const title = span ? span.textContent : "";
            span?.addEventListener("click", (e) => {
                e.preventDefault();
                selectMenuItem(itemId, title);
            });
        }
    });

    if (window.isAdmin) {
        document.querySelectorAll("#menuContainer .menu-item").forEach((el) => {
            el.classList.add("draggable");
        });
        if (sortableInstance) sortableInstance.destroy();
        sortableInstance = new Sortable(container, {
            animation: 200,
            handle: ".menu-item",
            onEnd: async () => {
                const ids = Array.from(
                    document.querySelectorAll("#menuContainer .menu-item")
                ).map((el) => parseInt(el.dataset.id));
                if (ids.length) {
                    await fetch("/admin/reorder_abiturient_menu", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ ids }),
                    });
                    const orderedItems = ids.map(
                        (id) => currentItems.find((item) => item.id === id)
                    );
                    if (orderedItems.every((item) => item)) {
                        currentItems = orderedItems;
                    }
                }
            },
        });
    } else if (sortableInstance) {
        sortableInstance.destroy();
        sortableInstance = null;
    }

    document.querySelectorAll(".delete-menu-btn").forEach((btn) => {
        btn.removeEventListener("click", handleMenuDelete);
        btn.addEventListener("click", handleMenuDelete);
    });
    document.querySelectorAll(".edit-menu-btn").forEach((btn) => {
        btn.removeEventListener("click", handleMenuEdit);
        btn.addEventListener("click", handleMenuEdit);
    });
}

async function selectMenuItem(itemId, title) {
    selectedItemId = itemId;
    document.querySelectorAll("#menuContainer .menu-item").forEach((el) => {
        const id = parseInt(el.dataset.id);
        el.classList.toggle("active", id === itemId);
    });

    document.getElementById("contentTitle").textContent = "Загрузка...";
    document.getElementById("contentBody").innerHTML =
        '<div class="content-loading">Загрузка информации</div>';

    try {
        const res = await fetch(`/api/abiturient_menu_text/${itemId}`);
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

async function handleMenuDelete(e) {
    e.stopPropagation();
    const id = e.currentTarget.dataset.id;
    if (!confirm("Удалить пункт?")) return;
    try {
        const res = await fetch(`/admin/delete_abiturient_menu/${id}`, {
            method: "POST",
        });
        const data = await res.json();
        if (data.success) {
            if (selectedItemId === parseInt(id)) {
                selectedItemId = null;
                const remainingItems = currentItems.filter(item => item.id !== parseInt(id));
                if (remainingItems.length > 0) {
                    const firstItem = remainingItems[0];
                    if (firstItem.link && firstItem.link.trim()) {
                        document.getElementById("contentTitle").textContent = firstItem.letter;
                        document.getElementById("contentBody").innerHTML =
                            `<div class="content-empty">Этот пункт имеет внешнюю ссылку: <a href="${escapeHtml(firstItem.link)}" target="_blank">перейти →</a></div>`;
                    } else {
                        await selectMenuItem(firstItem.id, firstItem.letter);
                    }
                } else {
                    document.getElementById("contentTitle").textContent = "Информация для абитуриентов";
                    document.getElementById("contentBody").innerHTML =
                        '<div class="content-empty">Нет добавленных пунктов меню</div>';
                }
            }
            loadMenu();
        } else {
            alert("Ошибка: " + data.message);
        }
    } catch (err) {
        alert("Ошибка при удалении");
    }
}

async function handleMenuEdit(e) {
    e.stopPropagation();
    const id = e.currentTarget.dataset.id;
    try {
        const res = await fetch(`/api/abiturient_menu_text/${id}`);
        const data = await res.json();
        if (data.success) {
            document.getElementById("editMenuId").value = id;
            document.getElementById("editMenuLetter").value = data.title || "";
            document.getElementById("editMenuText").value = data.text || "";
            const item = currentItems.find((i) => i.id == id);
            if (item) {
                document.getElementById("editMenuLink").value = item.link || "";
            }
            showModal("editMenuModal");
        } else {
            alert("Ошибка загрузки данных");
        }
    } catch (err) {
        alert("Ошибка загрузки данных для редактирования");
    }
}

document.getElementById("addMenuBtn")?.addEventListener("click", () => {
    document.getElementById("menuLetter").value = "";
    document.getElementById("menuText").value = "";
    document.getElementById("menuLink").value = "";
    showModal("menuModal");
});

document.getElementById("submitMenu")?.addEventListener("click", async () => {
    const letter = document.getElementById("menuLetter").value.trim();
    const text = document.getElementById("menuText").value;
    let link = document.getElementById("menuLink").value.trim();
    if (!letter) return alert("Заполните название");
    if (link && !link.startsWith("http://") && !link.startsWith("https://") && !link.startsWith("/") && !link.startsWith("#")) {
        link = "/" + link;
    }
    try {
        const res = await fetch("/admin/add_abiturient_menu", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ letter, text, link }),
        });
        const data = await res.json();
        if (data.success) {
            hideModals();
            if (currentItems.length === 0) {
                const newItem = data.item;
                if (newItem.link && newItem.link.trim()) {
                    document.getElementById("contentTitle").textContent = newItem.letter;
                    document.getElementById("contentBody").innerHTML =
                        `<div class="content-empty">Этот пункт имеет внешнюю ссылку: <a href="${escapeHtml(newItem.link)}" target="_blank">перейти →</a></div>`;
                } else {
                    await selectMenuItem(newItem.id, newItem.letter);
                }
            }
            loadMenu();
        } else {
            alert("Ошибка: " + data.message);
        }
    } catch (err) {
        alert("Ошибка при добавлении");
    }
});

document.getElementById("submitEditMenu")?.addEventListener("click", async () => {
    const id = document.getElementById("editMenuId").value;
    const letter = document.getElementById("editMenuLetter").value.trim();
    const text = document.getElementById("editMenuText").value;
    let link = document.getElementById("editMenuLink").value.trim();
    if (!letter) return alert("Заполните название");
    if (link && !link.startsWith("http://") && !link.startsWith("https://") && !link.startsWith("/") && !link.startsWith("#")) {
        link = "/" + link;
    }
    try {
        const res = await fetch(`/admin/update_abiturient_menu/${id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ letter, text, link }),
        });
        const data = await res.json();
        if (data.success) {
            hideModals();
            if (selectedItemId === parseInt(id)) {
                document.getElementById("contentTitle").textContent = letter;
                document.getElementById("contentBody").innerHTML = text || "<p><em>Нет содержимого</em></p>";
            }
            loadMenu();
        } else {
            alert("Ошибка: " + data.message);
        }
    } catch (err) {
        alert("Ошибка при сохранении");
    }
});

document.addEventListener("DOMContentLoaded", () => {
    loadMenu();
});
