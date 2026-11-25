import { useEffect } from "react";

export default function Countdown({ value }: { value: number }) {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  return (
    <div className="countdown" role="status" aria-live="polite">
      <p>Get ready!</p>
      <div className="countdown-number" key={value}>
        {value}
      </div>
    </div>
  );
}
