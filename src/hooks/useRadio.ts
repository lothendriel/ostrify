import { useContext } from "react";
import { RadioContext } from "@/contexts/RadioContext";

export function useRadio() {
  const context = useContext(RadioContext);
  if (!context) throw new Error("useRadio must be used within RadioProvider");
  return context;
}
