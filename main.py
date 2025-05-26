import uuid

import requests
import uvicorn
from fastapi import FastAPI, Request, Form
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

RAG_BACKEND_URL = "http://localhost:8001"  # твой адрес RAG
SESSION_COOKIE = "chat_id"

app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# локальный кэш на сервере для каждого chat_id (НЕ для продакшена!)
dialogue_cache = {}  # chat_id -> list of messages


def get_or_create_chat_id(request: Request) -> str:
    chat_id = request.cookies.get(SESSION_COOKIE)
    if not chat_id:
        chat_id = str(uuid.uuid4())
        print(f"🔑 Сгенерирована новая chat_id: {chat_id}")
    else:
        print(f"🔑 chat_id из cookie: {chat_id}")
    return chat_id


@app.get("/", response_class=HTMLResponse)
async def chat_page(request: Request):
    chat_id = get_or_create_chat_id(request)
    history = dialogue_cache.get(chat_id, [])
    response = templates.TemplateResponse("chat.html", {
        "request": request,
        "messages": history
    })
    # Устанавливаем cookie только если её нет
    if SESSION_COOKIE not in request.cookies:
        response.set_cookie(key=SESSION_COOKIE, value=chat_id, max_age=30 * 24 * 60 * 60)
    return response


@app.post("/send", response_class=HTMLResponse)
async def send_message(request: Request, message: str = Form(...)):
    chat_id = get_or_create_chat_id(request)
    message = message.strip()

    # отправить запрос на RAG-бэкенд
    payload = {"chat_id": chat_id, "message": message}
    try:
        resp = requests.post(f"{RAG_BACKEND_URL}/chat", json=payload, timeout=60)
        resp.raise_for_status()
        response_data = resp.json()
        assistant_answer = response_data.get("response", "[Нет ответа]")
    except Exception as e:
        print(f"Ошибка при обращении к системе: {e}")
        assistant_answer = "К сожалению, система временно недоступна. Пожалуйста, попробуйте позже"

    # сохранить в кэш (или не делать этого, если хочешь быть stateless)
    history = dialogue_cache.setdefault(chat_id, [])
    history.append({"role": "user", "text": message})
    history.append({"role": "assistant", "text": assistant_answer})

    response = templates.TemplateResponse("components/messages.html", {
        "request": request,
        "messages": history
    })
    if SESSION_COOKIE not in request.cookies:
        response.set_cookie(key=SESSION_COOKIE, value=chat_id, max_age=30 * 24 * 60 * 60)
    return response


@app.post("/clear", response_class=HTMLResponse)
async def clear_history(request: Request):
    chat_id = get_or_create_chat_id(request)

    # отправить запрос на RAG-бэкенд
    payload = {"chat_id": chat_id}
    try:
        resp = requests.post(f"{RAG_BACKEND_URL}/clear_history", json=payload, timeout=30)
        resp.raise_for_status()
    except Exception as e:
        print(f"❌ Ошибка при очистке: {e}")
    dialogue_cache[chat_id] = []

    response = templates.TemplateResponse("components/messages.html", {
        "request": request,
        "messages": []
    })
    if SESSION_COOKIE not in request.cookies:
        response.set_cookie(key=SESSION_COOKIE, value=chat_id, max_age=30 * 24 * 60 * 60)
    return response


if __name__ == "__main__":
    print("🚀 Запуск FastAPI сервера...")
    uvicorn.run("main:app", reload=True)
