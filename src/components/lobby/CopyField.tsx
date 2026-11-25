import { useState } from "react";
import "./CopyField.css";

type Props = { label: string; value: string };

export default function CopyField({ label, value }: Props) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard not available
    }
  };

  const masked = "•".repeat(Math.min(value.length, 20));

  return (
    <div className="copy-field">
      <span className="copy-label">{label}</span>
      <div className="copy-row">
        <button
          type="button"
          className="copy-value"
          onClick={copy}
          title="Click to copy"
        >
          <span className="value-text">{revealed ? value : masked}</span>
          <span className={`copy-hint ${copied ? "done" : ""}`}>
            {copied ? "Copied!" : "Click to copy"}
          </span>
        </button>

        <button
          type="button"
          className="eye-btn"
          onClick={() => setRevealed(!revealed)}
          aria-label={revealed ? `Hide ${label}` : `Show ${label}`}
          title={revealed ? "Hide" : "Show"}
        >
          {revealed ? (
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
              <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
              <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          ) : (
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
