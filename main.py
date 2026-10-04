import hashlib
import os
import sqlite3
from datetime import datetime
from collections import deque
import threading
import time
import platform
import psutil
from werkzeug.utils import secure_filename
from flask_minify import Minify
from PIL import Image
from dotenv import load_dotenv

from flask import (
    Flask,
    jsonify,
    redirect,
    render_template,
    request,
    send_from_directory,
    session,
    url_for,
)

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY")
Minify(app=app, html=True, js=True, cssless=True)

UPLOAD_FOLDER = os.getenv("UPLOAD_FOLDER")
WP_UPLOAD_FOLDER = os.getenv("WP_UPLOAD_FOLDER")
ALLOWED_EXTENSIONS = set(os.getenv("ALLOWED_EXTENSIONS").split(","))
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(WP_UPLOAD_FOLDER, exist_ok=True)

STATS_DB = os.getenv("STATS_DB")
MAIN_DB = os.getenv("MAIN_DB")

MAX_IMAGE_WIDTH = int(os.getenv("MAX_IMAGE_WIDTH"))
MAX_IMAGE_HEIGHT = int(os.getenv("MAX_IMAGE_HEIGHT"))
IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "webp"}

DEFAULT_ADMIN_FULLNAME = os.getenv("DEFAULT_ADMIN_FULLNAME")
DEFAULT_ADMIN_USERNAME = os.getenv("DEFAULT_ADMIN_USERNAME")
DEFAULT_ADMIN_PASSWORD = os.getenv("DEFAULT_ADMIN_PASSWORD")
DEFAULT_ADMIN_LEVEL = int(os.getenv("DEFAULT_ADMIN_LEVEL"))

HOST = os.getenv("HOST")
PORT = int(os.getenv("PORT"))
DEBUG = os.getenv("DEBUG").lower() in ("true", "1", "yes")


def get_stats_db():
    conn = sqlite3.connect(STATS_DB)
    conn.row_factory = sqlite3.Row
    return conn


def init_stats_db():
    conn = get_stats_db()
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS visits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            ip TEXT NOT NULL,
            browser TEXT,
            page TEXT,
            referer TEXT,
            user_agent TEXT
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS browser_stats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            browser TEXT UNIQUE NOT NULL,
            count INTEGER DEFAULT 0
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS page_views (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            page TEXT UNIQUE NOT NULL,
            count INTEGER DEFAULT 0
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS referer_stats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            referer TEXT UNIQUE NOT NULL,
            count INTEGER DEFAULT 0
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS screen_stats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            screen TEXT UNIQUE NOT NULL,
            count INTEGER DEFAULT 0
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS client_stats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            page TEXT,
            screen TEXT,
            load_time REAL,
            time_on_page REAL,
            clicks INTEGER,
            scroll_depth INTEGER
        )
    """)

    conn.commit()
    conn.close()


init_stats_db()


def increment_counter(table, field, value):
    conn = get_stats_db()
    cursor = conn.cursor()

    cursor.execute(f"SELECT id, count FROM {table} WHERE {field} = ?", (value,))
    row = cursor.fetchone()

    if row:
        cursor.execute(f"UPDATE {table} SET count = count + 1 WHERE {field} = ?", (value,))
    else:
        cursor.execute(f"INSERT INTO {table} ({field}, count) VALUES (?, 1)", (value,))

    conn.commit()
    conn.close()


def get_stats_data():
    conn = get_stats_db()
    cursor = conn.cursor()

    visits = cursor.execute(
        "SELECT timestamp, ip, browser, page, referer, user_agent FROM visits ORDER BY timestamp DESC"
    ).fetchall()

    browsers = cursor.execute("SELECT browser, count FROM browser_stats").fetchall()
    browsers_dict = {row['browser']: row['count'] for row in browsers}

    page_views = cursor.execute("SELECT page, count FROM page_views").fetchall()
    page_views_dict = {row['page']: row['count'] for row in page_views}

    referers = cursor.execute("SELECT referer, count FROM referer_stats").fetchall()
    referers_dict = {row['referer']: row['count'] for row in referers}

    screens = cursor.execute("SELECT screen, count FROM screen_stats").fetchall()
    screens_dict = {row['screen']: row['count'] for row in screens}

    clients = cursor.execute(
        "SELECT timestamp, page, screen, load_time, time_on_page, clicks, scroll_depth FROM client_stats ORDER BY timestamp DESC"
    ).fetchall()

    conn.close()

    return {
        'visits': [dict(v) for v in visits],
        'browsers': browsers_dict,
        'page_views': page_views_dict,
        'referers': referers_dict,
        'screens': screens_dict,
        'clients': [dict(c) for c in clients]
    }


def add_visit(ip, browser, page, referer, user_agent):
    conn = get_stats_db()
    cursor = conn.cursor()

    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    cursor.execute(
        "INSERT INTO visits (timestamp, ip, browser, page, referer, user_agent) VALUES (?, ?, ?, ?, ?, ?)",
        (timestamp, ip, browser, page, referer, user_agent)
    )

    conn.commit()
    conn.close()


def add_client_stats(data):
    conn = get_stats_db()
    cursor = conn.cursor()

    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    cursor.execute(
        """INSERT INTO client_stats
           (timestamp, page, screen, load_time, time_on_page, clicks, scroll_depth)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (
            timestamp,
            data.get('page'),
            data.get('screen'),
            data.get('load_time'),
            data.get('time_on_page'),
            data.get('clicks'),
            data.get('scroll_depth')
        )
    )

    conn.commit()
    conn.close()


def get_unique_ips_count():
    conn = get_stats_db()
    cursor = conn.cursor()

    result = cursor.execute("SELECT COUNT(DISTINCT ip) as count FROM visits").fetchone()

    conn.close()
    return result['count'] if result else 0


history_data = {"cpu": deque(maxlen=30), "timestamps": deque(maxlen=30)}


def collect_history():
    while True:
        history_data["cpu"].append(psutil.cpu_percent(interval=1))
        history_data["timestamps"].append(time.strftime("%H:%M:%S"))
        time.sleep(2)


threading.Thread(target=collect_history, daemon=True).start()


def get_system_stats():
    cpu_percent = psutil.cpu_percent(interval=0.3)
    cpu_freq = psutil.cpu_freq()
    mem = psutil.virtual_memory()
    disk = psutil.disk_usage("/")
    net = psutil.net_io_counters()

    processes = []
    for proc in sorted(
        psutil.process_iter(["name", "cpu_percent", "memory_percent"]),
        key=lambda p: p.info["cpu_percent"] or 0,
        reverse=True,
    )[:10]:
        try:
            name = (proc.info["name"] or "unknown")[:25]
            processes.append(
                {
                    "name": name,
                    "cpu": round(proc.info["cpu_percent"] or 0, 1),
                    "memory": round(proc.info["memory_percent"] or 0, 1),
                }
            )
        except:
            pass

    temps = []
    try:
        for name, entries in psutil.sensors_temperatures().items():
            for entry in entries[:2]:
                temps.append({"sensor": name, "current": entry.current})
    except:
        pass

    uptime_seconds = time.time() - psutil.boot_time()
    hours = int(uptime_seconds // 3600)
    minutes = int((uptime_seconds % 3600) // 60)

    return {
        "hostname": platform.node(),
        "os": platform.system(),
        "uptime": f"{hours}h {minutes}m",
        "cpu": {
            "percent": cpu_percent,
            "freq": int(cpu_freq.current) if cpu_freq else 0,
            "cores": psutil.cpu_count(),
        },
        "memory": {"percent": mem.percent, "total": mem.total, "used": mem.used},
        "disk": {"percent": disk.percent, "total": disk.total, "used": disk.used},
        "network": {"bytes_sent": net.bytes_sent, "bytes_recv": net.bytes_recv},
        "processes": processes,
        "temperatures": temps,
        "history": {
            "cpu": list(history_data["cpu"]),
            "timestamps": list(history_data["timestamps"]),
        },
    }


def get_db():
    conn = sqlite3.connect(MAIN_DB)
    conn.row_factory = sqlite3.Row
    return conn


def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()


def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def compress_image(filepath, max_width=MAX_IMAGE_WIDTH, max_height=MAX_IMAGE_HEIGHT):
    ext = filepath.rsplit(".", 1)[-1].lower()
    if ext not in IMAGE_EXTENSIONS:
        return

    try:
        img = Image.open(filepath)

        if img.mode in ("RGBA", "P"):
            img = img.convert("RGBA")
        elif img.mode != "RGB":
            img = img.convert("RGB")

        width, height = img.size
        if width <= max_width and height <= max_height:
            if ext in ("jpg", "jpeg"):
                img.save(filepath, "JPEG", quality=85, optimize=True)
            elif ext == "png":
                img.save(filepath, "PNG", optimize=True)
            elif ext == "webp":
                img.save(filepath, "WEBP", quality=85, optimize=True)
            return

        ratio = min(max_width / width, max_height / height)
        new_width = int(width * ratio)
        new_height = int(height * ratio)

        img = img.resize((new_width, new_height), Image.LANCZOS)

        if ext in ("jpg", "jpeg"):
            img.save(filepath, "JPEG", quality=85, optimize=True)
        elif ext == "png":
            img.save(filepath, "PNG", optimize=True)
        elif ext == "webp":
            img.save(filepath, "WEBP", quality=85, optimize=True)
        elif ext == "gif":
            img.save(filepath, "GIF", optimize=True)
        else:
            img.save(filepath, optimize=True)

        print(f"🖼️ Изображение сжато: {filepath} -> {new_width}x{new_height}")
    except Exception as e:
        print(f"⚠️ Ошибка сжатия изображения {filepath}: {e}")


def migrate_db():
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("PRAGMA table_info(admins)")
        columns = [col[1] for col in cursor.fetchall()]
        if "level" not in columns:
            cursor.execute("ALTER TABLE admins ADD COLUMN level INTEGER DEFAULT 5")
            cursor.execute("UPDATE admins SET level = 5 WHERE level IS NULL")

        cursor.execute("PRAGMA table_info(news)")
        columns = [col[1] for col in cursor.fetchall()]
        if "admin_id" not in columns:
            cursor.execute(
                "ALTER TABLE news ADD COLUMN admin_id INTEGER REFERENCES admins(id)"
            )

        cursor.execute("PRAGMA table_info(left_menu_items)")
        columns = [col[1] for col in cursor.fetchall()]
        if "text" not in columns:
            cursor.execute(
                "ALTER TABLE left_menu_items ADD COLUMN text TEXT DEFAULT ''"
            )

        cursor.execute("PRAGMA table_info(right_ads)")
        columns = [col[1] for col in cursor.fetchall()]
        if "html_content" not in columns:
            cursor.execute("ALTER TABLE right_ads ADD COLUMN html_content TEXT DEFAULT ''")
            print("✅ Добавлено поле html_content в таблицу right_ads")

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS abiturient_menu_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                letter TEXT NOT NULL,
                text TEXT,
                link TEXT,
                sort_order INTEGER DEFAULT 0
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS students_menu_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                letter TEXT NOT NULL,
                text TEXT,
                link TEXT,
                sort_order INTEGER DEFAULT 0
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS parents_menu_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                letter TEXT NOT NULL,
                text TEXT,
                link TEXT,
                sort_order INTEGER DEFAULT 0
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS staff_menu_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                letter TEXT NOT NULL,
                text TEXT,
                link TEXT,
                sort_order INTEGER DEFAULT 0
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS right_ads (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                media TEXT,
                content TEXT NOT NULL,
                link TEXT,
                sort_order INTEGER DEFAULT 0
            )
        """)
        conn.commit()
    except Exception as e:
        print("Ошибка миграции:", e)
    finally:
        conn.close()


def init_db():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS admins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            full_name TEXT NOT NULL,
            added_date TEXT NOT NULL,
            added_by TEXT NOT NULL,
            hierarchy_number INTEGER UNIQUE NOT NULL,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            level INTEGER DEFAULT 5
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS left_menu_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            letter TEXT NOT NULL,
            text TEXT,
            link TEXT,
            sort_order INTEGER DEFAULT 0
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS abiturient_menu_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            letter TEXT NOT NULL,
            text TEXT,
            link TEXT,
            sort_order INTEGER DEFAULT 0
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS students_menu_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            letter TEXT NOT NULL,
            text TEXT,
            link TEXT,
            sort_order INTEGER DEFAULT 0
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS parents_menu_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            letter TEXT NOT NULL,
            text TEXT,
            link TEXT,
            sort_order INTEGER DEFAULT 0
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS staff_menu_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            letter TEXT NOT NULL,
            text TEXT,
            link TEXT,
            sort_order INTEGER DEFAULT 0
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS news (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            media TEXT,
            created_date TEXT DEFAULT CURRENT_TIMESTAMP,
            admin_id INTEGER REFERENCES admins(id)
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS right_ads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            media TEXT,
            content TEXT NOT NULL,
            link TEXT,
            sort_order INTEGER DEFAULT 0
        )
    """)
    conn.commit()
    conn.close()
    migrate_db()


def create_default_admin():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) as count FROM admins")
    result = cursor.fetchone()
    if result["count"] == 0:
        hashed = hash_password(DEFAULT_ADMIN_PASSWORD)
        cursor.execute(
            """
            INSERT INTO admins (full_name, added_date, added_by, hierarchy_number, username, password, level)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
            (
                DEFAULT_ADMIN_FULLNAME,
                datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "Программа",
                5,
                DEFAULT_ADMIN_USERNAME,
                hashed,
                DEFAULT_ADMIN_LEVEL,
            ),
        )
        conn.commit()
    conn.close()


init_db()
create_default_admin()


def get_media_url(media_path):
    if not media_path:
        return ""
    if media_path.startswith("/static/"):
        return media_path
    if media_path.startswith("/wp-content/"):
        return f"/static{media_path}"
    if media_path.startswith("wp-content/"):
        return f"/static/{media_path}"
    if media_path.startswith("/uploads/"):
        return f"/static{media_path}"
    if media_path.startswith("uploads/"):
        return f"/static/{media_path}"
    if not media_path.startswith("/"):
        return f"/static/uploads/{media_path}"
    return media_path


def detect_browser(ua):
    ua = ua.lower()
    if 'chrome' in ua and 'edg' not in ua and 'opr' not in ua:
        return 'Chrome'
    elif 'firefox' in ua:
        return 'Firefox'
    elif 'safari' in ua and 'chrome' not in ua:
        return 'Safari'
    elif 'edg' in ua:
        return 'Edge'
    elif 'opr' in ua or 'opera' in ua:
        return 'Opera'
    else:
        return 'Other'


@app.route("/wp-content/uploads/<path:filename>")
def wp_content_uploads(filename):
    return send_from_directory("static/wp-content/uploads", filename)


@app.route("/uploads/<path:filename>")
def uploads_files(filename):
    return send_from_directory("static/uploads", filename)


@app.route("/api/admins")
def api_admins():
    if "admin_id" not in session:
        return jsonify({"success": False, "message": "Не авторизован"}), 403
    conn = get_db()
    admins = conn.execute(
        "SELECT id, full_name, username, level, added_date, hierarchy_number FROM admins ORDER BY level DESC, id"
    ).fetchall()
    conn.close()
    return jsonify({"success": True, "admins": [dict(a) for a in admins]})


@app.route("/admin/add_admin", methods=["POST"])
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
        return jsonify(
            {"success": False, "message": "Пароль должен содержать минимум 6 символов"}
        )
    conn = get_db()
    current_admin = conn.execute(
        "SELECT id, level, username FROM admins WHERE id = ?", (session["admin_id"],)
    ).fetchone()
    if not current_admin:
        conn.close()
        return jsonify({"success": False, "message": "Текущий администратор не найден"})
    current_level = current_admin["level"]
    if new_level >= current_level:
        conn.close()
        return jsonify(
            {
                "success": False,
                "message": f"Вы не можете создать администратора с уровнем {new_level}. Ваш уровень: {current_level}. Доступны уровни ниже вашего.",
            }
        )
    if new_level < 1 or new_level > 5:
        conn.close()
        return jsonify({"success": False, "message": "Уровень должен быть от 1 до 5"})
    existing = conn.execute(
        "SELECT id FROM admins WHERE username = ?", (username,)
    ).fetchone()
    if existing:
        conn.close()
        return jsonify({"success": False, "message": f"Логин '{username}' уже занят"})
    max_hierarchy = conn.execute(
        "SELECT COALESCE(MAX(hierarchy_number), 0) + 1 as next_num FROM admins"
    ).fetchone()["next_num"]
    hashed = hash_password(password)
    added_date = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO admins (full_name, added_date, added_by, hierarchy_number, username, password, level)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                full_name,
                added_date,
                current_admin["username"],
                max_hierarchy,
                username,
                hashed,
                new_level,
            ),
        )
        conn.commit()
        new_id = cursor.lastrowid
        new_admin = conn.execute(
            "SELECT id, full_name, username, level FROM admins WHERE id = ?", (new_id,)
        ).fetchone()
        conn.close()
        return jsonify({"success": True, "admin": dict(new_admin)})
    except Exception as e:
        conn.close()
        return jsonify({"success": False, "message": str(e)})


@app.route("/admin/edit_admin/<int:admin_id>", methods=["POST"])
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

    current_admin = conn.execute(
        "SELECT id, level, username FROM admins WHERE id = ?", (session["admin_id"],)
    ).fetchone()
    if not current_admin:
        conn.close()
        return jsonify({"success": False, "message": "Текущий администратор не найден"})

    target_admin = conn.execute(
        "SELECT id, level, username FROM admins WHERE id = ?", (admin_id,)
    ).fetchone()
    if not target_admin:
        conn.close()
        return jsonify({"success": False, "message": "Администратор не найден"})

    is_self = admin_id == session["admin_id"]
    if not is_self and target_admin["level"] >= current_admin["level"]:
        conn.close()
        return jsonify(
            {
                "success": False,
                "message": f"Недостаточно прав. Ваш уровень: {current_admin['level']}, уровень редактируемого: {target_admin['level']}",
            }
        )

    if new_level < 1 or new_level > 5:
        conn.close()
        return jsonify({"success": False, "message": "Уровень должен быть от 1 до 5"})

    if not is_self:
        if new_level >= current_admin["level"]:
            conn.close()
            return jsonify(
                {
                    "success": False,
                    "message": f"Вы не можете установить уровень {new_level}. Доступны уровни ниже вашего ({current_admin['level']}).",
                }
            )
    else:
        if new_level > current_admin["level"]:
            conn.close()
            return jsonify(
                {
                    "success": False,
                    "message": f"Вы не можете повысить свой уровень. Ваш текущий уровень: {current_admin['level']}",
                }
            )

    if username != target_admin["username"]:
        existing = conn.execute(
            "SELECT id FROM admins WHERE username = ? AND id != ?", (username, admin_id)
        ).fetchone()
        if existing:
            conn.close()
            return jsonify(
                {"success": False, "message": f"Логин '{username}' уже занят"}
            )

    try:
        cursor = conn.cursor()
        if password and len(password) >= 6:
            hashed = hash_password(password)
            cursor.execute(
                "UPDATE admins SET full_name = ?, username = ?, password = ?, level = ? WHERE id = ?",
                (full_name, username, hashed, new_level, admin_id),
            )
        else:
            cursor.execute(
                "UPDATE admins SET full_name = ?, username = ?, level = ? WHERE id = ?",
                (full_name, username, new_level, admin_id),
            )
        conn.commit()
        conn.close()
        return jsonify({"success": True})
    except Exception as e:
        conn.close()
        return jsonify({"success": False, "message": str(e)})


@app.route("/admin/delete_admin/<int:admin_id>", methods=["POST"])
def delete_admin(admin_id):
    if "admin_id" not in session:
        return jsonify({"success": False, "message": "Не авторизован"}), 403
    if admin_id == session["admin_id"]:
        return jsonify({"success": False, "message": "Нельзя удалить самого себя"})
    conn = get_db()
    current_admin = conn.execute(
        "SELECT id, level FROM admins WHERE id = ?", (session["admin_id"],)
    ).fetchone()
    if not current_admin:
        conn.close()
        return jsonify({"success": False, "message": "Текущий администратор не найден"})
    target_admin = conn.execute(
        "SELECT id, level FROM admins WHERE id = ?", (admin_id,)
    ).fetchone()
    if not target_admin:
        conn.close()
        return jsonify({"success": False, "message": "Администратор не найден"})
    if target_admin["level"] >= current_admin["level"]:
        conn.close()
        return jsonify(
            {
                "success": False,
                "message": f"Недостаточно прав. Ваш уровень: {current_admin['level']}, уровень удаляемого: {target_admin['level']}",
            }
        )
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM admins WHERE id = ?", (admin_id,))
        conn.commit()
        conn.close()
        return jsonify({"success": True})
    except Exception as e:
        conn.close()
        return jsonify({"success": False, "message": str(e)})


@app.route("/api/abiturient_menu_items")
def api_abiturient_menu_items():
    conn = get_db()
    items = conn.execute(
        "SELECT id, letter, text, link FROM abiturient_menu_items ORDER BY sort_order"
    ).fetchall()
    conn.close()
    return jsonify([dict(item) for item in items])


@app.route("/api/abiturient_menu_text/<int:item_id>")
def get_abiturient_menu_text(item_id):
    conn = get_db()
    item = conn.execute(
        "SELECT id, letter, text FROM abiturient_menu_items WHERE id = ?", (item_id,)
    ).fetchone()
    conn.close()
    if item:
        return jsonify(
            {
                "success": True,
                "id": item["id"],
                "title": item["letter"],
                "text": item["text"] or "",
            }
        )
    return jsonify({"success": False, "message": "Пункт не найден"})


@app.route("/admin/add_abiturient_menu", methods=["POST"])
def add_abiturient_menu():
    if "admin_id" not in session:
        return jsonify({"success": False, "message": "Не авторизован"}), 403
    data = request.get_json()
    letter = data.get("letter", "").strip()
    text = data.get("text", "").strip()
    link = data.get("link", "").strip()
    if not letter:
        return jsonify({"success": False, "message": "Поле 'Название' обязательно"})
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM abiturient_menu_items"
    )
    next_order = cursor.fetchone()["next_order"]
    try:
        cursor.execute(
            "INSERT INTO abiturient_menu_items (letter, text, link, sort_order) VALUES (?, ?, ?, ?)",
            (letter, text, link, next_order),
        )
        conn.commit()
        new_id = cursor.lastrowid
        new_item = conn.execute(
            "SELECT id, letter, text, link, sort_order FROM abiturient_menu_items WHERE id = ?",
            (new_id,),
        ).fetchone()
        conn.close()
        return jsonify({"success": True, "item": dict(new_item)})
    except Exception as e:
        conn.close()
        return jsonify({"success": False, "message": str(e)})


@app.route("/admin/update_abiturient_menu/<int:item_id>", methods=["POST"])
def update_abiturient_menu(item_id):
    if "admin_id" not in session:
        return jsonify({"success": False, "message": "Не авторизован"}), 403
    data = request.get_json()
    letter = data.get("letter", "").strip()
    text = data.get("text", "").strip()
    link = data.get("link", "").strip()
    if not letter:
        return jsonify({"success": False, "message": "Поле 'Название' обязательно"})
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "UPDATE abiturient_menu_items SET letter = ?, text = ?, link = ? WHERE id = ?",
            (letter, text, link, item_id),
        )
        conn.commit()
        updated_item = conn.execute(
            "SELECT id, letter, text, link, sort_order FROM abiturient_menu_items WHERE id = ?",
            (item_id,),
        ).fetchone()
        conn.close()
        return jsonify({"success": True, "item": dict(updated_item)})
    except Exception as e:
        conn.close()
        return jsonify({"success": False, "message": str(e)})


@app.route("/admin/delete_abiturient_menu/<int:item_id>", methods=["POST"])
def delete_abiturient_menu(item_id):
    if "admin_id" not in session:
        return jsonify({"success": False, "message": "Не авторизован"}), 403
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM abiturient_menu_items WHERE id = ?", (item_id,))
        conn.commit()
        conn.close()
        return jsonify({"success": True})
    except Exception as e:
        conn.close()
        return jsonify({"success": False, "message": str(e)})


@app.route("/admin/reorder_abiturient_menu", methods=["POST"])
def reorder_abiturient_menu():
    if "admin_id" not in session:
        return jsonify({"success": False, "message": "Не авторизован"}), 403
    data = request.get_json()
    ids = data.get("ids", [])
    if not isinstance(ids, list):
        return jsonify({"success": False, "message": "Некорректные данные"})
    conn = get_db()
    cursor = conn.cursor()
    try:
        for idx, item_id in enumerate(ids):
            cursor.execute(
                "UPDATE abiturient_menu_items SET sort_order = ? WHERE id = ?",
                (idx, item_id),
            )
        conn.commit()
        conn.close()
        return jsonify({"success": True})
    except Exception as e:
        conn.close()
        return jsonify({"success": False, "message": str(e)})


@app.route("/api/students_menu_items")
def api_students_menu_items():
    conn = get_db()
    items = conn.execute(
        "SELECT id, letter, text, link FROM students_menu_items ORDER BY sort_order"
    ).fetchall()
    conn.close()
    return jsonify([dict(item) for item in items])


@app.route("/api/students_menu_text/<int:item_id>")
def get_students_menu_text(item_id):
    conn = get_db()
    item = conn.execute(
        "SELECT id, letter, text FROM students_menu_items WHERE id = ?", (item_id,)
    ).fetchone()
    conn.close()
    if item:
        return jsonify(
            {
                "success": True,
                "id": item["id"],
                "title": item["letter"],
                "text": item["text"] or "",
            }
        )
    return jsonify({"success": False, "message": "Пункт не найден"})


@app.route("/admin/add_students_menu", methods=["POST"])
def add_students_menu():
    if "admin_id" not in session:
        return jsonify({"success": False, "message": "Не авторизован"}), 403
    data = request.get_json()
    letter = data.get("letter", "").strip()
    text = data.get("text", "").strip()
    link = data.get("link", "").strip()
    if not letter:
        return jsonify({"success": False, "message": "Поле 'Название' обязательно"})
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM students_menu_items"
    )
    next_order = cursor.fetchone()["next_order"]
    try:
        cursor.execute(
            "INSERT INTO students_menu_items (letter, text, link, sort_order) VALUES (?, ?, ?, ?)",
            (letter, text, link, next_order),
        )
        conn.commit()
        new_id = cursor.lastrowid
        new_item = conn.execute(
            "SELECT id, letter, text, link, sort_order FROM students_menu_items WHERE id = ?",
            (new_id,),
        ).fetchone()
        conn.close()
        return jsonify({"success": True, "item": dict(new_item)})
    except Exception as e:
        conn.close()
        return jsonify({"success": False, "message": str(e)})


@app.route("/admin/update_students_menu/<int:item_id>", methods=["POST"])
def update_students_menu(item_id):
    if "admin_id" not in session:
        return jsonify({"success": False, "message": "Не авторизован"}), 403
    data = request.get_json()
    letter = data.get("letter", "").strip()
    text = data.get("text", "").strip()
    link = data.get("link", "").strip()
    if not letter:
        return jsonify({"success": False, "message": "Поле 'Название' обязательно"})
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "UPDATE students_menu_items SET letter = ?, text = ?, link = ? WHERE id = ?",
            (letter, text, link, item_id),
        )
        conn.commit()
        updated_item = conn.execute(
            "SELECT id, letter, text, link, sort_order FROM students_menu_items WHERE id = ?",
            (item_id,),
        ).fetchone()
        conn.close()
        return jsonify({"success": True, "item": dict(updated_item)})
    except Exception as e:
        conn.close()
        return jsonify({"success": False, "message": str(e)})


@app.route("/admin/delete_students_menu/<int:item_id>", methods=["POST"])
def delete_students_menu(item_id):
    if "admin_id" not in session:
        return jsonify({"success": False, "message": "Не авторизован"}), 403
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM students_menu_items WHERE id = ?", (item_id,))
        conn.commit()
        conn.close()
        return jsonify({"success": True})
    except Exception as e:
        conn.close()
        return jsonify({"success": False, "message": str(e)})


@app.route("/admin/reorder_students_menu", methods=["POST"])
def reorder_students_menu():
    if "admin_id" not in session:
        return jsonify({"success": False, "message": "Не авторизован"}), 403
    data = request.get_json()
    ids = data.get("ids", [])
    if not isinstance(ids, list):
        return jsonify({"success": False, "message": "Некорректные данные"})
    conn = get_db()
    cursor = conn.cursor()
    try:
        for idx, item_id in enumerate(ids):
            cursor.execute(
                "UPDATE students_menu_items SET sort_order = ? WHERE id = ?",
                (idx, item_id),
            )
        conn.commit()
        conn.close()
        return jsonify({"success": True})
    except Exception as e:
        conn.close()
        return jsonify({"success": False, "message": str(e)})


@app.route("/api/parents_menu_items")
def api_parents_menu_items():
    conn = get_db()
    items = conn.execute(
        "SELECT id, letter, text, link FROM parents_menu_items ORDER BY sort_order"
    ).fetchall()
    conn.close()
    return jsonify([dict(item) for item in items])


@app.route("/api/parents_menu_text/<int:item_id>")
def get_parents_menu_text(item_id):
    conn = get_db()
    item = conn.execute(
        "SELECT id, letter, text FROM parents_menu_items WHERE id = ?", (item_id,)
    ).fetchone()
    conn.close()
    if item:
        return jsonify(
            {
                "success": True,
                "id": item["id"],
                "title": item["letter"],
                "text": item["text"] or "",
            }
        )
    return jsonify({"success": False, "message": "Пункт не найден"})


@app.route("/admin/add_parents_menu", methods=["POST"])
def add_parents_menu():
    if "admin_id" not in session:
        return jsonify({"success": False, "message": "Не авторизован"}), 403
    data = request.get_json()
    letter = data.get("letter", "").strip()
    text = data.get("text", "").strip()
    link = data.get("link", "").strip()
    if not letter:
        return jsonify({"success": False, "message": "Поле 'Название' обязательно"})
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM parents_menu_items"
    )
    next_order = cursor.fetchone()["next_order"]
    try:
        cursor.execute(
            "INSERT INTO parents_menu_items (letter, text, link, sort_order) VALUES (?, ?, ?, ?)",
            (letter, text, link, next_order),
        )
        conn.commit()
        new_id = cursor.lastrowid
        new_item = conn.execute(
            "SELECT id, letter, text, link, sort_order FROM parents_menu_items WHERE id = ?",
            (new_id,),
        ).fetchone()
        conn.close()
        return jsonify({"success": True, "item": dict(new_item)})
    except Exception as e:
        conn.close()
        return jsonify({"success": False, "message": str(e)})


@app.route("/admin/update_parents_menu/<int:item_id>", methods=["POST"])
def update_parents_menu(item_id):
    if "admin_id" not in session:
        return jsonify({"success": False, "message": "Не авторизован"}), 403
    data = request.get_json()
    letter = data.get("letter", "").strip()
    text = data.get("text", "").strip()
    link = data.get("link", "").strip()
    if not letter:
        return jsonify({"success": False, "message": "Поле 'Название' обязательно"})
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "UPDATE parents_menu_items SET letter = ?, text = ?, link = ? WHERE id = ?",
            (letter, text, link, item_id),
        )
        conn.commit()
        updated_item = conn.execute(
            "SELECT id, letter, text, link, sort_order FROM parents_menu_items WHERE id = ?",
            (item_id,),
        ).fetchone()
        conn.close()
        return jsonify({"success": True, "item": dict(updated_item)})
    except Exception as e:
        conn.close()
        return jsonify({"success": False, "message": str(e)})


@app.route("/admin/delete_parents_menu/<int:item_id>", methods=["POST"])
def delete_parents_menu(item_id):
    if "admin_id" not in session:
        return jsonify({"success": False, "message": "Не авторизован"}), 403
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM parents_menu_items WHERE id = ?", (item_id,))
        conn.commit()
        conn.close()
        return jsonify({"success": True})
    except Exception as e:
        conn.close()
        return jsonify({"success": False, "message": str(e)})


@app.route("/admin/reorder_parents_menu", methods=["POST"])
def reorder_parents_menu():
    if "admin_id" not in session:
        return jsonify({"success": False, "message": "Не авторизован"}), 403
    data = request.get_json()
    ids = data.get("ids", [])
    if not isinstance(ids, list):
        return jsonify({"success": False, "message": "Некорректные данные"})
    conn = get_db()
    cursor = conn.cursor()
    try:
        for idx, item_id in enumerate(ids):
            cursor.execute(
                "UPDATE parents_menu_items SET sort_order = ? WHERE id = ?",
                (idx, item_id),
            )
        conn.commit()
        conn.close()
        return jsonify({"success": True})
    except Exception as e:
        conn.close()
        return jsonify({"success": False, "message": str(e)})


@app.route("/api/staff_menu_items")
def api_staff_menu_items():
    conn = get_db()
    items = conn.execute(
        "SELECT id, letter, text, link FROM staff_menu_items ORDER BY sort_order"
    ).fetchall()
    conn.close()
    return jsonify([dict(item) for item in items])


@app.route("/api/staff_menu_text/<int:item_id>")
def get_staff_menu_text(item_id):
    conn = get_db()
    item = conn.execute(
        "SELECT id, letter, text FROM staff_menu_items WHERE id = ?", (item_id,)
    ).fetchone()
    conn.close()
    if item:
        return jsonify(
            {
                "success": True,
                "id": item["id"],
                "title": item["letter"],
                "text": item["text"] or "",
            }
        )
    return jsonify({"success": False, "message": "Пункт не найден"})


@app.route("/admin/add_staff_menu", methods=["POST"])
def add_staff_menu():
    if "admin_id" not in session:
        return jsonify({"success": False, "message": "Не авторизован"}), 403
    data = request.get_json()
    letter = data.get("letter", "").strip()
    text = data.get("text", "").strip()
    link = data.get("link", "").strip()
    if not letter:
        return jsonify({"success": False, "message": "Поле 'Название' обязательно"})
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM staff_menu_items"
    )
    next_order = cursor.fetchone()["next_order"]
    try:
        cursor.execute(
            "INSERT INTO staff_menu_items (letter, text, link, sort_order) VALUES (?, ?, ?, ?)",
            (letter, text, link, next_order),
        )
        conn.commit()
        new_id = cursor.lastrowid
        new_item = conn.execute(
            "SELECT id, letter, text, link, sort_order FROM staff_menu_items WHERE id = ?",
            (new_id,),
        ).fetchone()
        conn.close()
        return jsonify({"success": True, "item": dict(new_item)})
    except Exception as e:
        conn.close()
        return jsonify({"success": False, "message": str(e)})


@app.route("/admin/update_staff_menu/<int:item_id>", methods=["POST"])
def update_staff_menu(item_id):
    if "admin_id" not in session:
        return jsonify({"success": False, "message": "Не авторизован"}), 403
    data = request.get_json()
    letter = data.get("letter", "").strip()
    text = data.get("text", "").strip()
    link = data.get("link", "").strip()
    if not letter:
        return jsonify({"success": False, "message": "Поле 'Название' обязательно"})
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "UPDATE staff_menu_items SET letter = ?, text = ?, link = ? WHERE id = ?",
            (letter, text, link, item_id),
        )
        conn.commit()
        updated_item = conn.execute(
            "SELECT id, letter, text, link, sort_order FROM staff_menu_items WHERE id = ?",
            (item_id,),
        ).fetchone()
        conn.close()
        return jsonify({"success": True, "item": dict(updated_item)})
    except Exception as e:
        conn.close()
        return jsonify({"success": False, "message": str(e)})


@app.route("/admin/delete_staff_menu/<int:item_id>", methods=["POST"])
def delete_staff_menu(item_id):
    if "admin_id" not in session:
        return jsonify({"success": False, "message": "Не авторизован"}), 403
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM staff_menu_items WHERE id = ?", (item_id,))
        conn.commit()
        conn.close()
        return jsonify({"success": True})
    except Exception as e:
        conn.close()
        return jsonify({"success": False, "message": str(e)})


@app.route("/admin/reorder_staff_menu", methods=["POST"])
def reorder_staff_menu():
    if "admin_id" not in session:
        return jsonify({"success": False, "message": "Не авторизован"}), 403
    data = request.get_json()
    ids = data.get("ids", [])
    if not isinstance(ids, list):
        return jsonify({"success": False, "message": "Некорректные данные"})
    conn = get_db()
    cursor = conn.cursor()
    try:
        for idx, item_id in enumerate(ids):
            cursor.execute(
                "UPDATE staff_menu_items SET sort_order = ? WHERE id = ?",
                (idx, item_id),
            )
        conn.commit()
        conn.close()
        return jsonify({"success": True})
    except Exception as e:
        conn.close()
        return jsonify({"success": False, "message": str(e)})


@app.route("/admin/add_news", methods=["POST"])
def add_news():
    if "admin_id" not in session:
        return jsonify({"success": False, "message": "Не авторизован"}), 403
    title = request.form.get("title", "").strip()
    content = request.form.get("content", "").strip()
    date_str = request.form.get("date", "").strip()

    if not title or not content:
        return jsonify(
            {"success": False, "message": "Заполните заголовок и содержание"}
        )

    if date_str:
        created_date = f"{date_str} 00:00:00"
    else:
        created_date = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    media_urls = []
    files = request.files.getlist("media_files")
    for file in files:
        if file and file.filename != "" and allowed_file(file.filename):
            filename = secure_filename(file.filename)
            name, ext = os.path.splitext(filename)
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            new_filename = f"{name}_{timestamp}{ext}"
            filepath = os.path.join(app.config["UPLOAD_FOLDER"], new_filename)
            file.save(filepath)
            compress_image(filepath)
            file_url = url_for("static", filename=f"uploads/{new_filename}")
            media_urls.append(file_url)
        elif file and file.filename != "":
            return jsonify(
                {"success": False, "message": "Неподдерживаемый формат файла"}
            )
    media_combined = ";".join(media_urls)
    admin_id = session["admin_id"]
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO news (title, content, media, created_date, admin_id) VALUES (?, ?, ?, ?, ?)",
            (title, content, media_combined, created_date, admin_id),
        )
        conn.commit()
        new_id = cursor.lastrowid
        new_item = conn.execute(
            """
            SELECT news.*, admins.full_name as author_name
            FROM news
            LEFT JOIN admins ON news.admin_id = admins.id
            WHERE news.id = ?
        """,
            (new_id,),
        ).fetchone()
        conn.close()
        return jsonify({"success": True, "item": dict(new_item)})
    except Exception as e:
        conn.close()
        return jsonify({"success": False, "message": str(e)})


@app.route("/api/news/<int:news_id>")
def api_news_by_id(news_id):
    conn = get_db()
    news = conn.execute(
        """
        SELECT news.*, admins.full_name as author_name
        FROM news
        LEFT JOIN admins ON news.admin_id = admins.id
        WHERE news.id = ?
        """,
        (news_id,),
    ).fetchone()
    conn.close()
    if news:
        return jsonify({"success": True, "news": dict(news)})
    return jsonify({"success": False, "message": "Новость не найдена"})


@app.route("/admin/edit_news/<int:news_id>", methods=["POST"])
def edit_news(news_id):
    if "admin_id" not in session:
        return jsonify({"success": False, "message": "Не авторизован"}), 403

    title = request.form.get("title", "").strip()
    content = request.form.get("content", "").strip()
    date_str = request.form.get("date", "").strip()

    if not title or not content:
        return jsonify(
            {"success": False, "message": "Заполните заголовок и содержание"}
        )

    if date_str:
        created_date = f"{date_str} 00:00:00"
    else:
        created_date = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    existing_media = request.form.get("existing_media", "").strip()
    media_urls = []

    if existing_media:
        media_urls = [u for u in existing_media.split(";") if u.strip()]

    files = request.files.getlist("media_files")
    for file in files:
        if file and file.filename != "" and allowed_file(file.filename):
            filename = secure_filename(file.filename)
            name, ext = os.path.splitext(filename)
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            new_filename = f"{name}_{timestamp}{ext}"
            filepath = os.path.join(app.config["UPLOAD_FOLDER"], new_filename)
            file.save(filepath)
            compress_image(filepath)
            file_url = url_for("static", filename=f"uploads/{new_filename}")
            media_urls.append(file_url)
        elif file and file.filename != "":
            return jsonify(
                {"success": False, "message": "Неподдерживаемый формат файла"}
            )

    media_combined = ";".join(media_urls)

    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "UPDATE news SET title = ?, content = ?, media = ?, created_date = ? WHERE id = ?",
            (title, content, media_combined, created_date, news_id),
        )
        conn.commit()

        updated_item = conn.execute(
            """
            SELECT news.*, admins.full_name as author_name
            FROM news
            LEFT JOIN admins ON news.admin_id = admins.id
            WHERE news.id = ?
            """,
            (news_id,),
        ).fetchone()
        conn.close()
        return jsonify({"success": True, "item": dict(updated_item)})
    except Exception as e:
        conn.close()
        return jsonify({"success": False, "message": str(e)})


@app.route("/admin/delete_news/<int:news_id>", methods=["POST"])
def delete_news(news_id):
    if "admin_id" not in session:
        return jsonify({"success": False, "message": "Не авторизован"}), 403
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM news WHERE id = ?", (news_id,))
        conn.commit()
        conn.close()
        return jsonify({"success": True})
    except Exception as e:
        conn.close()
        return jsonify({"success": False, "message": str(e)})


@app.route("/api/news")
def api_news():
    offset = request.args.get("offset", 0, type=int)
    limit = request.args.get("limit", 10, type=int)
    date_filter = request.args.get("date", "").strip()

    conn = get_db()

    query_where = ""
    params = []

    if date_filter:
        query_where = "WHERE date(news.created_date) = ?"
        params.append(date_filter)

    total_query = f"SELECT COUNT(*) as count FROM news {query_where}"
    total = conn.execute(total_query, params).fetchone()["count"]

    news_query = f"""
        SELECT news.*, admins.full_name as author_name
        FROM news
        LEFT JOIN admins ON news.admin_id = admins.id
        {query_where}
        ORDER BY news.created_date DESC, news.id DESC
        LIMIT ? OFFSET ?
    """
    news_params = params + [limit, offset]
    news = conn.execute(news_query, news_params).fetchall()

    conn.close()
    return jsonify(
        {"success": True, "total": total, "news": [dict(item) for item in news]}
    )


@app.route("/api/news_dates")
def api_news_dates():
    conn = get_db()
    dates = conn.execute(
        "SELECT DISTINCT date(created_date) as date FROM news ORDER BY date DESC"
    ).fetchall()
    conn.close()
    return jsonify({"success": True, "dates": [d["date"] for d in dates if d["date"]]})


@app.route("/admin/add_right_ad", methods=["POST"])
def add_right_ad():
    if "admin_id" not in session:
        return jsonify({"success": False, "message": "Не авторизован"}), 403

    content_type = request.form.get("type", "media")
    content = request.form.get("content", "").strip()
    link = request.form.get("link", "").strip()
    html_content = request.form.get("html_content", "").strip()

    media_url = ""

    if content_type == "html":
        if not html_content:
            return jsonify({"success": False, "message": "HTML-код не может быть пустым"})

        if not any(tag in html_content.lower() for tag in ['<', '>', 'div', 'script', 'style', 'iframe']):
            return jsonify({"success": False, "message": "Вставьте корректный HTML-код"})

        if not content:
            content = html_content[:100] + "..." if len(html_content) > 100 else html_content

    else:
        if 'media_file' not in request.files:
            return jsonify({"success": False, "message": "Файл не выбран"})

        file = request.files['media_file']
        if not file or file.filename == "":
            return jsonify({"success": False, "message": "Файл не выбран"})

        if not allowed_file(file.filename):
            return jsonify({"success": False, "message": "Неподдерживаемый формат файла"})

        filename = secure_filename(file.filename)
        name, ext = os.path.splitext(filename)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        new_filename = f"{name}_{timestamp}{ext}"
        filepath = os.path.join(app.config["UPLOAD_FOLDER"], new_filename)
        file.save(filepath)
        compress_image(filepath)
        media_url = url_for("static", filename=f"uploads/{new_filename}")

        if not content:
            content = filename

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM right_ads"
    )
    next_order = cursor.fetchone()["next_order"]

    try:
        cursor.execute(
            """INSERT INTO right_ads (media, content, link, html_content, sort_order)
               VALUES (?, ?, ?, ?, ?)""",
            (media_url, content, link, html_content, next_order),
        )
        conn.commit()
        new_id = cursor.lastrowid
        new_item = conn.execute(
            """SELECT id, media, content, link, html_content, sort_order
               FROM right_ads WHERE id = ?""",
            (new_id,),
        ).fetchone()
        conn.close()
        return jsonify({"success": True, "item": dict(new_item)})
    except Exception as e:
        conn.close()
        return jsonify({"success": False, "message": str(e)})


@app.route("/admin/delete_right_ad/<int:ad_id>", methods=["POST"])
def delete_right_ad(ad_id):
    if "admin_id" not in session:
        return jsonify({"success": False, "message": "Не авторизован"}), 403
    conn = get_db()
    cursor = conn.cursor()
    try:
        ad = conn.execute("SELECT media FROM right_ads WHERE id = ?", (ad_id,)).fetchone()
        if ad and ad['media']:
            media_path = ad['media']
            if media_path.startswith('/static/uploads/'):
                file_path = os.path.join('.', media_path[1:])
                if os.path.exists(file_path):
                    try:
                        os.remove(file_path)
                    except:
                        pass

        cursor.execute("DELETE FROM right_ads WHERE id = ?", (ad_id,))
        conn.commit()
        conn.close()
        return jsonify({"success": True})
    except Exception as e:
        conn.close()
        return jsonify({"success": False, "message": str(e)})


@app.route("/admin/reorder_right_ads", methods=["POST"])
def reorder_right_ads():
    if "admin_id" not in session:
        return jsonify({"success": False, "message": "Не авторизован"}), 403
    data = request.get_json()
    ids = data.get("ids", [])
    if not isinstance(ids, list):
        return jsonify({"success": False, "message": "Некорректные данные"})
    conn = get_db()
    cursor = conn.cursor()
    try:
        for idx, ad_id in enumerate(ids):
            cursor.execute(
                "UPDATE right_ads SET sort_order = ? WHERE id = ?", (idx, ad_id)
            )
        conn.commit()
        conn.close()
        return jsonify({"success": True})
    except Exception as e:
        conn.close()
        return jsonify({"success": False, "message": str(e)})


@app.route("/admin/upload_media", methods=["POST"])
def upload_media():
    if "admin_id" not in session:
        return jsonify({"success": False, "message": "Не авторизован"}), 403
    if "file" not in request.files:
        return jsonify({"success": False, "message": "Файл не выбран"})
    file = request.files["file"]
    if file.filename == "":
        return jsonify({"success": False, "message": "Пустое имя файла"})
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        name, ext = os.path.splitext(filename)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        new_filename = f"{name}_{timestamp}{ext}"
        filepath = os.path.join(app.config["UPLOAD_FOLDER"], new_filename)
        file.save(filepath)
        compress_image(filepath)
        file_url = url_for("static", filename=f"uploads/{new_filename}")
        return jsonify({"success": True, "url": file_url})
    else:
        return jsonify({"success": False, "message": "Неподдерживаемый формат файла"})


@app.route("/api/left_menu_items")
def api_left_menu_items():
    conn = get_db()
    items = conn.execute(
        "SELECT id, letter, text, link FROM left_menu_items ORDER BY sort_order"
    ).fetchall()
    conn.close()
    return jsonify([dict(item) for item in items])


@app.route("/api/left_menu_text/<int:item_id>")
def get_left_menu_text(item_id):
    conn = get_db()
    item = conn.execute(
        "SELECT id, letter, text FROM left_menu_items WHERE id = ?", (item_id,)
    ).fetchone()
    conn.close()
    if item:
        return jsonify(
            {
                "success": True,
                "id": item["id"],
                "title": item["letter"],
                "text": item["text"] or "",
            }
        )
    return jsonify({"success": False, "message": "Пункт не найден"})


@app.route("/admin/add_left_menu", methods=["POST"])
def add_left_menu():
    if "admin_id" not in session:
        return jsonify({"success": False, "message": "Не авторизован"}), 403
    data = request.get_json()
    letter = data.get("letter", "").strip()
    text = data.get("text", "").strip()
    link = data.get("link", "").strip()
    if not letter:
        return jsonify(
            {"success": False, "message": "Поле 'Буква/Название' обязательно"}
        )
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM left_menu_items"
    )
    next_order = cursor.fetchone()["next_order"]
    try:
        cursor.execute(
            "INSERT INTO left_menu_items (letter, text, link, sort_order) VALUES (?, ?, ?, ?)",
            (letter, text, link, next_order),
        )
        conn.commit()
        new_id = cursor.lastrowid
        new_item = conn.execute(
            "SELECT id, letter, text, link, sort_order FROM left_menu_items WHERE id = ?",
            (new_id,),
        ).fetchone()
        conn.close()
        return jsonify({"success": True, "item": dict(new_item)})
    except Exception as e:
        conn.close()
        return jsonify({"success": False, "message": str(e)})


@app.route("/admin/update_left_menu/<int:item_id>", methods=["POST"])
def update_left_menu(item_id):
    if "admin_id" not in session:
        return jsonify({"success": False, "message": "Не авторизован"}), 403
    data = request.get_json()
    letter = data.get("letter", "").strip()
    text = data.get("text", "").strip()
    link = data.get("link", "").strip()
    if not letter:
        return jsonify({"success": False, "message": "Поле 'Название' обязательно"})
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "UPDATE left_menu_items SET letter = ?, text = ?, link = ? WHERE id = ?",
            (letter, text, link, item_id),
        )
        conn.commit()
        updated_item = conn.execute(
            "SELECT id, letter, text, link, sort_order FROM left_menu_items WHERE id = ?",
            (item_id,),
        ).fetchone()
        conn.close()
        return jsonify({"success": True, "item": dict(updated_item)})
    except Exception as e:
        conn.close()
        return jsonify({"success": False, "message": str(e)})


@app.route("/admin/delete_left_menu/<int:item_id>", methods=["POST"])
def delete_left_menu(item_id):
    if "admin_id" not in session:
        return jsonify({"success": False, "message": "Не авторизован"}), 403
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM left_menu_items WHERE id = ?", (item_id,))
        conn.commit()
        conn.close()
        return jsonify({"success": True})
    except Exception as e:
        conn.close()
        return jsonify({"success": False, "message": str(e)})


@app.route("/admin/reorder_left_menu", methods=["POST"])
def reorder_left_menu():
    if "admin_id" not in session:
        return jsonify({"success": False, "message": "Не авторизован"}), 403
    data = request.get_json()
    ids = data.get("ids", [])
    if not isinstance(ids, list):
        return jsonify({"success": False, "message": "Некорректные данные"})
    conn = get_db()
    cursor = conn.cursor()
    try:
        for idx, item_id in enumerate(ids):
            cursor.execute(
                "UPDATE left_menu_items SET sort_order = ? WHERE id = ?", (idx, item_id)
            )
        conn.commit()
        conn.close()
        return jsonify({"success": True})
    except Exception as e:
        conn.close()
        return jsonify({"success": False, "message": str(e)})


@app.route("/login", methods=["POST"])
def login_post():
    data = request.get_json()
    username = data.get("username", "").strip()
    password = data.get("password", "").strip()
    conn = get_db()
    admin = conn.execute(
        "SELECT id, username, password, level FROM admins WHERE username = ?",
        (username,),
    ).fetchone()
    conn.close()
    if admin and admin["password"] == hash_password(password):
        session["admin_id"] = admin["id"]
        session["username"] = username
        return jsonify({"success": True})
    else:
        return jsonify({"success": False, "message": "Неверный логин или пароль"})


@app.route("/admin")
def admin_panel():
    if "admin_id" not in session:
        return redirect(url_for("home"))
    conn = get_db()
    admin = conn.execute(
        "SELECT level, username FROM admins WHERE id = ?", (session["admin_id"],)
    ).fetchone()
    conn.close()
    if not admin:
        session.clear()
        return redirect(url_for("home"))

    stats = get_stats_data()
    unique_ips = get_unique_ips_count()
    visits = stats['visits']

    return render_template(
        "admin.html",
        username=session.get("username", ""),
        user_level=admin["level"],
        stats=stats,
        unique_ips=unique_ips,
        visits=visits,
    )


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("home"))


@app.route("/api/system")
def api_system():
    return jsonify(get_system_stats())


@app.route("/api/stats", methods=["POST"])
def api_stats():
    data = request.json

    add_client_stats(data)

    screen = data.get('screen')
    if screen:
        increment_counter('screen_stats', 'screen', screen)

    return jsonify({'status': 'ok'})


@app.route("/stats")
def stats_page():
    stats = get_stats_data()
    unique_ips = get_unique_ips_count()
    visits = stats['visits']
    system_stats = get_system_stats()

    return render_template(
        'stats.html',
        stats=stats,
        visits=visits,
        unique_ips=unique_ips,
        system_stats=system_stats
    )


@app.context_processor
def inject_admin():
    if "admin_id" in session:
        conn = get_db()
        admin = conn.execute(
            "SELECT level FROM admins WHERE id = ?", (session["admin_id"],)
        ).fetchone()
        conn.close()
        if admin:
            return {
                "is_admin": True,
                "user_level": admin["level"],
                "username": session.get("username", ""),
            }
    return {"is_admin": False, "user_level": 0, "username": ""}


@app.template_filter("media_url")
def media_url_filter(media_path):
    if not media_path:
        return ""
    if ";" in media_path:
        paths = media_path.split(";")
        return ";".join([get_media_url(p) for p in paths if p])
    return get_media_url(media_path)


@app.route("/")
def home():
    conn = get_db()
    news = conn.execute("""
        SELECT news.*, admins.full_name as author_name
        FROM news
        LEFT JOIN admins ON news.admin_id = admins.id
        ORDER BY news.created_date DESC, news.id DESC
        LIMIT 10
    """).fetchall()
    right_ads = conn.execute("SELECT * FROM right_ads ORDER BY sort_order").fetchall()
    conn.close()

    ua = request.headers.get('User-Agent', 'Unknown')
    browser = detect_browser(ua)
    ip = request.remote_addr
    page = request.path
    referer = request.headers.get('Referer', 'прямой переход')

    add_visit(ip, browser, page, referer, ua)

    increment_counter('browser_stats', 'browser', browser)
    increment_counter('page_views', 'page', page)
    if referer and referer != 'прямой переход':
        increment_counter('referer_stats', 'referer', referer)

    return render_template(
        "home.html",
        active_tab="home",
        news=news,
        right_ads=right_ads,
        is_admin=session.get("admin_id") is not None
    )


@app.route("/news/<int:news_id>")
def news_detail(news_id):
    conn = get_db()
    news = conn.execute(
        """
        SELECT news.*, admins.full_name as author_name
        FROM news
        LEFT JOIN admins ON news.admin_id = admins.id
        WHERE news.id = ?
        """,
        (news_id,),
    ).fetchone()
    conn.close()

    if not news:
        return "404 нету такой новости", 404

    is_admin = session.get("admin_id") is not None
    return render_template("news_detail.html", news=news, is_admin=is_admin)


@app.route("/home")
def home_page():
    return home()


@app.route("/abiturient")
def abiturient():
    return render_template("abiturient.html", active_tab="abiturient")


@app.route("/students")
def students():
    return render_template("students.html", active_tab="students")


@app.route("/parents")
def parents():
    return render_template("parents.html", active_tab="parents")


@app.route("/staff")
def staff():
    return render_template("staff.html", active_tab="staff")


@app.route("/about")
def about():
    return render_template("about.html", active_tab="about")


@app.route("/login")
def login_page():
    return render_template("login.html", active_tab="login")


@app.route("/contacts")
def contacts():
    return render_template("contacts.html", active_tab="contacts")


@app.route("/calendar")
def calendar():
    return render_template("cal.html")


@app.route('/favicon.ico')
def favicon():
    static_dir = os.path.join(os.path.dirname(__file__), 'static')
    return send_from_directory(static_dir, 'favicon.ico')


if __name__ == "__main__":
    app.run(host=HOST, port=PORT, debug=DEBUG)
