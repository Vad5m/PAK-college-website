import os
from dotenv import load_dotenv

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY")
UPLOAD_FOLDER = os.getenv("UPLOAD_FOLDER")
WP_UPLOAD_FOLDER = os.getenv("WP_UPLOAD_FOLDER")
ALLOWED_EXTENSIONS = set(os.getenv("ALLOWED_EXTENSIONS").split(","))

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

EDITOR_UPLOAD_FOLDER = os.path.join("data", "upload")
EDITOR_DOCS_FOLDER = os.path.join("data", "docs")
EDITOR_DOC_NAME = "document"
