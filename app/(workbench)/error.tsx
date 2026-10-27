"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="empty">
      <h2>We couldn’t load this research.</h2>
      <p>Please check your connection and try again.</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
