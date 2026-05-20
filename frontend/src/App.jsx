import React, { useRef, useState } from "react";

const API_BASE =
  import.meta.env.VITE_API_BASE ||
  `${window.location.protocol}//${window.location.hostname}:8000`;

export default function App() {
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const sendingRef = useRef(false);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const tapTimerRef = useRef(null);
  const tapCountRef = useRef(0);
  const [status, setStatus] = useState("대기");
  const [text, setText] = useState("");
  const [inputText, setInputText] = useState("");
  const [destination, setDestination] = useState("");
  const [prompt, setPrompt] = useState("");
  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState("");

  async function speak(message) {
    if (!message) return;
    try {
      const res = await fetch(`${API_BASE}/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: message })
      });
      if (!res.ok) {
        throw new Error("tts failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
      const audio = new Audio(url);
      audio.load();
      await audio.play();
    } catch {
      const utterance = new SpeechSynthesisUtterance(message);
      utterance.lang = "ko-KR";
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
      setStatus("기본 음성으로 재생 중");
    }
  }

  async function sendAudio() {
    if (sendingRef.current || !chunksRef.current.length) return;
    sendingRef.current = true;
    const formData = new FormData();
    formData.append(
      "file",
      new Blob(chunksRef.current, { type: "audio/webm" }),
      "voice.webm"
    );
    try {
      const res = await fetch(`${API_BASE}/stt`, {
        method: "POST",
        body: formData
      });
      const data = await res.json();
      setText(data.text || "");
    } catch {
      setStatus("백엔드 연결 실패");
    } finally {
      sendingRef.current = false;
    }
  }

  function startSilenceWatch(stream) {
    const audioContext = new window.AudioContext();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);
    const data = new Uint8Array(analyser.fftSize);

    source.connect(analyser);
    audioContextRef.current = audioContext;
    analyserRef.current = analyser;

    const check = () => {
      if (!analyserRef.current || !recorderRef.current) return;
      analyserRef.current.getByteTimeDomainData(data);
      const active = data.some((value) => Math.abs(value - 128) > 8);

      if (active) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = setTimeout(() => stopRecord(true), 1800);
      } else if (!silenceTimerRef.current) {
        silenceTimerRef.current = setTimeout(() => stopRecord(true), 1800);
      }

      requestAnimationFrame(check);
    };

    silenceTimerRef.current = setTimeout(() => stopRecord(true), 1800);
    requestAnimationFrame(check);
  }

  async function startRecord() {
    try {
      setStatus("마이크 요청 중");
      setText("");
      setDestination("");
      setPrompt("");
      await fetch(`${API_BASE}/reset`, { method: "POST" }).catch(() => {});
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = async (e) => {
        if (!e.data.size) return;
        chunksRef.current.push(e.data);
        await sendAudio();
      };
      recorder.onstart = () => {
        setRecording(true);
        setStatus("목적지 듣는 중");
        startSilenceWatch(stream);
      };
      recorder.onstop = async () => {
        setRecording(false);
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
        analyserRef.current = null;
        await audioContextRef.current?.close();
        await sendAudio();
        while (sendingRef.current) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        const res = await fetch(`${API_BASE}/finalize`, { method: "POST" });
        const data = await res.json();
        setText(data.text || "");
        setDestination(data.destination || "");
        setPrompt(data.prompt || "");
        setStatus(data.prompt ? "목적지 확인 대기" : "목적지 추출 실패");
        await speak(data.prompt);
        streamRef.current?.getTracks().forEach((track) => track.stop());
      };

      recorder.start(1300);
    } catch {
      setStatus("마이크 사용 실패");
    }
  }

  function stopRecord(auto = false) {
    if (!recorderRef.current || recorderRef.current.state === "inactive") return;
    setStatus(auto ? "무음 감지, 목적지 확인 중" : "종료");
    clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = null;
    recorderRef.current.stop();
  }

  async function submitText() {
    try {
      const res = await fetch(`${API_BASE}/text`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: inputText })
      });
      const data = await res.json();
      setText(data.text || "");
      setDestination(data.destination || "");
      setPrompt(data.prompt || "");
      setStatus(data.prompt ? "목적지 확인 대기" : "목적지 추출 실패");
      await speak(data.prompt);
    } catch {
      setStatus("백엔드 연결 실패");
    }
  }

  async function handleTap() {
    if (!prompt) return;
    tapCountRef.current += 1;
    clearTimeout(tapTimerRef.current);
    tapTimerRef.current = setTimeout(async () => {
      if (tapCountRef.current === 2) {
        const res = await fetch(`${API_BASE}/confirm`, { method: "POST" });
        const data = await res.json();
        setStatus(`${data.destination} 설정 완료`);
        await speak(`안내합니다. ${data.destination}를 도착지로 설정했습니다`);
      }
      if (tapCountRef.current >= 3) {
        await fetch(`${API_BASE}/reset`, { method: "POST" }).catch(() => {});
        setText("");
        setDestination("");
        setPrompt("");
        setStatus("다시 말해주세요");
        await speak("다시 말해주세요");
      }
      tapCountRef.current = 0;
    }, 600);
  }

  return (
    <main
      onPointerUp={handleTap}
      style={{ padding: 24, fontFamily: "sans-serif", minHeight: "100vh" }}
    >
      <h1>목적지 음성 입력</h1>
      <button onClick={startRecord} disabled={recording}>
        음성 시작
      </button>
      <button onClick={() => stopRecord(false)} style={{ marginLeft: 8 }}>
        종료
      </button>
      <div style={{ marginTop: 16 }}>
        <input
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="예: 서울역으로 가고 싶어"
          style={{ width: 260 }}
        />
        <button onClick={submitText} style={{ marginLeft: 8 }}>
          텍스트 전송
        </button>
      </div>
      <p>상태: {status}</p>
      <p>인식 문장: {text}</p>
      <p>목적지: {destination}</p>
      <p>{prompt}</p>
      {audioUrl ? <audio controls src={audioUrl} style={{ marginTop: 12 }} /> : null}
    </main>
  );
}
