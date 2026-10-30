import { createContext, useContext, useState, type ReactNode } from "react";
import { X } from "lucide-react";
const FeedbackContext = createContext<(message: string) => void>(() => {});
export const useStudioError = () => useContext(FeedbackContext);
export function StudioFeedback({ children }: { children: ReactNode }) {
  const [error, setError] = useState("");
  return (
    <FeedbackContext.Provider value={setError}>
      {children}
      {error && (
        <div role="alert" className="toast">
          <span>{error}</span>
          <button className="icon-button sm" aria-label="Dismiss" onClick={() => setError("")}>
            <X size={14} />
          </button>
        </div>
      )}
    </FeedbackContext.Provider>
  );
}
