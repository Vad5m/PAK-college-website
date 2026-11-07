import hashlib
import os
from datetime import datetime
from werkzeug.utils import secure_filename
from PIL import Image
from config import (ALLOWED_EXTENSIONS, MAX_IMAGE_WIDTH, MAX_IMAGE_HEIGHT,
                    IMAGE_EXTENSIONS)

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

def allowed_file(filename: str) -> bool:
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
        img = img.resize((int(width * ratio), int(height * ratio)), Image.LANCZOS)

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
    except Exception as e:
        print(f"⚠️ Ошибка сжатия {filepath}: {e}")

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
    if 'firefox' in ua:
        return 'Firefox'
    if 'safari' in ua and 'chrome' not in ua:
        return 'Safari'
    if 'edg' in ua:
        return 'Edge'
    if 'opr' in ua or 'opera' in ua:
        return 'Opera'
    return 'Other'

def save_uploaded_file(file, upload_folder):
    """Сохранить файл, сжать если картинка. Возвращает (url, filepath)."""
    filename = secure_filename(file.filename)
    name, ext = os.path.splitext(filename)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    new_filename = f"{name}_{timestamp}{ext}"
    filepath = os.path.join(upload_folder, new_filename)
    file.save(filepath)
    compress_image(filepath)
    return f"/static/uploads/{new_filename}", filepath
