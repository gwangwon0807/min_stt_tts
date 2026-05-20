import os
import re
import subprocess
import time
from tempfile import NamedTemporaryFile

import edge_tts
from aiohttp.client_exceptions import ClientError
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from starlette.responses import Response
from pywhispercpp.model import Model

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

state = {
    "text": "",
    "destination": "",
    "prompt": "",
    "confirmed": False,
    "updated_at": 0.0,
}

model = Model(
    "small",
    n_threads=max(1, os.cpu_count() or 1),
    print_realtime=False,
    print_progress=False,
)


class TextBody(BaseModel):
    text: str


def extract_destination(text: str) -> str:
    cleaned = re.sub(r"\s+", " ", text).strip(" .,?")
    cleaned = re.sub(r"^(저|나|음|어|그|저기)\s+", "", cleaned)
    patterns = [
        r"(.+?)(?:으로|로)\s*가(?:고 싶어|고싶어|줘|자|려면|는 길)?$",
        r"(.+?)(?:까지)\s*가(?:고 싶어|고싶어|줘|자)?$",
        r"(?:목적지는|도착지는|가고 싶은 곳은|가고싶은 곳은)\s*(.+)$",
    ]
    for pattern in patterns:
        match = re.search(pattern, cleaned)
        if match:
            cleaned = match.group(1).strip()
            break
    cleaned = re.sub(
        r"(가고 싶어|가고싶어|가줘|안내해줘|데려다줘|보내줘|찾아줘)$", "", cleaned
    ).strip()
    return cleaned


def build_prompt(destination: str) -> str:
    return (
        f"목적지는 {destination} 입니다. 맞으면 화면을 두번, 틀리면 세번 터치해주세요"
    )


async def make_tts(text: str) -> bytes:
    audio = bytearray()
    communicate = edge_tts.Communicate(text, "ko-KR-SunHiNeural")
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio.extend(chunk["data"])
    return bytes(audio)


@app.post("/reset")
async def reset():
    state.update(
        {
            "text": "",
            "destination": "",
            "prompt": "",
            "confirmed": False,
            "updated_at": 0.0,
        }
    )
    return state


@app.post("/stt")
async def stt(file: UploadFile = File(...)):
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="empty audio")

    with NamedTemporaryFile(suffix=".webm") as temp:
        temp.write(data)
        temp.flush()
        try:
            segments = model.transcribe(temp.name, language="ko")
            text = " ".join(segment.text.strip() for segment in segments).strip()
        except subprocess.CalledProcessError:
            raise HTTPException(status_code=400, detail="audio decode failed")

    if text:
        state["text"] = text
        state["updated_at"] = time.time()
        state["destination"] = ""
        state["prompt"] = ""
        state["confirmed"] = False
    return state


@app.post("/finalize")
async def finalize():
    destination = extract_destination(state["text"])
    state["destination"] = destination
    state["prompt"] = build_prompt(destination) if destination else ""
    return state


@app.post("/text")
async def text_input(body: TextBody):
    state["text"] = body.text.strip()
    state["updated_at"] = time.time()
    state["confirmed"] = False
    destination = extract_destination(state["text"])
    state["destination"] = destination
    state["prompt"] = build_prompt(destination) if destination else ""
    return state


@app.post("/confirm")
async def confirm():
    state["confirmed"] = True
    return state


@app.post("/tts")
async def tts(body: TextBody):
    if not body.text.strip():
        raise HTTPException(status_code=400, detail="empty text")
    try:
        audio = await make_tts(body.text.strip())
    except ClientError:
        raise HTTPException(status_code=502, detail="edge tts failed")
    return Response(content=audio, media_type="audio/mpeg")


@app.get("/stt")
async def get_stt():
    return state
