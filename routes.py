import os, json, uuid, time, threading, platform
from collections import deque
from datetime import datetime

import psutil
from flask import (Blueprint, jsonify, redirect, render_template, request,
                   send_from_directory, session, url_for, abort)

from config import (UPLOAD_FOLDER, WP_UPLOAD_FOLDER, EDITOR_UPLOAD_FOLDER,
                    EDITOR_DOCS_FOLDER, EDITOR_DOC_NAME, IMAGE_EXTENSIONS)
from db import (get_db, get_stats_db, init_stats_db, increment_counter,
                add_visit, add_client_stats, get_unique_ips_count, get_stats_data)
from utils import (hash_password, allowed_file, compress_image, get_media_url,
                   detect_browser, save_uploaded_file)

bp = Blueprint("main", __name__)

history_data = {"cpu": deque(maxlen=30), "timestamps": deque(maxlen=30)}

def _collect_history():
    while True:
        history_data["cpu"].append(psutil.cpu_percent(interval=1))
        history_data["timestamps"].append(time.strftime("%H:%M:%S"))
        time.sleep(2)

def start_history_collector():
    threading.Thread(target=_collect_history, daemon=True).start()

def get_system_stats():
    cpu_percent = psutil.cpu_percent(interval=0.3)
    cpu_freq = psutil.cpu_freq()
    mem = psutil.virtual_memory()
    disk = psutil.disk_usage("/")
    net = psutil.net_io_counters()

    processes = []
    for proc in sorted(psutil.process_iter(["name", "cpu_percent", "memory_percent"]),
                       key=lambda p: p.info["cpu_percent"] or 0, reverse=True)[:10]:
        try:
            processes.append({
                "name": (proc.info["name"] or "unknown")[:25],
                "cpu": round(proc.info["cpu_percent"] or 0, 1),
                "memory": round(proc.info["memory_percent"] or 0, 1),
            })
        except Exception:
            pass

    temps = []
    try:
        for name, entries in psutil.sensors_temperatures().items():
            for entry in entries[:2]:
                temps.append({"sensor": name, "current": entry.current})
    except Exception:
        pass

    uptime = time.time() - psutil.boot_time()
    return {
        "hostname": platform.node(),
        "os": platform.system(),
        "uptime": f"{int(uptime // 3600)}h {int((uptime % 3600) // 60)}m",
        "cpu": {"percent": cpu_percent,
                "freq": int(cpu_freq.current) if cpu_freq else 0,
                "cores": psutil.cpu_count()},
        "memory": {"percent": mem.percent, "total": mem.total, "used": mem.used},
        "disk": {"percent": disk.percent, "total": disk.total, "used": disk.used},
        "network": {"bytes_sent": net.bytes_sent, "bytes_recv": net.bytes_recv},
        "processes": processes,
        "temperatures": temps,
        "history": {"cpu": list(history_data["cpu"]),
                    "timestamps": list(history_data["timestamps"])},
    }


MENU_TABLES = {
    "home": "left_menu_items",
    "left": "left_menu_items",
    "abiturient": "abiturient_menu_items",
    "students": "students_menu_items",
    "parents": "parents_menu_items",
    "staff": "staff_menu_items",
}

def _require_admin():
    if "admin_id" not in session:
        return jsonify({"success": False, "message": "Не авторизован"}), 403
    return None

def _menu_table(page_type):
    t = MENU_TABLES.get(page_type)
    if not t:
        abort(404)
    return t

def _current_admin(conn):
    return conn.execute(
        "SELECT id, level, username FROM admins WHERE id = ?", (session["admin_id"],)
    ).fetchone()


@bp.route("/wp-content/uploads/<path:filename>")
def wp_content_uploads(filename):
    return send_from_directory("static/wp-content/uploads", filename)

@bp.route("/uploads/<path:filename>")
def uploads_files(filename):
    return send_from_directory("static/uploads", filename)

@bp.route("/data/upload/<path:filename>")
def editor_uploaded_file(filename):
    return send_from_directory(EDITOR_UPLOAD_FOLDER, filename)

@bp.route("/data/<path:filename>")
def editor_data_file(filename):
    return send_from_directory("data", filename)

@bp.route("/favicon.ico")
def favicon():
    return send_from_directory(os.path.join(os.path.dirname(__file__), "static"), "favicon.ico")


@bp.route("/api/<page_type>_menu_items")
def api_menu_items(page_type):
    table = _menu_table(page_type)
    conn = get_db()
    items = conn.execute(
        f"SELECT id, letter, text, link FROM {table} ORDER BY sort_order"
    ).fetchall()
    conn.close()
    return jsonify([dict(i) for i in items])

@bp.route("/api/<page_type>_menu_text/<int:item_id>")
def get_menu_text(page_type, item_id):
    table = _menu_table(page_type)
    conn = get_db()
    item = conn.execute(
        f"SELECT id, letter, text FROM {table} WHERE id = ?", (item_id,)
    ).fetchone()
    conn.close()
    if not item:
        return jsonify({"success": False, "message": "Пункт не найден"})
    return jsonify({"success": True, "id": item["id"],
                    "title": item["letter"], "text": item["text"] or ""})

@bp.route("/admin/add_<page_type>_menu", methods=["POST"])
def add_menu(page_type):
    if (r := _require_admin()): return r
    table = _menu_table(page_type)
    data = request.get_json()
    letter = data.get("letter", "").strip()
    text = data.get("text", "").strip()
    link = data.get("link", "").strip()
    if not letter:
        return jsonify({"success": False, "message": "Поле 'Название' обязательно"})
    conn = get_db(); cur = conn.cursor()
    next_order = cur.execute(
        f"SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM {table}"
    ).fetchone()["n"]
    try:
        cur.execute(
            f"INSERT INTO {table} (letter, text, link, sort_order) VALUES (?, ?, ?, ?)",
            (letter, text, link, next_order))
        conn.commit()
        new_id = cur.lastrowid
        new_item = conn.execute(
            f"SELECT id, letter, text, link, sort_order FROM {table} WHERE id = ?",
            (new_id,)).fetchone()
        conn.close()
        return jsonify({"success": True, "item": dict(new_item)})
    except Exception as e:
        conn.close()
        return jsonify({"success": False, "message": str(e)})

@bp.route("/admin/update_<page_type>_menu/<int:item_id>", methods=["POST"])
def update_menu(page_type, item_id):
    if (r := _require_admin()): return r
    table = _menu_table(page_type)
    data = request.get_json()
    letter = data.get("letter", "").strip()
    text = data.get("text", "").strip()
    link = data.get("link", "").strip()
    if not letter:
        return jsonify({"success": False, "message": "Поле 'Название' обязательно"})
    conn = get_db(); cur = conn.cursor()
    try:
        cur.execute(
            f"UPDATE {table} SET letter = ?, text = ?, link = ? WHERE id = ?",
            (letter, text, link, item_id))
        conn.commit()
        updated = conn.execute(
            f"SELECT id, letter, text, link, sort_order FROM {table} WHERE id = ?",
            (item_id,)).fetchone()
        conn.close()
        return jsonify({"success": True, "item": dict(updated)})
    except Exception as e:
        conn.close()
        return jsonify({"success": False, "message": str(e)})

@bp.route("/admin/delete_<page_type>_menu/<int:item_id>", methods=["POST"])
def delete_menu(page_type, item_id):
    if (r := _require_admin()): return r
    table = _menu_table(page_type)
    conn = get_db(); cur = conn.cursor()
    try:
        cur.execute(f"DELETE FROM {table} WHERE id = ?", (item_id,))
        conn.commit(); conn.close()
        return jsonify({"success": True})
    except Exception as e:
        conn.close()
        return jsonify({"success": False, "message": str(e)})

@bp.route("/admin/reorder_<page_type>_menu", methods=["POST"])
def reorder_menu(page_type):
    if (r := _require_admin()): return r
    table = _menu_table(page_type)
    ids = request.get_json().get("ids", [])
    if not isinstance(ids, list):
        return jsonify({"success": False, "message": "Некорректные данные"})
    conn = get_db(); cur = conn.cursor()
    try:
        for idx, item_id in enumerate(ids):
            cur.execute(f"UPDATE {table} SET sort_order = ? WHERE id = ?", (idx, item_id))
        conn.commit(); conn.close()
        return jsonify({"success": True})
    except Exception as e:
        conn.close()
        return jsonify({"success": False, "message": str(e)})

@bp.route("/menu/view/<page_type>/<int:item_id>")
def universal_menu_view(page_type, item_id):
    table = _menu_table(page_type)
    conn = get_db()
    item = conn.execute(
        f"SELECT id, letter, text FROM {table} WHERE id = ?", (item_id,)
    ).fetchone()
    conn.close()
    if not item:
        abort(404)
    return render_template("left_menu_view.html", item_id=item["id"],
                           item_title=item["letter"],
                           item_html=item["text"] or "<p><em>Нет содержимого</em></p>",
                           mode="view")

@bp.route("/menu/edit/<page_type>/<int:item_id>")
def universal_menu_edit(page_type, item_id):
    if "admin_id" not in session:
        abort(403)
    table = _menu_table(page_type)
    conn = get_db()
    item = conn.execute(
        f"SELECT id, letter, text FROM {table} WHERE id = ?", (item_id,)
    ).fetchone()
    conn.close()
    if not item:
        abort(404)
    return render_template("left_menu_view.html", item_id=item["id"],
                           item_title=item["letter"], item_html=item["text"] or "",
                           mode="edit", page_type=page_type)

@bp.route("/menu/new/<page_type>")
def universal_menu_new(page_type):
    if "admin_id" not in session:
        abort(403)
    if page_type not in MENU_TABLES:
        abort(404)
    title = request.args.get("title", "").strip() or "Новый пункт"
    return render_template("left_menu_view.html", item_id=0, item_title=title,
                           item_html="", mode="new", page_type=page_type)


@bp.route("/admin/add_news", methods=["POST"])
def add_news():
    if (r := _require_admin()): return r
    title = request.form.get("title", "").strip()
    content = request.form.get("content", "").strip()
    date_str = request.form.get("date", "").strip()
    if not title or not content:
        return jsonify({"success": False, "message": "Заполните заголовок и содержание"})
    created_date = f"{date_str} 00:00:00" if date_str else datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    media_urls = []
    for file in request.files.getlist("media_files"):
        if not file or file.filename == "":
            continue
        if not allowed_file(file.filename):
            return jsonify({"success": False, "message": "Неподдерживаемый формат файла"})
        url, _ = save_uploaded_file(file, UPLOAD_FOLDER)
        media_urls.append(url)

    conn = get_db(); cur = conn.cursor()
    try:
        cur.execute(
            "INSERT INTO news (title, content, media, created_date, admin_id) VALUES (?, ?, ?, ?, ?)",
            (title, content, ";".join(media_urls), created_date, session["admin_id"]))
        conn.commit()
        new_id = cur.lastrowid
        item = conn.execute(
            """SELECT news.*, admins.full_name as author_name
               FROM news LEFT JOIN admins ON news.admin_id = admins.id
               WHERE news.id = ?""", (new_id,)).fetchone()
        conn.close()
        return jsonify({"success": True, "item": dict(item)})
    except Exception as e:
        conn.close()
        return jsonify({"success": False, "message": str(e)})

@bp.route("/api/news/<int:news_id>")
def api_news_by_id(news_id):
    conn = get_db()
    item = conn.execute(
        """SELECT news.*, admins.full_name as author_name
           FROM news LEFT JOIN admins ON news.admin_id = admins.id
           WHERE news.id = ?""", (news_id,)).fetchone()
    conn.close()
    return jsonify({"success": True, "news": dict(item)}) if item else \
           jsonify({"success": False, "message": "Новость не найдена"})

@bp.route("/admin/edit_news/<int:news_id>", methods=["POST"])
def edit_news(news_id):
    if (r := _require_admin()): return r
    title = request.form.get("title", "").strip()
    content = request.form.get("content", "").strip()
    date_str = request.form.get("date", "").strip()
    if not title or not content:
        return jsonify({"success": False, "message": "Заполните заголовок и содержание"})
    created_date = f"{date_str} 00:00:00" if date_str else datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    existing = request.form.get("existing_media", "").strip()
    media_urls = [u for u in existing.split(";") if u.strip()] if existing else []

    for file in request.files.getlist("media_files"):
        if not file or file.filename == "":
            continue
        if not allowed_file(file.filename):
            return jsonify({"success": False, "message": "Неподдерживаемый формат файла"})
        url, _ = save_uploaded_file(file, UPLOAD_FOLDER)
        media_urls.append(url)

    conn = get_db(); cur = conn.cursor()
    try:
        cur.execute(
            "UPDATE news SET title = ?, content = ?, media = ?, created_date = ? WHERE id = ?",
            (title, content, ";".join(media_urls), created_date, news_id))
        conn.commit()
        item = conn.execute(
            """SELECT news.*, admins.full_name as author_name
               FROM news LEFT JOIN admins ON news.admin_id = admins.id
               WHERE news.id = ?""", (news_id,)).fetchone()
        conn.close()
        return jsonify({"success": True, "item": dict(item)})
    except Exception as e:
        conn.close()
        return jsonify({"success": False, "message": str(e)})

@bp.route("/admin/delete_news/<int:news_id>", methods=["POST"])
def delete_news(news_id):
    if (r := _require_admin()): return r
    conn = get_db()
    try:
        conn.execute("DELETE FROM news WHERE id = ?", (news_id,))
        conn.commit(); conn.close()
        return jsonify({"success": True})
    except Exception as e:
        conn.close()
        return jsonify({"success": False, "message": str(e)})

@bp.route("/api/news")
def api_news():
    offset = request.args.get("offset", 0, type=int)
    limit = request.args.get("limit", 10, type=int)
    date_filter = request.args.get("date", "").strip()
    where, params = "", []
    if date_filter:
        where = "WHERE date(news.created_date) = ?"
        params.append(date_filter)
    conn = get_db()
    total = conn.execute(f"SELECT COUNT(*) as c FROM news {where}", params).fetchone()["c"]
    news = conn.execute(
        f"""SELECT news.*, admins.full_name as author_name
            FROM news LEFT JOIN admins ON news.admin_id = admins.id
            {where} ORDER BY news.created_date DESC, news.id DESC
            LIMIT ? OFFSET ?""", params + [limit, offset]).fetchall()
    conn.close()
    return jsonify({"success": True, "total": total, "news": [dict(n) for n in news]})

@bp.route("/api/news_dates")
def api_news_dates():
    conn = get_db()
    dates = conn.execute(
        "SELECT DISTINCT date(created_date) as d FROM news ORDER BY d DESC"
    ).fetchall()
    conn.close()
    return jsonify({"success": True, "dates": [r["d"] for r in dates if r["d"]]})

@bp.route("/admin/add_right_ad", methods=["POST"])
def add_right_ad():
    if (r := _require_admin()): return r
    content_type = request.form.get("type", "media")
    content = request.form.get("content", "").strip()
    link = request.form.get("link", "").strip()
    html_content = request.form.get("html_content", "").strip()
    media_url = ""

    if content_type == "html":
        if not html_content:
            return jsonify({"success": False, "message": "HTML-код не может быть пустым"})
        if not any(tag in html_content.lower() for tag in ('<', '>', 'div', 'script', 'style', 'iframe')):
            return jsonify({"success": False, "message": "Вставьте корректный HTML-код"})
        if not content:
            content = html_content[:100] + "..." if len(html_content) > 100 else html_content
    else:
        file = request.files.get("media_file")
        if not file or file.filename == "":
            return jsonify({"success": False, "message": "Файл не выбран"})
        if not allowed_file(file.filename):
            return jsonify({"success": False, "message": "Неподдерживаемый формат файла"})
        media_url, _ = save_uploaded_file(file, UPLOAD_FOLDER)
        if not content:
            content = file.filename

    conn = get_db(); cur = conn.cursor()
    next_order = cur.execute(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM right_ads"
    ).fetchone()["n"]
    try:
        cur.execute(
            """INSERT INTO right_ads (media, content, link, html_content, sort_order)
               VALUES (?, ?, ?, ?, ?)""",
            (media_url, content, link, html_content, next_order))
        conn.commit()
        new_id = cur.lastrowid
        item = conn.execute(
            "SELECT id, media, content, link, html_content, sort_order FROM right_ads WHERE id = ?",
            (new_id,)).fetchone()
        conn.close()
        return jsonify({"success": True, "item": dict(item)})
    except Exception as e:
        conn.close()
        return jsonify({"success": False, "message": str(e)})

@bp.route("/admin/delete_right_ad/<int:ad_id>", methods=["POST"])
def delete_right_ad(ad_id):
    if (r := _require_admin()): return r
    conn = get_db()
    try:
        ad = conn.execute("SELECT media FROM right_ads WHERE id = ?", (ad_id,)).fetchone()
        if ad and ad["media"] and ad["media"].startswith("/static/uploads/"):
            path = os.path.join(".", ad["media"][1:])
            if os.path.exists(path):
                try: os.remove(path)
                except Exception: pass
        conn.execute("DELETE FROM right_ads WHERE id = ?", (ad_id,))
        conn.commit(); conn.close()
        return jsonify({"success": True})
    except Exception as e:
        conn.close()
        return jsonify({"success": False, "message": str(e)})

@bp.route("/admin/reorder_right_ads", methods=["POST"])
def reorder_right_ads():
    if (r := _require_admin()): return r
    ids = request.get_json().get("ids", [])
    if not isinstance(ids, list):
        return jsonify({"success": False, "message": "Некорректные данные"})
    conn = get_db(); cur = conn.cursor()
    try:
        for idx, ad_id in enumerate(ids):
            cur.execute("UPDATE right_ads SET sort_order = ? WHERE id = ?", (idx, ad_id))
        conn.commit(); conn.close()
        return jsonify({"success": True})
    except Exception as e:
        conn.close()
        return jsonify({"success": False, "message": str(e)})

@bp.route("/admin/upload_media", methods=["POST"])
def upload_media():
    if (r := _require_admin()): return r
    file = request.files.get("file")
    if not file or file.filename == "":
        return jsonify({"success": False, "message": "Файл не выбран"})
    if not allowed_file(file.filename):
        return jsonify({"success": False, "message": "Неподдерживаемый формат файла"})
    url, _ = save_uploaded_file(file, UPLOAD_FOLDER)
    return jsonify({"success": True, "url": url})


@bp.route("/api/admins")
def api_admins():
    if "admin_id" not in session:
        return jsonify({"success": False, "message": "Не авторизован"}), 403
    conn = get_db()
    admins = conn.execute(
        "SELECT id, full_name, username, level, added_date, hierarchy_number FROM admins ORDER BY level DESC, id"
    ).fetchall()
    conn.close()
    return jsonify({"success": True, "admins": [dict(a) for a in admins]})

@bp.route("/api/admin/visits")
def api_admin_visits():
    if "admin_id" not in session:
        return jsonify({"success": False, "message": "Не авторизован"}), 401
    limit = max(1, min(request.args.get("limit", 100, type=int) or 100, 1000))
    conn = get_stats_db()
    total = conn.execute("SELECT COUNT(*) as c FROM visits").fetchone()["c"]
    rows = conn.execute(
        "SELECT timestamp, ip, browser, page, referer FROM visits ORDER BY id DESC LIMIT ?",
        (limit,)).fetchall()
    conn.close()
    return jsonify({"success": True, "visits": [dict(r) for r in rows], "total": total})

@bp.route("/api/admin/behavior")
def api_admin_behavior():
    if "admin_id" not in session:
        return jsonify({"success": False, "message": "Не авторизован"}), 401
    limit = max(1, min(request.args.get("limit", 50, type=int) or 50, 500))
    conn = get_stats_db()
    rows = conn.execute(
        """SELECT timestamp, page, screen, load_time, time_on_page, clicks, scroll_depth
           FROM client_stats ORDER BY id DESC LIMIT ?""", (limit,)).fetchall()
    conn.close()
    return jsonify({"success": True, "clients": [dict(r) for r in rows]})

@bp.route("/admin/add_admin", methods=["POST"])
def add_admin():
    if "admin_id" not in session:
        return jsonify({"success": False, "message": "Не авторизован"}), 403
    data = request.get_json()
    full_name = data.get("fullname", "").strip()
    username = data.get("username", "").strip()
    password = data.get("password", "").strip()
    new_level = data.get("level", 0)
    if not full_name or not username or not password:
        return jsonify({"success": False, "message": "Все поля обязательны"})
    if len(password) < 6:
        return jsonify({"success": False, "message": "Пароль должен содержать минимум 6 символов"})
    conn = get_db()
    cur_admin = _current_admin(conn)
    if not cur_admin:
        conn.close()
        return jsonify({"success": False, "message": "Текущий администратор не найден"})
    if new_level >= cur_admin["level"]:
        conn.close()
        return jsonify({"success": False,
                        "message": f"Вы не можете создать администратора с уровнем {new_level}. Ваш уровень: {cur_admin['level']}. Доступны уровни ниже вашего."})
    if new_level < 1 or new_level > 5:
        conn.close()
        return jsonify({"success": False, "message": "Уровень должен быть от 1 до 5"})
    if conn.execute("SELECT id FROM admins WHERE username = ?", (username,)).fetchone():
        conn.close()
        return jsonify({"success": False, "message": f"Логин '{username}' уже занят"})
    next_hierarchy = conn.execute(
        "SELECT COALESCE(MAX(hierarchy_number), 0) + 1 AS n FROM admins"
    ).fetchone()["n"]
    try:
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO admins (full_name, added_date, added_by, hierarchy_number, username, password, level)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (full_name, datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
             cur_admin["username"], next_hierarchy, username,
             hash_password(password), new_level))
        conn.commit()
        new_id = cur.lastrowid
        new_admin = conn.execute(
            "SELECT id, full_name, username, level FROM admins WHERE id = ?",
            (new_id,)).fetchone()
        conn.close()
        return jsonify({"success": True, "admin": dict(new_admin)})
    except Exception as e:
        conn.close()
        return jsonify({"success": False, "message": str(e)})

@bp.route("/admin/edit_admin/<int:admin_id>", methods=["POST"])
def edit_admin(admin_id):
    if "admin_id" not in session:
        return jsonify({"success": False, "message": "Не авторизован"}), 403
    data = request.get_json()
    full_name = data.get("fullname", "").strip()
    username = data.get("username", "").strip()
    password = data.get("password", "").strip()
    new_level = data.get("level", 0)
    if not full_name or not username:
        return jsonify({"success": False, "message": "ФИО и логин обязательны"})
    conn = get_db()
    cur_admin = _current_admin(conn)
    if not cur_admin:
        conn.close()
        return jsonify({"success": False, "message": "Текущий администратор не найден"})
    target = conn.execute(
        "SELECT id, level, username FROM admins WHERE id = ?", (admin_id,)).fetchone()
    if not target:
        conn.close()
        return jsonify({"success": False, "message": "Администратор не найден"})
    is_self = admin_id == session["admin_id"]
    if not is_self and target["level"] >= cur_admin["level"]:
        conn.close()
        return jsonify({"success": False,
                        "message": f"Недостаточно прав. Ваш уровень: {cur_admin['level']}, уровень редактируемого: {target['level']}"})
    if new_level < 1 or new_level > 5:
        conn.close()
        return jsonify({"success": False, "message": "Уровень должен быть от 1 до 5"})
    if not is_self and new_level >= cur_admin["level"]:
        conn.close()
        return jsonify({"success": False,
                        "message": f"Вы не можете установить уровень {new_level}. Доступны уровни ниже вашего ({cur_admin['level']})."})
    if is_self and new_level > cur_admin["level"]:
        conn.close()
        return jsonify({"success": False,
                        "message": f"Вы не можете повысить свой уровень. Ваш текущий уровень: {cur_admin['level']}"})
    if username != target["username"] and conn.execute(
        "SELECT id FROM admins WHERE username = ? AND id != ?", (username, admin_id)
    ).fetchone():
        conn.close()
        return jsonify({"success": False, "message": f"Логин '{username}' уже занят"})
    try:
        cur = conn.cursor()
        if password and len(password) >= 6:
            cur.execute(
                "UPDATE admins SET full_name = ?, username = ?, password = ?, level = ? WHERE id = ?",
                (full_name, username, hash_password(password), new_level, admin_id))
        else:
            cur.execute(
                "UPDATE admins SET full_name = ?, username = ?, level = ? WHERE id = ?",
                (full_name, username, new_level, admin_id))
        conn.commit(); conn.close()
        return jsonify({"success": True})
    except Exception as e:
        conn.close()
        return jsonify({"success": False, "message": str(e)})

@bp.route("/admin/delete_admin/<int:admin_id>", methods=["POST"])
def delete_admin(admin_id):
    if "admin_id" not in session:
        return jsonify({"success": False, "message": "Не авторизован"}), 403
    if admin_id == session["admin_id"]:
        return jsonify({"success": False, "message": "Нельзя удалить самого себя"})
    conn = get_db()
    cur_admin = _current_admin(conn)
    if not cur_admin:
        conn.close()
        return jsonify({"success": False, "message": "Текущий администратор не найден"})
    target = conn.execute("SELECT id, level FROM admins WHERE id = ?", (admin_id,)).fetchone()
    if not target:
        conn.close()
        return jsonify({"success": False, "message": "Администратор не найден"})
    if target["level"] >= cur_admin["level"]:
        conn.close()
        return jsonify({"success": False,
                        "message": f"Недостаточно прав. Ваш уровень: {cur_admin['level']}, уровень удаляемого: {target['level']}"})
    try:
        conn.execute("DELETE FROM admins WHERE id = ?", (admin_id,))
        conn.commit(); conn.close()
        return jsonify({"success": True})
    except Exception as e:
        conn.close()
        return jsonify({"success": False, "message": str(e)})


@bp.route("/login", methods=["POST"])
def login_post():
    data = request.get_json()
    username = data.get("username", "").strip()
    password = data.get("password", "").strip()
    conn = get_db()
    admin = conn.execute(
        "SELECT id, username, password, level FROM admins WHERE username = ?", (username,)
    ).fetchone()
    conn.close()
    if admin and admin["password"] == hash_password(password):
        session["admin_id"] = admin["id"]
        session["username"] = username
        return jsonify({"success": True})
    return jsonify({"success": False, "message": "Неверный логин или пароль"})

@bp.route("/login")
def login_page():
    return render_template("login.html", active_tab="login")

@bp.route("/admin")
def admin_panel():
    if "admin_id" not in session:
        return redirect(url_for("main.home"))
    conn = get_db()
    admin = conn.execute(
        "SELECT level, username FROM admins WHERE id = ?", (session["admin_id"],)
    ).fetchone()
    conn.close()
    if not admin:
        session.clear()
        return redirect(url_for("main.home"))

    sconn = get_stats_db()
    cur = sconn.cursor()
    visits_total = cur.execute("SELECT COUNT(*) AS c FROM visits").fetchone()["c"]
    unique_ips = cur.execute("SELECT COUNT(DISTINCT ip) AS c FROM visits").fetchone()["c"]
    browsers = {r["browser"]: r["count"] for r in cur.execute("SELECT browser, count FROM browser_stats").fetchall()}
    pages = {r["page"]: r["count"] for r in cur.execute("SELECT page, count FROM page_views").fetchall()}
    referers = {r["referer"]: r["count"] for r in cur.execute("SELECT referer, count FROM referer_stats").fetchall()}
    screens = {r["screen"]: r["count"] for r in cur.execute("SELECT screen, count FROM screen_stats").fetchall()}
    sconn.close()

    return render_template("admin.html", username=session.get("username", ""),
                           user_level=admin["level"],
                           stats={"visits_total": visits_total, "browsers": browsers,
                                  "page_views": pages, "referers": referers, "screens": screens},
                           unique_ips=unique_ips, visits_total=visits_total)

@bp.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("main.home"))


@bp.route("/text_redactor")
def text_redactor():
    return render_template("text_redactor.html")

@bp.route("/upload", methods=["POST"])
def editor_upload():
    f = request.files.get("file")
    if not f or not f.filename:
        return jsonify({"error": "no file"}), 400
    ext = os.path.splitext(f.filename)[1].lower()
    unique = uuid.uuid4().hex + ext
    save_path = os.path.join(EDITOR_UPLOAD_FOLDER, unique)
    f.save(save_path)
    return jsonify({"url": "/data/upload/" + unique, "name": f.filename,
                    "size": os.path.getsize(save_path), "type": f.mimetype})

@bp.route("/api/document", methods=["GET"])
def get_editor_document():
    path = os.path.join(EDITOR_DOCS_FOLDER, EDITOR_DOC_NAME + ".vd5")
    if not os.path.exists(path):
        return jsonify({"format": "vd5", "version": 1, "content": ""})
    with open(path, "r", encoding="utf-8") as f:
        return jsonify(json.load(f))

@bp.route("/api/document", methods=["POST"])
def save_editor_document():
    data = request.get_json(silent=True)
    if not data or not isinstance(data.get("content"), str):
        return jsonify({"error": "invalid payload"}), 400
    path = os.path.join(EDITOR_DOCS_FOLDER, EDITOR_DOC_NAME + ".vd5")
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    os.replace(tmp, path)
    return jsonify({"ok": True})


@bp.route("/")
def home():
    conn = get_db()
    news = conn.execute(
        """SELECT news.*, admins.full_name as author_name
           FROM news LEFT JOIN admins ON news.admin_id = admins.id
           ORDER BY news.created_date DESC, news.id DESC LIMIT 10""").fetchall()
    right_ads = conn.execute("SELECT * FROM right_ads ORDER BY sort_order").fetchall()
    conn.close()

    ua = request.headers.get("User-Agent", "Unknown")
    browser = detect_browser(ua)
    ip = request.remote_addr
    page = request.path
    referer = request.headers.get("Referer", "прямой переход")

    add_visit(ip, browser, page, referer, ua)
    increment_counter("browser_stats", "browser", browser)
    increment_counter("page_views", "page", page)
    if referer and referer != "прямой переход":
        increment_counter("referer_stats", "referer", referer)

    return render_template("home.html", active_tab="home", news=news,
                           right_ads=right_ads,
                           is_admin=session.get("admin_id") is not None,
                           page_type="home")

@bp.route("/home")
def home_page():
    return home()

@bp.route("/news/<int:news_id>")
def news_detail(news_id):
    conn = get_db()
    news = conn.execute(
        """SELECT news.*, admins.full_name as author_name
           FROM news LEFT JOIN admins ON news.admin_id = admins.id
           WHERE news.id = ?""", (news_id,)).fetchone()
    conn.close()
    if not news:
        return "404 нету такой новости", 404
    return render_template("news_detail.html", news=news,
                           is_admin=session.get("admin_id") is not None)

@bp.route("/abiturient")
def abiturient():
    return render_template("abiturient.html", active_tab="abiturient", page_type="abiturient")

@bp.route("/students")
def students():
    return render_template("students.html", active_tab="students", page_type="students")

@bp.route("/parents")
def parents():
    return render_template("parents.html", active_tab="parents", page_type="parents")

@bp.route("/staff")
def staff():
    return render_template("staff.html", active_tab="staff", page_type="staff")

@bp.route("/about")
def about():
    return render_template("about.html", active_tab="about")

@bp.route("/contacts")
def contacts():
    return render_template("contacts.html", active_tab="contacts")

@bp.route("/preview")
def preview():
    return render_template("preview.html")

@bp.route("/calendar")
def calendar():
    return render_template("cal.html")

@bp.route("/api/system")
def api_system():
    return jsonify(get_system_stats())

@bp.route("/api/stats", methods=["POST"])
def api_stats():
    data = request.json
    add_client_stats(data)
    if data.get("screen"):
        increment_counter("screen_stats", "screen", data["screen"])
    return jsonify({"status": "ok"})

@bp.route("/stats")
def stats_page():
    return render_template("stats.html", stats=get_stats_data(),
                           visits=get_stats_data()["visits"],
                           unique_ips=get_unique_ips_count(),
                           system_stats=get_system_stats())
