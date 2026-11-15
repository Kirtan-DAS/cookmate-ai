"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

type ChatEntry = {
  role: "user" | "assistant";
  content: string;
};

type Props = {
  recipeTitle: string;
  currentStep: string;
};

export default function VoiceAssistant({
  recipeTitle,
  currentStep,
}: Props) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");

  function speak(text: string) {
    if (!("speechSynthesis" in window)) {
      setError("Voice playback is not supported by this browser.");
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-IN";
    utterance.rate = 0.95;
    utterance.pitch = 1;

    window.speechSynthesis.speak(utterance);
  }

  function startListening() {
    setError("");

    const browserWindow = window as any;
    const Recognition =
      browserWindow.SpeechRecognition ||
      browserWindow.webkitSpeechRecognition;

    if (!Recognition) {
      setError(
        "Voice input is not supported in this browser. Try Chrome or Edge."
      );
      return;
    }

    const recognition = new Recognition();
    recognition.lang = "en-IN";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setListening(true);

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
    };

    recognition.onerror = (event: any) => {
      const errors: Record<string, string> = {
        "not-allowed": "Microphone permission denied. Allow microphone access in Chrome site settings.",
        "service-not-allowed": "Browser speech recognition service is blocked.",
        "audio-capture": "No microphone detected. Check your microphone connection.",
        "no-speech": "No speech detected. Please try speaking again.",
        "network": "Speech recognition network error. Check your internet connection.",
        "aborted": "Voice input was stopped."
      };

      setError(
        errors[event.error] ||
        `Microphone error: ${event.error || "Unknown error"}`
      );
      setListening(false);
    };

    recognition.onend = () => setListening(false);

    recognition.start();
  }

  async function sendMessage() {
    const message = input.trim();

    if (!message || loading) return;

    setError("");
    setLoading(true);
    setInput("");

    const updatedMessages: ChatEntry[] = [
      ...messages,
      { role: "user", content: message },
    ];

    setMessages(updatedMessages);

    try {
      const { data, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError || !data.session?.access_token) {
        throw new Error("Please log in again to use CookMate AI.");
      }

      const response = await fetch(`${API_URL}/api/ai/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${data.session.access_token}`,
        },
        body: JSON.stringify({
          message,
          recipe_title: recipeTitle,
          current_step: currentStep,
          history: messages.slice(-12),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.detail || "CookMate could not answer your question."
        );
      }

      const reply = result.reply || "Sorry, I could not answer that.";

      setMessages([
        ...updatedMessages,
        { role: "assistant", content: reply },
      ]);

      speak(reply);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mt-8 rounded-2xl border border-gray-200 bg-white p-6">
      <h2 className="text-xl font-bold text-gray-900">
        Ask CookMate AI
      </h2>

      <p className="mt-2 text-sm text-gray-600">
        Ask questions about your current cooking step using text or voice.
      </p>

      <div className="mt-5 max-h-72 space-y-3 overflow-y-auto">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`rounded-xl p-4 ${
              message.role === "user"
                ? "ml-8 bg-gray-100"
                : "mr-8 bg-blue-50"
            }`}
          >
            <p className="mb-1 text-xs font-semibold text-gray-500">
              {message.role === "user" ? "YOU" : "COOKMATE"}
            </p>
            <p className="whitespace-pre-wrap text-sm text-gray-800">
              {message.content}
            </p>

            {message.role === "assistant" && (
              <button
                type="button"
                onClick={() => speak(message.content)}
                className="mt-3 text-sm font-medium text-blue-700 hover:underline"
              >
                🔊 Listen again
              </button>
            )}
          </div>
        ))}
      </div>

      <textarea
        value={input}
        onChange={(event) => setInput(event.target.value)}
        placeholder="Example: How do I know when the onions are cooked?"
        rows={3}
        className="mt-5 w-full rounded-xl border border-gray-300 p-3 text-sm text-gray-900 outline-none focus:border-blue-500"
      />

      <div className="mt-4 flex flex-wrap items-center gap-3" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px" }}>
        <button
          type="button"
          onClick={startListening}
          disabled={listening || loading}
          className="rounded-xl border border-gray-300 px-5 py-3 font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50" style={{ minWidth: "130px" }}
        >
          {listening ? "🎙 Listening..." : "🎙 Speak"}
        </button>

        <button
          type="button"
          onClick={sendMessage}
          disabled={!input.trim() || loading}
          className="rounded-xl bg-black px-5 py-3 font-medium text-white hover:bg-gray-800 disabled:opacity-50" style={{ minWidth: "150px" }}
        >
          {loading ? "Thinking..." : "Ask CookMate"}
        </button>

        <button
          type="button"
          onClick={() => window.speechSynthesis?.cancel()}
          className="rounded-xl border border-gray-300 px-5 py-3 font-medium text-gray-700 hover:bg-gray-50" style={{ minWidth: "130px" }}
        >
          Stop Voice
        </button>
      </div>

      {error && (
        <p className="mt-3 text-sm text-red-600">{error}</p>
      )}
    </section>
  );
}
