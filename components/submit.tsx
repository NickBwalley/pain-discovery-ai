"use client";
import { useFormStatus } from "react-dom";
import { Button } from "./ui/button";
export function Submit({
  children,
  pending = "Saving…",
  variant = "default",
}: {
  children: React.ReactNode;
  pending?: string;
  variant?: "default" | "secondary" | "destructive";
}) {
  const status = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={status.pending}>
      {status.pending ? pending : children}
    </Button>
  );
}
