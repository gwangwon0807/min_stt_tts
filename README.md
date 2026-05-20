# min_func

목적지 음성/텍스트 입력 MVP입니다.

- 프론트: React
- 백엔드: FastAPI
- STT: `pywhispercpp`
- TTS: `edge-tts` 우선, 실패 시 브라우저 기본 음성 fallback

## 기능

- 사용자가 목적지를 말하면 백엔드가 문장을 인식
- 약 `1.8초` 무음이면 자동 종료
- 인식 문장에서 목적지만 추출
- `"{목적지}를 도착지로 설정할까요? ..."` 안내 문구 생성
- 화면 `2번 터치`: 확정
- 화면 `3번 터치`: 다시 입력
- 마이크를 못 쓰는 경우 텍스트 입력으로 동일 로직 테스트 가능

## 실행

### 백엔드

```bash
cd min_func/backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload
```

### 프론트

```bash
cd min_func/frontend
npm install
npm run dev
```

필요하면 `frontend/.env.example` 를 참고해서 `frontend/.env` 에 `VITE_API_BASE` 를 넣을 수 있습니다.

예:

```env
VITE_API_BASE=http://localhost:8000
```

### 폰 테스트

같은 Wi-Fi에 연결한 뒤 PC에서 백엔드와 프론트를 외부 접속 가능하게 실행합니다.

```bash
cd min_func/backend
source .venv/bin/activate
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

```bash
cd min_func/frontend
npm run dev -- --host
```

PC의 로컬 IP가 예를 들어 `192.168.0.10` 이면 폰에서 아래 주소로 접속합니다.

```text
http://192.168.0.10:5173
```

## 배포 참고

- 로컬 테스트: 현재 접속한 PC의 호스트명을 기준으로 자동으로 백엔드에 붙습니다.
- Vercel 배포: 프론트 환경변수 `VITE_API_BASE` 에 실제 백엔드 주소를 넣어야 합니다.
- 예: `VITE_API_BASE=https://your-backend.example.com`

## 테스트 방법

### 텍스트 테스트

1. 브라우저에서 `http://localhost:5173` 접속
2. 입력창에 예: `강원대학교로 가줘`
3. `텍스트 전송` 클릭
4. `목적지` 와 안내 문구 확인

### 음성 테스트

1. `음성 시작` 클릭
2. 예: `서울역으로 가고 싶어` 말하기
3. 잠시 말하지 않으면 자동 종료
4. 목적지와 안내 문구 확인

## TTS 동작

- 1순위: 백엔드 `edge-tts`
- 현재 기본 음성: `ko-KR-SunHiNeural` 여성 음성
- `edge-tts` 실패 시 프론트가 브라우저 기본 한국어 음성으로 읽음

구분 방법:

- 백엔드 `/tts` 가 성공하면 서버 TTS 사용
- 화면 상태가 `기본 음성으로 재생 중` 이면 fallback 사용

## 주요 API

- `POST /stt`: 오디오 업로드 후 문장 인식
- `POST /text`: 텍스트로 목적지 추출 테스트
- `POST /finalize`: 현재 문장에서 목적지 확정 추출
- `POST /tts`: 안내 문구 음성 mp3 반환
- `POST /confirm`: 목적지 확정
- `POST /reset`: 상태 초기화
- `GET /stt`: 현재 상태 조회

## GitHub 업로드 기준

- Python 의존성: `backend/requirements.txt`
- 프론트 의존성: `frontend/package.json`
- 프론트 lock file: `frontend/package-lock.json`
- 환경변수 예시: `frontend/.env.example`
- 불필요 파일은 `.gitignore` 로 제외

업로드 전 제외되는 주요 항목:

- `backend/.venv`
- `backend/__pycache__`
- `frontend/node_modules`
- `frontend/dist`
- `.env` 계열 파일

## 참고

- `ffmpeg` 가 설치되어 있어야 합니다.
- 목적지 추출은 규칙 기반이라 너무 자유로운 문장은 오차가 날 수 있습니다.
- `edge-tts` 는 무료 MVP용으로 적합하지만 비공식 경로라 장기 상용 최종안으로 보기엔 한계가 있습니다.
