function initCharts() {
    const browsers = statsData.browsers;
    const browserLabels = Object.keys(browsers).slice(0, 6);
    const browserData = browserLabels.map(k => browsers[k]);
    const ctxB = document.getElementById('browserChart').getContext('2d');
    new Chart(ctxB, {
        type: 'doughnut',
        data: {
            labels: browserLabels,
            datasets: [{
                data: browserData,
                backgroundColor: ['#2a6cf5', '#7c3aed', '#16a34a', '#ca8a04', '#dc2626', '#6b7280'],
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false }, tooltip: { backgroundColor: '#0b1e3a', titleColor: '#fff', bodyColor: '#ddd' } },
            cutout: '65%'
        }
    });

    const pages = statsData.page_views;
    const pageLabels = Object.keys(pages).slice(0, 6);
    const pageData = pageLabels.map(k => pages[k]);
    const ctxP = document.getElementById('pagesChart').getContext('2d');
    new Chart(ctxP, {
        type: 'bar',
        data: {
            labels: pageLabels,
            datasets: [{
                label: 'Просмотры',
                data: pageData,
                backgroundColor: '#2a6cf5',
                borderRadius: 8,
                barPercentage: 0.6
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false }, tooltip: { backgroundColor: '#0b1e3a', titleColor: '#fff', bodyColor: '#ddd' } },
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { color: '#6f85a5' } },
                x: { grid: { display: false }, ticks: { color: '#6f85a5', maxRotation: 20, font: { size: 10 } } }
            }
        }
    });
}

function showToast(message, type = "success") {
    const container = document.querySelector(".toast-container");
    const colors = { success: "#10b981", error: "#ef4444", warning: "#f59e0b", info: "#3b82f6" };
    const color = colors[type] || colors.info;
    const toast = document.createElement("div");
    toast.className = "toast";
    const iconMap = { success: "bi-check-circle-fill", error: "bi-x-circle-fill", warning: "bi-exclamation-triangle-fill", info: "bi-info-circle-fill" };
    toast.innerHTML = `
        <i class="bi ${iconMap[type] || 'bi-info-circle-fill'}" style="color:${color}; font-size:24px;"></i>
        <span style="flex:1; font-size:14px; color:#0b1e3a;">${message}</span>
        <button class="btn-close" style="font-size:12px;" onclick="this.parentElement.remove()"></button>
    `;
    container.appendChild(toast);
    setTimeout(() => { if (toast.parentElement) toast.remove(); }, 4000);
}

document.querySelectorAll('.toggle-table-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        const targetId = this.dataset.target;
        const table = document.getElementById(targetId);
        if (!table) return;
        const isExpanded = table.classList.contains('expanded');
        if (isExpanded) {
            table.classList.remove('expanded');
            const count = this.textContent.match(/\d+/)?.[0] || '';
            this.innerHTML = `<i class="bi bi-chevron-down"></i> Показать все (${count})`;
        } else {
            table.classList.add('expanded');
            this.innerHTML = `<i class="bi bi-chevron-up"></i> Скрыть`;
        }
    });
});

async function loadAdmins() {
    try {
        const resp = await fetch("/api/admins");
        const data = await resp.json();
        if (data.success) {
            let filteredAdmins = data.admins;
            if (currentUserLevel < 5) {
                filteredAdmins = data.admins.filter(admin => admin.level < 5);
            }
            renderAdminList(filteredAdmins);
            document.getElementById("admins-count").textContent = filteredAdmins.length;
        } else {
            showToast(data.message || "Ошибка загрузки", "error");
        }
    } catch (e) {
        showToast("Ошибка соединения", "error");
    }
}

function renderAdminList(admins) {
    const list = document.getElementById("admin-list");
    list.innerHTML = "";

    if (!admins || admins.length === 0) {
        list.innerHTML = `
            <li style="text-align:center; color:#8a9bb5; padding:24px; background:transparent; border:none;">
                <i class="bi bi-inbox" style="font-size:28px;display:block;margin-bottom:8px;"></i>
                Нет администраторов
            </li>
            <li class="add-admin-list-item">
                <button class="btn-add-inline" id="open-add-modal-btn">
                    <i class="bi bi-person-plus"></i> Добавить администратора
                </button>
            </li>
        `;
        document.getElementById("open-add-modal-btn").addEventListener("click", openAddModal);
        return;
    }

    admins.forEach(admin => {
        const li = document.createElement("li");
        const isSelf = admin.username === currentUsername;
        const canEdit = isSelf || (currentUserLevel > admin.level);
        const canDelete = !isSelf && currentUserLevel > admin.level;

        li.innerHTML = `
            <div class="admin-info">
                <i class="bi bi-person-circle"></i>
                <div>
                    <span class="admin-name">${escapeHtml(admin.full_name)}</span>
                    <span class="admin-username">
                        @${escapeHtml(admin.username)}
                        <span class="level-text level-${admin.level}">Уровень ${admin.level}</span>
                    </span>
                </div>
            </div>
            <div class="admin-actions">
                <button class="edit-admin-btn ${canEdit ? '' : 'disabled'}" data-id="${admin.id}" data-fullname="${escapeHtml(admin.full_name)}" data-username="${escapeHtml(admin.username)}" data-level="${admin.level}" ${canEdit ? '' : 'disabled'} title="${isSelf ? 'Редактировать себя' : (canEdit ? 'Редактировать' : 'Недостаточно прав')}"><i class="bi bi-pencil"></i></button>
                <button class="delete-admin-btn ${canDelete ? '' : 'disabled'}" data-id="${admin.id}" ${canDelete ? '' : 'disabled'} title="${isSelf ? 'Нельзя удалить себя' : (canDelete ? 'Удалить' : 'Недостаточно прав')}"><i class="bi bi-trash3"></i></button>
            </div>
        `;
        const editBtn = li.querySelector(".edit-admin-btn");
        if (canEdit) editBtn.addEventListener("click", () => openEditModal(admin.id, admin.full_name, admin.username, admin.level));
        const delBtn = li.querySelector(".delete-admin-btn");
        if (canDelete) delBtn.addEventListener("click", () => deleteAdmin(admin.id));
        list.appendChild(li);
    });

    const addLi = document.createElement("li");
    addLi.className = "add-admin-list-item";
    addLi.innerHTML = `
        <button class="btn-add-inline" id="open-add-modal-btn">
            <i class="bi bi-person-plus"></i> Добавить администратора
        </button>
    `;
    list.appendChild(addLi);
    document.getElementById("open-add-modal-btn").addEventListener("click", openAddModal);
}

function escapeHtml(text) {
    const d = document.createElement("div");
    d.textContent = text;
    return d.innerHTML;
}

function openAddModal() {
    document.getElementById("addModal").classList.add("active");
    document.getElementById("add-admin-form").reset();
    updateLevelOptions();
}
function closeAddModal() { document.getElementById("addModal").classList.remove("active"); }

document.getElementById("add-cancel-btn").addEventListener("click", closeAddModal);
document.getElementById("addModal").addEventListener("click", (e) => { if (e.target === e.currentTarget) closeAddModal(); });

function updateLevelOptions() {
    const select = document.getElementById("admin-level");
    const maxLevel = currentUserLevel - 1;
    const allLevels = [4, 3, 2, 1];
    select.innerHTML = "";
    allLevels.forEach(lvl => {
        if (lvl <= maxLevel) {
            const opt = document.createElement("option");
            opt.value = lvl;
            opt.textContent = `Уровень ${lvl}`;
            select.appendChild(opt);
        }
    });
    if (select.options.length === 0) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "Нет доступных уровней";
        opt.disabled = true;
        opt.selected = true;
        select.appendChild(opt);
        document.getElementById("add-save-btn").disabled = true;
    } else {
        document.getElementById("add-save-btn").disabled = false;
    }
}

document.getElementById("add-admin-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fullname = document.getElementById("admin-fullname").value.trim();
    const username = document.getElementById("admin-username").value.trim();
    const password = document.getElementById("admin-password").value.trim();
    const level = parseInt(document.getElementById("admin-level").value);
    if (!fullname || !username || !password) return showToast("Заполните все поля", "warning");
    if (password.length < 6) return showToast("Пароль минимум 6 символов", "warning");
    const btn = document.getElementById("add-save-btn");
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span> Добавление...`;
    try {
        const resp = await fetch("/admin/add_admin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fullname, username, password, level }),
        });
        const data = await resp.json();
        if (data.success) {
            showToast("Администратор добавлен", "success");
            closeAddModal();
            loadAdmins();
        } else showToast(data.message || "Ошибка", "error");
    } catch (e) {
        showToast("Ошибка соединения", "error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<i class="bi bi-check-circle"></i> Добавить`;
    }
});

function openEditModal(id, fullname, username, level) {
    document.getElementById("edit-admin-id").value = id;
    document.getElementById("edit-fullname").value = fullname;
    document.getElementById("edit-username").value = username;
    document.getElementById("edit-password").value = "";
    const isSelf = username === currentUsername;
    const select = document.getElementById("edit-level");
    const hint = document.getElementById("edit-level-hint");
    const currentValue = parseInt(level);
    select.innerHTML = "";
    const allLevels = [5, 4, 3, 2, 1];
    const available = isSelf ? allLevels.filter(lvl => lvl <= currentUserLevel) : allLevels.filter(lvl => lvl < currentUserLevel);
    available.forEach(lvl => {
        const opt = document.createElement("option");
        opt.value = lvl;
        opt.textContent = `Уровень ${lvl}`;
        if (lvl === currentValue) opt.selected = true;
        select.appendChild(opt);
    });
    hint.textContent = isSelf ? "Вы можете оставить текущий или понизить" : "Установите уровень ниже вашего";
    if (select.options.length === 0) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "Нет доступных уровней";
        opt.disabled = true;
        opt.selected = true;
        select.appendChild(opt);
        document.getElementById("edit-save-btn").disabled = true;
    } else {
        document.getElementById("edit-save-btn").disabled = false;
    }
    document.getElementById("editModal").classList.add("active");
}

function closeEditModal() { document.getElementById("editModal").classList.remove("active"); }
document.getElementById("edit-cancel-btn").addEventListener("click", closeEditModal);
document.getElementById("editModal").addEventListener("click", (e) => { if (e.target === e.currentTarget) closeEditModal(); });

document.getElementById("edit-admin-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("edit-admin-id").value;
    const fullname = document.getElementById("edit-fullname").value.trim();
    const username = document.getElementById("edit-username").value.trim();
    const password = document.getElementById("edit-password").value.trim();
    const level = parseInt(document.getElementById("edit-level").value);
    if (!fullname || !username) return showToast("Заполните обязательные поля", "warning");
    const btn = document.getElementById("edit-save-btn");
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span> Сохранение...`;
    try {
        const resp = await fetch(`/admin/edit_admin/${id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fullname, username, password: password || undefined, level }),
        });
        const data = await resp.json();
        if (data.success) {
            showToast("Данные обновлены", "success");
            closeEditModal();
            loadAdmins();
            if (username === currentUsername) {
                document.querySelector('.level-badge').textContent = `Уровень ${level}`;
                setTimeout(() => location.reload(), 800);
            }
        } else showToast(data.message || "Ошибка", "error");
    } catch (e) {
        showToast("Ошибка соединения", "error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<i class="bi bi-check-circle"></i> Сохранить`;
    }
});

async function deleteAdmin(id) {
    if (!confirm("Удалить этого администратора?")) return;
    try {
        const resp = await fetch(`/admin/delete_admin/${id}`, { method: "POST", headers: { "Content-Type": "application/json" } });
        const data = await resp.json();
        if (data.success) { showToast("Удалено", "success");
            loadAdmins(); } else showToast(data.message || "Ошибка", "error");
    } catch (e) {
        showToast("Ошибка соединения", "error");
    }
}

loadAdmins();
setInterval(loadAdmins, 30000);
initCharts();
