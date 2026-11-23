"""Open-PETs 容器版進入點（docker/Dockerfile 打包進映像檔，不屬於後端原始碼）。

服務（映像檔預設指令）：
  uvicorn openpets_server:build_app --factory --host 0.0.0.0 --port 8080
  後端 /api/* 照舊；其餘路徑回前端網頁（React Router 用 index.html）；後端原本的 GET / 狀態 JSON 移到 /api/v1/status。
  以本檔的 attach_frontend／attach_api_docs／SecurityHeadersMiddleware 掛到後端 app，不改動後端原始碼。

管理指令（docker exec -it open-pets python /opt/openpets/openpets_server.py <指令>）：
  create-admin      互動建立系統管理員（密碼不會出現在指令歷史或程序列表）
  reset-password    互動重設某個帳號的密碼（忘記管理員密碼時用）
  verify-log 等     其餘後端 CLI 指令原樣轉交（create-user、verify-log、k-anonymity、dp、report…）

模式：OPEN_PETS_MODE=local（本機，預設）或 lan（內網，同一個內網的多台電腦）；舊值 offline 仍接受，視為 local。
  不支援線上（online）模式：設成 online 會拒絕啟動並提示改用 lan 或 local（見 REMOVED_MODES）。
  同一份映像檔、同一份前端，模式由 /runtime-config.js 在執行期告訴前端（見 resolve_runtime_config）。

金鑰：OPEN_PETS_DEFAULT_SALT／OPEN_PETS_SYSTEM_MASTER_KEY／OPEN_PETS_JWT_SECRET 由環境變數提供；
沒有提供的，第一次啟動時隨機產生並存到 /data/.secrets.env（權限 600），之後沿用。
"""
import getpass
import os
import secrets
import stat
import sys
from pathlib import Path

SECRET_KEYS = ("OPEN_PETS_DEFAULT_SALT", "OPEN_PETS_SYSTEM_MASTER_KEY", "OPEN_PETS_JWT_SECRET")
BACKEND_CLI_COMMANDS = {
    "create-user", "preprocess", "k-anonymity", "dp", "risk-k-anonymity",
    "risk-dp", "risk-cap", "verify-log", "report",
}


def data_dir() -> Path:
    return Path(os.getenv("OPEN_PETS_DATA_DIR", "/data"))


def prepare_runtime_dirs() -> None:
    base = data_dir()
    for sub in ("", "logs", "tmp"):
        (base / sub).mkdir(parents=True, exist_ok=True)


def ensure_secrets() -> None:
    """環境變數優先；缺的金鑰從 /data/.secrets.env 讀，檔案裡也沒有才隨機產生並寫入。"""
    missing = [key for key in SECRET_KEYS if not os.getenv(key)]
    if not missing:
        return
    secrets_file = data_dir() / ".secrets.env"
    stored: dict[str, str] = {}
    if secrets_file.is_file():
        for line in secrets_file.read_text(encoding="utf-8-sig").splitlines():
            key, sep, value = line.partition("=")
            if sep and key.strip() in SECRET_KEYS and value.strip():
                stored[key.strip()] = value.strip()
    created = [key for key in missing if key not in stored]
    for key in created:
        stored[key] = secrets.token_hex(32)
    if created:
        header = (
            "# Open-PETs 容器版金鑰（第一次啟動時自動產生）。請連同 /data 一起備份，並當作機密保管：\n"
            "#   OPEN_PETS_DEFAULT_SALT 遺失或變更，之後的雜湊結果就和過去對不起來；\n"
            "#   OPEN_PETS_SYSTEM_MASTER_KEY 是稽核紀錄的簽章金鑰，變更後舊紀錄無法驗證；\n"
            "#   OPEN_PETS_JWT_SECRET 變更只會讓目前登入的人需要重新登入。\n"
            "# 要把金鑰與資料分開保管，改用環境變數（或 Docker secrets）提供，環境變數優先於本檔。\n"
        )
        body = "".join(f"{key}={stored[key]}\n" for key in SECRET_KEYS if key in stored)
        secrets_file.write_text(header + body, encoding="utf-8")
        secrets_file.chmod(stat.S_IRUSR | stat.S_IWUSR)
        print(f"[初次設定] 已產生金鑰並存到 {secrets_file}：{', '.join(created)}（請備份 /data）", flush=True)
    for key in missing:
        os.environ[key] = stored[key]


VALID_MODES = ("local", "lan")
MODE_ALIASES = {"offline": "local"}   # 原名稱，仍接受
# 不支援的模式：不靜默退回其他模式（那會悄悄改變對網路的開放範圍），而是拒絕啟動並說明怎麼改
REMOVED_MODES = {
    "online": "不支援線上（online）模式（本系統不提供以對外網域直接對網際網路服務的模式）。"
              "同一個內網的多台電腦請改用 OPEN_PETS_MODE=lan（內建 HTTPS），只有一台電腦使用請改用 local。"
              "安裝資料夾裡有 open-pets.ps1／open-pets.sh 的話，執行 mode lan -Hosts <內網IP> 或 mode local 即可，資料不會遺失。",
}


def resolve_runtime_config() -> dict:
    """讀環境變數決定前端的執行期設定；值不合法就中止啟動，不靜默退回預設（避免設錯了卻以為生效）。

    OPEN_PETS_MODE             local（預設，本機：一台電腦）或 lan（內網：同一個內網的多台電腦）；舊值 offline 視為 local。
                               只有 lan 顯示系統維運日誌分頁。online 不支援，設定它會拒絕啟動（見 REMOVED_MODES）。
    """
    mode = os.getenv("OPEN_PETS_MODE", "").strip().lower() or "local"
    mode = MODE_ALIASES.get(mode, mode)
    if mode in REMOVED_MODES:
        raise SystemExit(f"[設定錯誤] OPEN_PETS_MODE={mode!r}：{REMOVED_MODES[mode]}")
    if mode not in VALID_MODES:
        raise SystemExit(f"[設定錯誤] OPEN_PETS_MODE={mode!r} 不合法，只接受 {'、'.join(VALID_MODES)}（舊值 offline 視為 local）。")
    return {"mode": mode}


def allow_loopback_hosts() -> None:
    """有設定 OPEN_PETS_ALLOWED_HOSTS 時補上 127.0.0.1／localhost：容器的 HEALTHCHECK 與同機反向代理都用這個 Host。
    DNS rebinding 攻擊用的是攻擊者自己的網域當 Host，不會是這兩個名稱，所以不削弱防護。"""
    raw = os.getenv("OPEN_PETS_ALLOWED_HOSTS", "").strip()
    if not raw:
        return
    hosts = [host.strip() for host in raw.split(",") if host.strip()]
    for loopback in ("127.0.0.1", "localhost"):
        if loopback not in hosts:
            hosts.append(loopback)
    os.environ["OPEN_PETS_ALLOWED_HOSTS"] = ",".join(hosts)


def attach_runtime_config(app, config: dict) -> None:
    """提供 /runtime-config.js（index.html 在主程式之前載入）。須在 attach_frontend 之前註冊，
    否則會被它的 /{full_path:path} 攔截而回傳 index.html。"""
    import json

    from fastapi.responses import Response

    body = f"window.__OPEN_PETS_CONFIG__ = {json.dumps(config)};\n"

    @app.get("/runtime-config.js", include_in_schema=False)
    def runtime_config_js():
        return Response(body, media_type="text/javascript", headers={"Cache-Control": "no-cache"})


def frontend_dir() -> Path:
    """前端 build 結果所在資料夾（映像檔以 OPEN_PETS_FRONTEND_DIR 指定）。"""
    return Path(os.getenv("OPEN_PETS_FRONTEND_DIR", "/srv/frontend"))


# ---------------------------------------------------------------- 安全標頭
# 內容比照 nginx.conf。antd 以 <style> 注入樣式，style-src 需允許 'unsafe-inline'。
SECURITY_HEADERS = {
    "Content-Security-Policy": (
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; "
        "font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; "
        "form-action 'self'; frame-ancestors 'none'"
    ),
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "require-corp",
}


class SecurityHeadersMiddleware:
    """對所有 HTTP 回應補上安全標頭（回應已自訂者不覆蓋）。

    用純 ASGI 中介層而非 @app.middleware("http")：後者會讓後端運算端點讀不到用戶端斷線（見後端 app/api/compute.py）。
    """

    def __init__(self, app):
        self.app = app
        self.headers = [(name.lower().encode("latin-1"), value.encode("latin-1")) for name, value in SECURITY_HEADERS.items()]

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_headers(message):
            if message["type"] == "http.response.start":
                existing = {name.lower() for name, _ in message.get("headers", [])}
                message["headers"] = list(message.get("headers", [])) + [h for h in self.headers if h[0] not in existing]
            await send(message)

        await self.app(scope, receive, send_with_headers)


# ---------------------------------------------------------------- API 互動文件
# FastAPI 內建的 /docs、/redoc 從 CDN 載入腳本並以行內 <script> 初始化，
# 兩者都被上方 CSP（script-src 'self'）擋下，離線環境也連不到 CDN。
# 改用 Dockerfile 從 node_modules/swagger-ui-dist 複製到前端資料夾的 swagger-ui/，
# 初始化程式另以 /swagger-ui/docs-init.js 提供，CSP 不必放寬。
SWAGGER_UI_DIR = "swagger-ui"
DOCS_INIT_JS = """window.ui = SwaggerUIBundle({
  url: "__OPENAPI_URL__",
  dom_id: "#swagger-ui",
  layout: "BaseLayout",
  deepLinking: true,
  showExtensions: true,
  showCommonExtensions: true,
  presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
});
"""
DOCS_PAGE_HTML = """<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<title>__TITLE__ - API 文件</title>
<link rel="stylesheet" href="/swagger-ui/swagger-ui.css">
</head>
<body>
<div id="swagger-ui"></div>
<script src="/swagger-ui/swagger-ui-bundle.js"></script>
<script src="/swagger-ui/docs-init.js"></script>
</body>
</html>
"""


def attach_api_docs(app, dist: Path) -> None:
    """以本機 Swagger UI 取代 /docs；/redoc 轉到 /docs。沒有打包 swagger-ui/ 時維持 FastAPI 原樣。"""
    from html import escape

    from fastapi.responses import HTMLResponse, RedirectResponse, Response

    if not (dist / SWAGGER_UI_DIR / "swagger-ui-bundle.js").is_file() or not app.openapi_url:
        return

    replaced_paths = {app.docs_url, app.redoc_url} - {None}
    app.router.routes[:] = [route for route in app.router.routes if getattr(route, "path", None) not in replaced_paths]

    no_cache = {"Cache-Control": "no-cache"}
    page_html = DOCS_PAGE_HTML.replace("__TITLE__", escape(app.title))
    init_js = DOCS_INIT_JS.replace("__OPENAPI_URL__", app.openapi_url)

    @app.get("/docs", include_in_schema=False)
    def api_docs():
        return HTMLResponse(page_html, headers=no_cache)

    @app.get(f"/{SWAGGER_UI_DIR}/docs-init.js", include_in_schema=False)
    def api_docs_init():
        return Response(init_js, media_type="text/javascript", headers=no_cache)

    @app.get("/redoc", include_in_schema=False)
    def api_redoc():
        return RedirectResponse("/docs")


# ---------------------------------------------------------------- 網頁
def attach_frontend(app, dist: Path) -> None:
    """把前端 build 結果掛到後端 app：/api/* 照舊，其餘路徑回網頁（React Router 用 index.html）。"""
    from fastapi import HTTPException
    from fastapi.responses import FileResponse
    from fastapi.staticfiles import StaticFiles

    index_file = dist / "index.html"
    if not index_file.is_file():
        raise FileNotFoundError(f"找不到前端網頁：{index_file}")

    # 後端原本的 GET / 回傳服務狀態 JSON；容器版改由 / 提供網頁，狀態移到 /api/v1/status
    for route in list(app.router.routes):
        if getattr(route, "path", None) == "/" and "GET" in (getattr(route, "methods", None) or set()):
            endpoint = route.endpoint
            app.router.routes.remove(route)
            app.add_api_route("/api/v1/status", endpoint, methods=["GET"], include_in_schema=False)

    assets_dir = dist / "assets"
    if assets_dir.is_dir():
        # 檔名含雜湊，可長期快取
        app.mount("/assets", StaticFiles(directory=assets_dir), name="frontend-assets")

    no_cache = {"Cache-Control": "no-cache"}
    dist_resolved = dist.resolve()

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_frontend(full_path: str):
        # /api 底下找不到的端點維持 404 JSON（系統管理大廳以此判斷後端連線），不回網頁
        if full_path == "api" or full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not Found")
        if full_path:
            candidate = (dist_resolved / full_path).resolve()
            if candidate.is_file() and dist_resolved in candidate.parents:
                return FileResponse(candidate)
        return FileResponse(index_file, headers=no_cache)


# ---------------------------------------------------------------- 帳號（管理指令用）
def prompt_new_password(min_length: int) -> str:
    # 與網頁、後端同一規則（長度＋大小寫、數字、特殊符號），不只檢查長度
    from app.governance.auth import password_policy_error

    while True:
        pw1 = getpass.getpass(f"  密碼（至少 {min_length} 個字元，需含大小寫字母、數字及特殊符號，輸入時不會顯示）：")
        error = password_policy_error(pw1)
        if error:
            print(f"  {error}")
            continue
        pw2 = getpass.getpass("  再輸入一次密碼：")
        if pw1 != pw2:
            print("  兩次輸入不一致，請重新輸入。")
            continue
        return pw1


def reset_password_interactive() -> int:
    from app.core.errors import PetsError
    from app.governance.auth import get_auth_manager, get_password_min_length

    manager = get_auth_manager()
    users = manager.list_users()
    if not users:
        print("目前沒有任何帳號；請先執行 create-admin 建立管理員。")
        return 1
    print("目前帳號：")
    for user in users:
        state = "" if user.get("is_active", True) else "（已停用）"
        print(f"  - {user['username']}  [{user['role']}]{state}")
    username = input("要重設密碼的帳號：").strip()
    password = prompt_new_password(get_password_min_length())
    try:
        manager.reset_password(username, password)
    except PetsError as exc:
        print(f"重設失敗：{exc}")
        return 1
    print(f"已重設 [{username}] 的密碼（同時解除登入鎖定）。")
    return 0


def build_app():
    runtime_config = resolve_runtime_config()  # 最先檢查設定：錯了就直接中止，不產生金鑰、不載入後端
    prepare_runtime_dirs()
    ensure_secrets()
    allow_loopback_hosts()
    print(f"[啟動] 模式：{runtime_config['mode']}", flush=True)
    # 須在載入後端前設定好環境變數；後端設定一律以環境變數優先
    from app.api.server import app

    dist = frontend_dir()
    attach_api_docs(app, dist)
    attach_runtime_config(app, runtime_config)
    attach_frontend(app, dist)
    app.add_middleware(SecurityHeadersMiddleware)  # 最後加入＝最外層
    return app


def create_admin() -> int:
    from app.core.errors import PetsError
    from app.governance.auth import get_auth_manager, get_password_min_length

    manager = get_auth_manager()
    if manager.list_users():
        print("已經有帳號了。要新增其他使用者，請以管理員登入網頁，在「系統設定 → 帳號管理」新增；")
        print("忘記管理員密碼請執行 reset-password。")
        return 1
    print("建立系統管理員（之後可登入網頁新增其他使用者）")
    min_length = get_password_min_length()
    while True:
        username = input("  管理員帳號（建議用 Email）：").strip()
        if not username:
            print("  帳號不可空白。")
            continue
        password = prompt_new_password(min_length)
        try:
            manager.create_user(username, password, "admin")
        except PetsError as exc:
            print(f"  建立失敗：{exc}")
            continue
        print(f"已建立管理員 [{username}]。")
        return 0


def main(argv: list[str]) -> int:
    prepare_runtime_dirs()
    ensure_secrets()
    command = argv[0] if argv else ""
    if command == "create-admin":
        return create_admin()
    if command == "reset-password":
        return reset_password_interactive()
    if command in BACKEND_CLI_COMMANDS or command == "--help-cli":
        from app.cli.main import cli

        args = ["--help"] if command == "--help-cli" else argv
        try:
            cli(args=args, prog_name="openpets_server.py")
        except SystemExit as exc:
            return int(exc.code or 0) if not isinstance(exc.code, str) else 1
        return 0
    print(__doc__)
    return 0 if command in ("-h", "--help") else 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
