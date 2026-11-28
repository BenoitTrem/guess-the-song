import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { MAX_CHAT_LENGTH, type ChatMessage } from "../hooks/useLobby";
import "./Chat.css";

type Props = {
  messages: ChatMessage[];
  myId: string;
  onSend: (text: string) => void;
  paused: boolean; // no chat while a song plays, so nobody types the answer
};

// the same player always gets the same color
const hue = (id: string) => {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
};

const clock = (t: number) =>
  new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export default function Chat({ messages, myId, onSend, paused }: Props) {
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    // if you scrolled up to read, new messages don't pull you down
    stickToBottom.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  };

  useEffect(() => {
    const el = listRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const send = () => {
    if (!text.trim() || paused) return;
    stickToBottom.current = true;
    onSend(text.trim());
    setText("");
  };

  return (
    <aside className="chat">
      <h3 className="chat-title">Chat</h3>

      <div className="chat-list" ref={listRef} onScroll={onScroll}>
        {messages.length === 0 && (
          <p className="chat-empty">No messages yet. Say hi!</p>
        )}

        {messages.map((m) => (
          <div
            key={m.id}
            className={`chat-msg ${m.playerId === myId ? "mine" : ""}`}
          >
            <div className="chat-meta">
              <span
                className="chat-name"
                style={{ color: `hsl(${hue(m.playerId)} 80% 72%)` }}
              >
                {m.name}
              </span>
              <span className="chat-time">{clock(m.time)}</span>
            </div>
            <p className="chat-text">{m.text}</p>
          </div>
        ))}
      </div>

      <div className="chat-form">
        <textarea
          placeholder={
            paused ? "Chat is paused while a song plays" : "Write a message"
          }
          value={text}
          maxLength={MAX_CHAT_LENGTH}
          disabled={paused}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          aria-label="Chat message"
        />
        <button
          type="button"
          onClick={send}
          disabled={paused || !text.trim()}
          aria-label="Send"
        >
          <Send size={18} />
        </button>
      </div>
    </aside>
  );
}
