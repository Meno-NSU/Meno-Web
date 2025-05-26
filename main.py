import uvicorn
from fastapi import FastAPI, Request, Form
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

dialogue_history = []
used_refs = []


@app.get("/", response_class=HTMLResponse)
async def chat_page(request: Request):
    print("📥 [GET /] Отдаём основную страницу чата")
    print(f"🔎 Текущее количество сообщений: {len(dialogue_history)}")
    return templates.TemplateResponse("chat.html", {
        "request": request,
        "messages": dialogue_history,
        "refs": used_refs
    })


@app.post("/send", response_class=HTMLResponse)
async def send_message(request: Request, message: str = Form(...)):
    print("\n📥 [POST /send] Получено новое сообщение")
    print(f"✉️ Исходный ввод: `{repr(message)}`")

    message = message.strip()
    print(f"🧹 После .strip(): `{repr(message)}`")

    response = f"🔁 Ответ на: {message}"
    refs = ["Документ 1", "Ссылка 2"]

    dialogue_history.append({"role": "user", "text": message})
    dialogue_history.append({"role": "assistant", "text": response})

    print(f"💬 Добавлено в историю:")
    print(f"👤 user: `{repr(message)}`")
    print(f"🤖 assistant: `{repr(response)}`")

    used_refs.clear()
    used_refs.extend(refs)

    print(f"📚 Использованные ссылки: {used_refs}")
    print(f"📈 Общее сообщений: {len(dialogue_history)}")

    return templates.TemplateResponse("components/messages.html", {
        "request": request,
        "messages": dialogue_history
    })


@app.get("/refs", response_class=HTMLResponse)
async def get_refs(request: Request):
    print("🔁 [GET /refs] Обновление источников")
    return templates.TemplateResponse("components/refs.html", {
        "request": request,
        "refs": used_refs
    })


@app.post("/clear", response_class=HTMLResponse)
async def clear_history(request: Request):
    print("🗑️ [POST /clear] Очищаем историю сообщений и источники")
    dialogue_history.clear()
    used_refs.clear()
    print("✅ История и ссылки очищены")

    return templates.TemplateResponse("components/messages.html", {
        "request": request,
        "messages": []
    })


if __name__ == "__main__":
    print("🚀 Запуск FastAPI сервера...")
    uvicorn.run("main:app", reload=True)
