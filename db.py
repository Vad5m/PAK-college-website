import sqlite3
from datetime import datetime
from config import (MAIN_DB, STATS_DB, DEFAULT_ADMIN_FULLNAME,
                    DEFAULT_ADMIN_USERNAME, DEFAULT_ADMIN_PASSWORD,
                    DEFAULT_ADMIN_LEVEL)
from utils import hash_password

def get_db():
    conn = sqlite3.connect(MAIN_DB)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    c = conn.cursor()
    c.execute("""CREATE TABLE IF NOT EXISTS admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        full_name TEXT NOT NULL,
        added_date TEXT NOT NULL,
        added_by TEXT NOT NULL,
        hierarchy_number INTEGER UNIQUE NOT NULL,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        level INTEGER DEFAULT 5)""")
    for tbl in ("left_menu_items", "abiturient_menu_items", "students_menu_items",
                "parents_menu_items", "staff_menu_items"):
        c.execute(f"""CREATE TABLE IF NOT EXISTS {tbl} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            letter TEXT NOT NULL,
            text TEXT,
            link TEXT,
            sort_order INTEGER DEFAULT 0)""")
    c.execute("""CREATE TABLE IF NOT EXISTS news (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        media TEXT,
        created_date TEXT DEFAULT CURRENT_TIMESTAMP,
        admin_id INTEGER REFERENCES admins(id))""")
    c.execute("""CREATE TABLE IF NOT EXISTS right_ads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        media TEXT,
        content TEXT NOT NULL,
        link TEXT,
        html_content TEXT DEFAULT '',
        sort_order INTEGER DEFAULT 0)""")
    conn.commit()
    conn.close()
    migrate_db()

def migrate_db():
    conn = get_db()
    c = conn.cursor()
    try:
        c.execute("PRAGMA table_info(admins)")
        if "level" not in [col[1] for col in c.fetchall()]:
            c.execute("ALTER TABLE admins ADD COLUMN level INTEGER DEFAULT 5")
            c.execute("UPDATE admins SET level = 5 WHERE level IS NULL")

        c.execute("PRAGMA table_info(news)")
        if "admin_id" not in [col[1] for col in c.fetchall()]:
            c.execute("ALTER TABLE news ADD COLUMN admin_id INTEGER REFERENCES admins(id)")

        c.execute("PRAGMA table_info(left_menu_items)")
        if "text" not in [col[1] for col in c.fetchall()]:
            c.execute("ALTER TABLE left_menu_items ADD COLUMN text TEXT DEFAULT ''")

        c.execute("PRAGMA table_info(right_ads)")
        if "html_content" not in [col[1] for col in c.fetchall()]:
            c.execute("ALTER TABLE right_ads ADD COLUMN html_content TEXT DEFAULT ''")

        conn.commit()
    except Exception as e:
        print("Ошибка миграции:", e)
    finally:
        conn.close()

def create_default_admin():
    conn = get_db()
    c = conn.cursor()
    if c.execute("SELECT COUNT(*) as n FROM admins").fetchone()["n"] == 0:
        c.execute(
            """INSERT INTO admins (full_name, added_date, added_by,
               hierarchy_number, username, password, level)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (DEFAULT_ADMIN_FULLNAME, datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
             "Программа", 5, DEFAULT_ADMIN_USERNAME,
             hash_password(DEFAULT_ADMIN_PASSWORD), DEFAULT_ADMIN_LEVEL))
        conn.commit()
    conn.close()

def get_stats_db():
    conn = sqlite3.connect(STATS_DB)
    conn.row_factory = sqlite3.Row
    return conn

def init_stats_db():
    conn = get_stats_db()
    c = conn.cursor()
    c.execute("""CREATE TABLE IF NOT EXISTS visits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL, ip TEXT NOT NULL, browser TEXT,
        page TEXT, referer TEXT, user_agent TEXT)""")
    for tbl, field in (("browser_stats", "browser"), ("page_views", "page"),
                       ("referer_stats", "referer"), ("screen_stats", "screen")):
        c.execute(f"""CREATE TABLE IF NOT EXISTS {tbl} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            {field} TEXT UNIQUE NOT NULL,
            count INTEGER DEFAULT 0)""")
    c.execute("""CREATE TABLE IF NOT EXISTS client_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL, page TEXT, screen TEXT,
        load_time REAL, time_on_page REAL, clicks INTEGER, scroll_depth INTEGER)""")
    conn.commit()
    conn.close()

def increment_counter(table, field, value):
    conn = get_stats_db()
    c = conn.cursor()
    row = c.execute(f"SELECT id FROM {table} WHERE {field} = ?", (value,)).fetchone()
    if row:
        c.execute(f"UPDATE {table} SET count = count + 1 WHERE {field} = ?", (value,))
    else:
        c.execute(f"INSERT INTO {table} ({field}, count) VALUES (?, 1)", (value,))
    conn.commit()
    conn.close()

def add_visit(ip, browser, page, referer, user_agent):
    conn = get_stats_db()
    conn.execute(
        "INSERT INTO visits (timestamp, ip, browser, page, referer, user_agent) VALUES (?, ?, ?, ?, ?, ?)",
        (datetime.now().strftime('%Y-%m-%d %H:%M:%S'), ip, browser, page, referer, user_agent))
    conn.commit()
    conn.close()

def add_client_stats(data):
    conn = get_stats_db()
    conn.execute(
        """INSERT INTO client_stats
           (timestamp, page, screen, load_time, time_on_page, clicks, scroll_depth)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (datetime.now().strftime('%Y-%m-%d %H:%M:%S'), data.get('page'),
         data.get('screen'), data.get('load_time'), data.get('time_on_page'),
         data.get('clicks'), data.get('scroll_depth')))
    conn.commit()
    conn.close()

def get_unique_ips_count():
    conn = get_stats_db()
    row = conn.execute("SELECT COUNT(DISTINCT ip) as count FROM visits").fetchone()
    conn.close()
    return row['count'] if row else 0

def get_stats_data():
    conn = get_stats_db()
    c = conn.cursor()
    visits = c.execute(
        "SELECT timestamp, ip, browser, page, referer, user_agent FROM visits ORDER BY timestamp DESC"
    ).fetchall()
    browsers = {r['browser']: r['count'] for r in
                c.execute("SELECT browser, count FROM browser_stats").fetchall()}
    page_views = {r['page']: r['count'] for r in
                  c.execute("SELECT page, count FROM page_views").fetchall()}
    referers = {r['referer']: r['count'] for r in
                c.execute("SELECT referer, count FROM referer_stats").fetchall()}
    screens = {r['screen']: r['count'] for r in
               c.execute("SELECT screen, count FROM screen_stats").fetchall()}
    clients = c.execute(
        """SELECT timestamp, page, screen, load_time, time_on_page,
                  clicks, scroll_depth FROM client_stats ORDER BY timestamp DESC"""
    ).fetchall()
    conn.close()
    return {
        'visits': [dict(v) for v in visits],
        'browsers': browsers, 'page_views': page_views,
        'referers': referers, 'screens': screens,
        'clients': [dict(c) for c in clients],
    }
