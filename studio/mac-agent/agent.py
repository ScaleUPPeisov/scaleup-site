#!/usr/bin/env python3
"""VYRON AI STUDIO Mac Agent v0.3.
Outbound Supabase RLS polling + read-only VYRON channel mirror + ENDLUME inbox.
Python stdlib only. Never binds a network port, opens a shell from a cloud job,
or touches VYRON's updater, OAuth vault, or Keychain.
"""
from __future__ import annotations

import argparse
import getpass
import json
import os
from pathlib import Path
import platform
import shutil
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

VERSION = "0.3.0"
BASE = "https://odlseljmogaguyqdlkyv.supabase.co"
PUBLIC_KEY = "sb_publishable_zKjzhQTdTG8f9BfR2X5NVg_zQgjo70f"
APP = Path.home() / "Library" / "Application Support" / "VYRON AI STUDIO"
ROOT = Path.home() / "Movies" / "VYRON AI STUDIO"
CREDS = APP / "mac-agent-auth.json"
CFG = APP / "mac-agent-settings.json"
INBOX = ROOT / "Bridge" / "Inbox"
RESULTS = ROOT / "Bridge" / "Results"
PROJECTS = ROOT / "Projects"
LUMEAN_API = "https://api.lumean.app/api/public"
VALID_IMAGES = {".jpg", ".jpeg", ".png", ".webp"}
VALID_AUDIO = {".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".opus", ".aiff", ".alac"}
VALID_VIDEOS = {".mp4", ".mov", ".m4v", ".webm"}
LAST_HEARTBEAT = 0.0
CHANNEL_LAST_SYNC = 0.0
CHANNEL_COUNT = 0


class AgentError(Exception):
    pass


def mkdirs():
    for p in [APP, ROOT, INBOX, RESULTS, PROJECTS, ROOT / "Renders"]:
        p.mkdir(parents=True, exist_ok=True)
    try:
        APP.chmod(0o700)
    except OSError:
        pass


def save_private(path: Path, obj: dict):
    mkdirs()
    temp = path.with_name(path.name + "." + uuid.uuid4().hex + ".tmp")
    fd = os.open(temp, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False, indent=2)
            f.flush()
            os.fsync(f.fileno())
        os.replace(temp, path)
        path.chmod(0o600)
    finally:
        temp.unlink(missing_ok=True)


def read_json(path: Path, fallback=None):
    try:
        if path.stat().st_size > 6_000_000:
            raise AgentError("Слишком большой файл конфигурации")
        return json.loads(path.read_text("utf-8"))
    except FileNotFoundError:
        return fallback


def config():
    cfg = read_json(CFG, {}) or {}
    if not cfg.get("worker_id"):
        cfg["worker_id"] = str(uuid.uuid4())
        cfg["device_name"] = socket.gethostname()[:60]
        save_private(CFG, cfg)
    return cfg


def http_json(url: str, payload=None, *, method="GET", headers=None, timeout=20):
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    hdr = {"Accept": "application/json", **(headers or {})}
    if data is not None:
        hdr["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, method=method, headers=hdr)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read(4_000_000)
            return json.loads(raw.decode("utf-8") or "{}")
    except urllib.error.HTTPError as exc:
        # Never print Authorization headers, JWTs, URLs with signed storage tokens.
        if exc.code in (401, 403):
            raise AgentError("Авторизация отклонена (HTTP %s)" % exc.code) from None
        raise AgentError("API HTTP %s, endpoint недоступен или не настроен" % exc.code) from None
    except (OSError, ValueError) as exc:
        raise AgentError("Сетевая ошибка: " + str(exc)[:120]) from None


def login():
    if platform.system() != "Darwin":
        raise AgentError("Установка агента предназначена для macOS")
    email = input("Email владельца Supabase: ").strip()
    password = getpass.getpass("Пароль (не записывается на диск): ")
    token = http_json(BASE + "/auth/v1/token?grant_type=password",
                      {"email": email, "password": password}, method="POST",
                      headers={"apikey": PUBLIC_KEY})
    if not token.get("refresh_token") or not token.get("user", {}).get("id"):
        raise AgentError("Не получен токен Supabase")
    save_private(CREDS, {"email": email, "owner_id": token["user"]["id"],
                         "refresh_token": token["refresh_token"]})
    print("Вход сохранён в отдельном файле агента (права 0600), пароль НЕ сохранён.")
    print("VYRON Keychain и аккаунты YouTube не изменялись.")


def access():
    data = read_json(CREDS)
    if not data or not data.get("refresh_token"):
        raise AgentError("Сначала выполни: python3 agent.py login")
    token = http_json(BASE + "/auth/v1/token?grant_type=refresh_token",
                      {"refresh_token": data["refresh_token"]},
                      method="POST", headers={"apikey": PUBLIC_KEY})
    if not token.get("access_token") or not token.get("refresh_token"):
        raise AgentError("Нужен повторный вход: python3 agent.py login")
    data["refresh_token"] = token["refresh_token"]
    save_private(CREDS, data)
    return token["access_token"], data["owner_id"]


def rest(path: str, *, token: str, method="GET", payload=None, query=None, headers=None):
    extra = ("?" + urllib.parse.urlencode(query)) if query else ""
    h = {"apikey": PUBLIC_KEY,
         "Authorization": "Bearer " + token,
         "Prefer": "return=representation",
         **(headers or {})}
    return http_json(BASE + "/rest/v1/" + path + extra, payload,
                     method=method, headers=h)


def uid(val: str) -> str:
    try:
        parsed = str(uuid.UUID(val))
        if parsed != val or len(val) != 36:
            raise ValueError("non-canonical")
        return parsed
    except (ValueError, AttributeError, TypeError):
        raise AgentError("Неверный идентификатор задачи / проекта") from None


def sync_channels(token: str, owner: str):
    # VYRON intentionally writes an owner-readable, sanitized mapping mirror.
    path = Path.home() / "Documents" / "VYRON" / "State" / "mappings.json"
    if not path.is_file():
        print("VYRON: mappings.json не найден — проверь сохранение каналов внутри VYRON.")
        return 0
    rows = read_json(path, [])
    if not isinstance(rows, list):
        raise AgentError("Некорректный список каналов VYRON")
    count = 0
    for item in rows[:500]:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()[:150]
        if not name:
            continue
        # Only public channel metadata; deliberately omit youtubeProfileId,
        # filesystem paths, tokens, secrets, Google user info and settings.
        safe = {"owner_id": owner, "name": name,
                "vyron_channel_id": str(item.get("id") or "")[:150],
                "youtube_channel_id": str(item.get("youtubeChannelId") or "")[:150]}
        rest("studio_v2_channels", token=token, method="POST", payload=safe,
             query={"on_conflict": "owner_id,name"},
             headers={"Prefer": "resolution=merge-duplicates,return=minimal"})
        count += 1
    print("VYRON: синхронизировано каналов (только названия и ID):", count)
    return count


def heartbeat(token: str, owner: str, worker: str, channel_count: int):
    info = read_json(ROOT / "Bridge" / "endlume-heartbeat.json", {}) or {}
    last_ms = info.get("updated_at_ms", 0)
    current_ms = int(time.time() * 1000)
    status = "running" if (isinstance(last_ms, int) and
                           0 <= current_ms - last_ms <= 15000) else "offline"
    payload = {"id": worker, "owner_id": owner,
               "device_name": config().get("device_name", "Mac"),
               "agent_version": VERSION, "endlume_status": status,
               "vyron_channels": channel_count}
    rest("studio_v2_mac_devices", token=token, method="POST", payload=payload,
         query={"on_conflict": "id"},
         headers={"Prefer": "resolution=merge-duplicates,return=minimal"})
    # 'running' is backed by a real recent heartbeat from the modified ENDLUME app.
    return status


def claim(token: str, worker: str):
    result = rest("rpc/studio_v2_claim_mac_job", token=token,
                  method="POST", payload={"p_worker": worker})
    return result[0] if isinstance(result, list) and result else None


def report(token: str, job: str, worker: str, status: str, result=None, error=None):
    payload = {"p_job": uid(job), "p_worker": worker, "p_status": status,
               "p_result": result or {}, "p_error": (error or "")[:450] or None}
    try:
        res = rest("rpc/studio_v2_worker_update", token=token,
                   method="POST", payload=payload)
    except AgentError as exc:
        if "HTTP 401" not in str(exc):
            raise
        refreshed, _ = access()
        res = rest("rpc/studio_v2_worker_update", token=refreshed,
                   method="POST", payload=payload)
    if res is not True:
        raise AgentError("Очередь не подтвердила запись статуса. Запрос не повторяем автоматически.")


def project_get(token: str, project_id: str):
    rows = rest("studio_v2_projects", token=token,
                query={"id": "eq." + uid(project_id), "select": "*", "limit": 1})
    if not rows:
        raise AgentError("Проект не найден или доступ заблокирован RLS")
    return rows[0]


def safe_remote(url: str, kind: str):
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise AgentError("Недоверенная ссылка медиа")
    host = parsed.hostname.lower()
    if kind == "image":
        ok = host == "fal.media" or host.endswith(".fal.media") or host.endswith(".fal.ai")
    else:
        ok = host == "s3.lumean.app" or host.endswith(".lumean.app")
    if not ok:
        raise AgentError("Медиахост не разрешён: " + host)
    if parsed.port not in (None, 443):
        raise AgentError("Недопустимый порт")
    return parsed


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        return None


DOWNLOADER = urllib.request.build_opener(NoRedirect())


def download(url: str, target: Path, kind: str, max_bytes: int):
    # Strict HTTPS allowlist + NO automatic cross-host or private network redirects.
    if target.exists() and target.stat().st_size > 0:
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    for _ in range(4):
        safe_remote(url, kind)
        request = urllib.request.Request(url, headers={"User-Agent": "VYRON AI STUDIO Agent/0.3"})
        try:
            response = DOWNLOADER.open(request, timeout=30)
        except urllib.error.HTTPError as exc:
            if exc.code in (301, 302, 303, 307, 308):
                url = urllib.parse.urljoin(url, exc.headers.get("Location", ""))
                continue
            raise AgentError("Медиафайл недоступен: HTTP %s" % exc.code) from None
        with response:
            temp = target.with_name(target.name + ".download")
            fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
            total = 0
            try:
                with os.fdopen(fd, "wb") as file:
                    while True:
                        chunk = response.read(128 * 1024)
                        if not chunk:
                            break
                        total += len(chunk)
                        if total > max_bytes:
                            raise AgentError("Превышен размер медиафайла")
                        file.write(chunk)
                    file.flush()
                    os.fsync(file.fileno())
                if total < 100:
                    raise AgentError("Медиафайл пустой или повреждённый")
                os.replace(temp, target)
                return
            finally:
                temp.unlink(missing_ok=True)
    raise AgentError("Слишком много перенаправлений загрузки")


def lumean_json(path: str, data=None):
    key = os.environ.get("LUMEAN_API_KEY", "").strip()
    if not key:
        # Dedicated local file only, never fetched from VYRON / YouTube profiles.
        key = (read_json(APP / "lumean-secret.json", {}) or {}).get("api_key", "")
    if not key:
        raise AgentError("Для скачивания озвучки настрой LUMEAN_API_KEY в Mac-агенте")
    return http_json(LUMEAN_API + path, data,
                     method="POST" if data is not None else "GET",
                     headers={"X-API-KEY": key})


def set_lumean():
    key = getpass.getpass("Lumean API ключ с orders.read + orders.download: ").strip()
    if len(key) < 10:
        raise AgentError("Некорректный ключ")
    save_private(APP / "lumean-secret.json", {"api_key": key})
    print("Сохранён в отдельном файле агента с доступом только владельцу (0600).")


def stage_assets(proj: dict, dest: Path):
    dest.mkdir(parents=True, exist_ok=True)
    images = [p for p in dest.iterdir()
              if p.is_file() and p.suffix.lower() in VALID_IMAGES | VALID_VIDEOS]
    assets = proj.get("assets") or []
    if not images:
        if not isinstance(assets, list):
            raise AgentError("Некорректное поле assets")
        for idx, item in enumerate(assets[:180]):
            if isinstance(item, dict) and isinstance(item.get("url"), str):
                download(item["url"], dest / ("%03d.jpg" % (idx + 1)), "image", 30 * 1024 * 1024)
    images = [p for p in dest.iterdir() if p.is_file() and p.suffix.lower() in VALID_IMAGES | VALID_VIDEOS]
    if not images:
        raise AgentError("Нет картинок/видео: создай кадры или положи изображения в " + str(dest))
    audio = [p for p in dest.iterdir() if p.is_file() and p.suffix.lower() in VALID_AUDIO]
    if not audio:
        jobs = [j for j in proj.get("jobs", []) if isinstance(j, dict) and j.get("type") == "lumean"]
        if jobs:
            order_id = uid(str(jobs[-1]["id"]))
            order = lumean_json("/orders/" + order_id).get("data") or {}
            if order.get("status") not in ("completed", "result_delivered") or order.get("stitching"):
                raise AgentError("Озвучка Lumean ещё не завершена")
            if order.get("files_expired"):
                raise AgentError("Срок хранения аудио Lumean истёк")
            files = (order.get("result") or {}).get("files") or []
            if not files:
                raise AgentError("В заказе Lumean нет итогового аудио")
            # A single rendered longform narration, not a batch of fragments.
            path = files[0] if isinstance(files[0], str) else files[0].get("path", "")
            link = lumean_json("/storage/url", {"path": path})
            url = (link.get("data") or {}).get("url")
            if not url:
                raise AgentError("Lumean не вернул ссылку на аудио")
            target_seconds = float(proj.get("duration_minutes", 30)) * 60
            actual_seconds = (order.get("total_duration_ms") or 0) / 1000
            if actual_seconds and abs(target_seconds - actual_seconds) > max(70, target_seconds * 0.1):
                raise AgentError("Длина озвучки %.0fs не совпадает с видео %.0fs. ENDLUME зациклит голос. Исправь длину и повтори." % (actual_seconds, target_seconds))
            download(url, dest / "001-voice.mp3", "audio", 350 * 1024 * 1024)
        else:
            raise AgentError("Нет звука: нужен готовый заказ Lumean или локальные MP3/FLAC/WAV")
    audio = [p for p in dest.iterdir() if p.is_file() and p.suffix.lower() in VALID_AUDIO]
    if not audio:
        raise AgentError("Аудио не готово")
    return len(images), len(audio)


def write_job(job: dict, proj: dict):
    job_id = uid(job["id"])
    project_id = uid(proj["id"])
    dest = PROJECTS / project_id
    images, audio = stage_assets(proj, dest)
    request = {"version": 1, "job_id": job_id, "project_id": project_id,
               "duration_minutes": int(proj["duration_minutes"]), "fps": 30, "codec": "h264"}
    path = INBOX / (job_id + ".json")
    if (INBOX / (job_id + ".accepted")).exists() or path.exists():
        raise AgentError("Задание уже передано в ENDLUME; проверь статус, не создавай дубль")
    if (RESULTS / (job_id + ".json")).exists():
        raise AgentError("Для задания уже есть квитанция ENDLUME; сначала проверь её")
    save_private(path, request)
    return {"images": images, "audio": audio, "inbox": str(path)}


def await_receipt(token: str, job_id: str, worker: str, metadata: dict):
    last = 0.0
    last_renew = time.monotonic()
    latest_progress = {}
    owner = (read_json(CREDS) or {}).get("owner_id")
    deadline = time.monotonic() + 12 * 3600
    result_path = RESULTS / (job_id + ".json")
    while time.monotonic() < deadline:
        if result_path.exists():
            report_data = read_json(result_path)
            if not isinstance(report_data, dict) or report_data.get("job_id") != job_id:
                raise AgentError("Некорректная квитанция ENDLUME")
            if report_data.get("status") == "running":
                try:
                    pct = float(report_data.get("progress") or 0)
                    if 0 <= pct < 100:
                        latest_progress = {
                            "progress": round(pct, 1),
                            "stage": str(report_data.get("stage") or "ENDLUME render")[:150]
                        }
                except (TypeError, ValueError):
                    pass
            if report_data.get("status") == "completed":
                output = Path(report_data.get("path") or "")
                # Always verify the output stays under the controlled render tree.
                allowed = (ROOT / "Renders").resolve()
                if not output.is_file() or not output.resolve().is_relative_to(allowed):
                    raise AgentError("Неверный путь результата ENDLUME")
                if output.stat().st_size < 100_000:
                    raise AgentError("Слишком маленький MP4")
                return {"engine": "ENDLUME", "mp4_path": str(output), "bytes": output.stat().st_size,
                        "verified_by_engine": bool(report_data.get("verified")), **metadata}
            if report_data.get("status") == "error":
                raise AgentError("ENDLUME: " + str(report_data.get("error") or "ошибка рендера")[:300])
        if time.monotonic() - last > 20:
            # A render can run for hours; rotate JWT well before 1h expiry.
            try:
                if time.monotonic() - last_renew > 2400:
                    token, _ = access()
                    last_renew = time.monotonic()
                report(token, job_id, worker, "running", {"stage": "ENDLUME render", **metadata, **latest_progress})
                if owner:
                    heartbeat(token, owner, worker, CHANNEL_COUNT)
            except AgentError as exc:
                # Temporary network loss must not stop the local ENDLUME render.
                print("Mac agent: не удалось обновить статус:", str(exc))
            last = time.monotonic()
        time.sleep(4)
    raise AgentError("Нет результата ENDLUME 12 часов. Проверь Mac, приложение и папку результатов.")


def process(token: str, worker: str, job: dict):
    job_id = uid(job["id"])
    proj = project_get(token, job["project_id"])
    if job.get("action") != "render_endlume":
        report(token, job_id, worker, "error", error="Неизвестная операция, выполнение запрещено")
        return
    try:
        info = write_job(job, proj)
        print("ENDLUME: задание", job_id, "передано. Ожидаем подтверждения рендера.")
        report(token, job_id, worker, "running", info)
        result = await_receipt(token, job_id, worker, info)
        report(token, job_id, worker, "completed", result)
        print("ENDLUME: видео готово и проверено:", result["mp4_path"])
    except AgentError as exc:
        # Claim deliberately remains terminal; no automatic duplicate job or paid retries.
        report(token, job_id, worker, "error", error=str(exc))
        print("ENDLUME: ошибка:", str(exc))


def run_once():
    mkdirs()
    token, owner = access()
    cfg = config()
    # Channel sync is best effort; API/SQL schema problems are reported, not hidden.
    global CHANNEL_LAST_SYNC, CHANNEL_COUNT
    if time.monotonic() - CHANNEL_LAST_SYNC > 600 or CHANNEL_LAST_SYNC == 0:
        CHANNEL_COUNT = sync_channels(token, owner)
        CHANNEL_LAST_SYNC = time.monotonic()
    status = heartbeat(token, owner, cfg["worker_id"], CHANNEL_COUNT)
    print("Mac агент:", cfg["worker_id"], "| ENDLUME inbox:", status)
    job = claim(token, cfg["worker_id"])
    if job:
        process(token, cfg["worker_id"], job)
    else:
        print("Очередь пуста")


def run_daemon():
    if platform.system() != "Darwin":
        raise AgentError("Агент предназначен для macOS")
    mkdirs()
    print("VYRON AI STUDIO Mac Agent v%s. Сеть: только исходящий HTTPS." % VERSION)
    while True:
        try:
            run_once()
            time.sleep(20)
        except KeyboardInterrupt:
            print("Остановлено")
            return
        except AgentError as exc:
            print("ОШИБКА:", str(exc), file=sys.stderr)
            time.sleep(40)


def main():
    parser = argparse.ArgumentParser(description="VYRON AI STUDIO Mac Agent")
    parser.add_argument("command", choices=["login", "once", "daemon", "set-lumean", "paths"])
    cmd = parser.parse_args().command
    if cmd == "login":
        login()
    elif cmd == "set-lumean":
        set_lumean()
    elif cmd == "paths":
        print("VYRON mappings:", Path.home() / "Documents/VYRON/State/mappings.json")
        print("Studio:", ROOT)
        print("ENDLUME inbox:", INBOX)
    elif cmd == "once":
        run_once()
    else:
        run_daemon()


if __name__ == "__main__":
    try:
        main()
    except AgentError as exc:
        print("ОШИБКА:", str(exc), file=sys.stderr)
        raise SystemExit(1)
