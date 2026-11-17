"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";
type ChatEntry = { role: "user" | "assistant"; content: string };
type Props = { recipeTitle: string; currentStep: string };
type Language = "en-IN" | "hi-IN" | "te-IN";
const LANGUAGES: Record<Language, { label: string; instruction: string }> = {
  "en-IN": { label: "English", instruction: "English" },
  "hi-IN": { label: "Hindi", instruction: "Hindi (Devanagari script)" },
  "te-IN": { label: "Telugu", instruction: "Telugu (Telugu script)" },
};

function cleanForSpeech(raw: string): string {
  return raw
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/^\s*[-*_]{3,}\s*$/gm, " ")
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/\*\*|__|~~|`/g, "")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/_([^_\n]+)_/g, "$1")
    .replace(/[-–—_*=#~]{2,}/g, " ")
    .replace(/[|<>]/g, " ")
    .replace(/\s*\n+\s*/g, ". ")
    .replace(/\.{2,}/g, ".")
    .replace(/\s+/g, " ")
    .replace(/\.\s*\./g, ".")
    .trim();
}

export default function VoiceAssistant({ recipeTitle, currentStep }: Props) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [language, setLanguage] = useState<Language>("en-IN");
  const [rate, setRate] = useState(0.95);
  const [error, setError] = useState("");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);
  const speechGeneration = useRef(0);
  const mounted = useRef(true);
  const requestId = useRef(0);
  const messagesRef = useRef<ChatEntry[]>([]);
  const languageRef = useRef<Language>(language);
  const stepRef = useRef(currentStep);

  useEffect(() => { languageRef.current = language; }, [language]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => {
    mounted.current = true;
    if (!("speechSynthesis" in window)) return;
    const updateVoices = () => setVoices(window.speechSynthesis.getVoices());
    updateVoices();
    window.speechSynthesis.addEventListener("voiceschanged", updateVoices);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", updateVoices);
  }, []);

  const stopSpeech = useCallback(() => {
    speechGeneration.current += 1;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    if (mounted.current) { setSpeaking(false); setPaused(false); }
  }, []);

  useEffect(() => {
    if (stepRef.current !== currentStep) {
      stepRef.current = currentStep;
      requestId.current += 1;
      recognitionRef.current?.stop();
      stopSpeech();
      setMessages([]);
      setInput("");
      setLoading(false);
    }
  }, [currentStep, stopSpeech]);

  useEffect(() => () => {
    mounted.current = false;
    requestId.current += 1;
    speechGeneration.current += 1;
    recognitionRef.current?.stop();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  function speak(text: string) {
    if (!("speechSynthesis" in window)) {
      setError("Voice playback is not supported in this browser.");
      return;
    }
    stopSpeech();
    const cleaned = cleanForSpeech(text);
    if (!cleaned) { setError("There is no readable text to speak."); return; }
    const generation = speechGeneration.current;
    const utterance = new SpeechSynthesisUtterance(cleaned);
    utterance.lang = language;
    utterance.rate = rate;
    utterance.pitch = 1;
    const matching = voices.filter(v => v.lang.toLowerCase() === language.toLowerCase());
    const fallback = voices.filter(v => v.lang.toLowerCase().startsWith(language.slice(0, 2).toLowerCase()));
    const selected = matching[0] ?? fallback[0];
    if (selected) utterance.voice = selected;
    utterance.onstart = () => { if (mounted.current && generation === speechGeneration.current) setSpeaking(true); };
    utterance.onend = () => { if (mounted.current && generation === speechGeneration.current) { setSpeaking(false); setPaused(false); } };
    utterance.onerror = e => {
      if (mounted.current && generation === speechGeneration.current && e.error !== "canceled" && e.error !== "interrupted") {
        setError(`Speech playback failed: ${e.error}`);
        setSpeaking(false); setPaused(false);
      }
    };
    window.speechSynthesis.speak(utterance);
  }

  function startListening() {
    setError("");
    stopSpeech();
    const browserWindow = window as Window & {
      SpeechRecognition?: new () => any;
      webkitSpeechRecognition?: new () => any;
    };
    const Recognition = browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setError("Voice input is unavailable in this browser. Try Chrome or Edge, or type your question.");
      return;
    }
    try {
      const recognition = new Recognition();
      recognitionRef.current = recognition;
      recognition.lang = language;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.onstart = () => setListening(true);
      recognition.onresult = (event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => {
        setInput(event.results[0][0].transcript);
      };
      recognition.onerror = (event: { error?: string }) => {
        const errors: Record<string, string> = {
          "not-allowed": "Microphone permission denied. Allow microphone access in browser settings.",
          "service-not-allowed": "Browser speech recognition service is blocked.",
          "audio-capture": "No microphone detected.",
          "no-speech": "No speech detected. Please try again.",
          network: "Speech recognition network error.",
          "language-not-supported": "This browser does not support speech recognition in the selected language.",
        };
        if (event.error !== "aborted") setError(errors[event.error ?? ""] ?? `Microphone error: ${event.error ?? "unknown"}`);
        setListening(false);
      };
      recognition.onend = () => { setListening(false); recognitionRef.current = null; };
      recognition.start();
    } catch {
      setListening(false);
      setError("Could not start the microphone. Check browser permissions.");
    }
  }

  async function sendMessage() {
    const message = input.trim();
    if (!message || loading) return;
    stopSpeech();
    setError("");
    setLoading(true);
    setInput("");
    const history = messagesRef.current;
    const updatedMessages: ChatEntry[] = [...history, { role: "user", content: message }];
    setMessages(updatedMessages);
    messagesRef.current = updatedMessages;
    const id = ++requestId.current;
    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !data.session?.access_token) throw new Error("Please log in again to use CookMate AI.");
      const response = await fetch(`${API_URL}/api/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
        body: JSON.stringify({
          message: `${message}\n\n[CookMate voice preference: Reply in ${LANGUAGES[languageRef.current].instruction}. Use short, natural spoken sentences. No Markdown, decorative symbols, tables, or links. Keep cooking quantities and safety advice accurate.]`,
          recipe_title: recipeTitle,
          current_step: currentStep,
          history: history.slice(-12),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : "CookMate could not answer your question.");
      if (!mounted.current || id !== requestId.current) return;
      const reply = typeof result.reply === "string" ? result.reply : "Sorry, I could not answer that.";
      const next: ChatEntry[] = [...updatedMessages, { role: "assistant", content: reply }];
      messagesRef.current = next;
      setMessages(next);
      speak(reply);
    } catch (err) {
      if (mounted.current && id === requestId.current) setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      if (mounted.current && id === requestId.current) setLoading(false);
    }
  }

  return (
    <section className="mt-8 rounded-2xl border border-gray-200 bg-white p-6">
      <h2 className="text-xl font-bold text-gray-900">Ask CookMate AI</h2>
      <p className="mt-2 text-sm text-gray-600">Ask about your current cooking step using text or voice.</p>
      <div className="mt-4 flex flex-wrap gap-4">
        <label className="text-sm font-medium text-gray-700">Language
          <select value={language} onChange={e => { stopSpeech(); recognitionRef.current?.stop(); setLanguage(e.target.value as Language); }} className="mt-1 block rounded-lg border border-gray-300 bg-white p-2 text-gray-900">
            {Object.entries(LANGUAGES).map(([code, item]) => <option key={code} value={code}>{item.label}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-gray-700">Voice speed
          <select value={rate} onChange={e => setRate(Number(e.target.value))} className="mt-1 block rounded-lg border border-gray-300 bg-white p-2 text-gray-900">
            <option value={0.8}>Slow</option><option value={0.95}>Normal</option><option value={1.15}>Fast</option>
          </select>
        </label>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => speak(currentStep)} className="rounded-xl border px-4 py-2 text-sm font-medium text-gray-800">Read Current Step</button>
        <button type="button" disabled={!speaking} onClick={() => { if (paused) { window.speechSynthesis.resume(); setPaused(false); } else { window.speechSynthesis.pause(); setPaused(true); } }} className="rounded-xl border px-4 py-2 text-sm font-medium text-gray-800 disabled:opacity-50">{paused ? "Resume" : "Pause"}</button>
        <button type="button" onClick={stopSpeech} className="rounded-xl border px-4 py-2 text-sm font-medium text-gray-800">Stop Voice</button>
      </div>
      <div className="mt-5 max-h-72 space-y-3 overflow-y-auto" aria-live="polite">
        {messages.map((message, index) => (
          <div key={index} className={`rounded-xl p-4 ${message.role === "user" ? "ml-8 bg-gray-100" : "mr-8 bg-blue-50"}`}>
            <p className="mb-1 text-xs font-semibold text-gray-500">{message.role === "user" ? "YOU" : "COOKMATE"}</p>
            <p className="whitespace-pre-wrap text-sm text-gray-800">{message.content}</p>
            {message.role === "assistant" && <button type="button" onClick={() => speak(message.content)} className="mt-3 text-sm font-medium text-blue-700 hover:underline">Listen again</button>}
          </div>
        ))}
      </div>
      <textarea value={input} onChange={event => setInput(event.target.value)} placeholder="Example: How do I know when the onions are cooked?" rows={3} className="mt-5 w-full rounded-xl border border-gray-300 p-3 text-sm text-gray-900 outline-none focus:border-blue-500" />
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={listening ? () => recognitionRef.current?.stop() : startListening} disabled={loading} className="rounded-xl border border-gray-300 px-5 py-3 font-medium text-gray-800 disabled:opacity-50">{listening ? "Stop Listening" : "Speak"}</button>
        <button type="button" onClick={sendMessage} disabled={!input.trim() || loading} className="rounded-xl bg-black px-5 py-3 font-medium text-white disabled:opacity-50">{loading ? "Thinking..." : "Ask CookMate"}</button>
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
    </section>
  );
}
