import Link from "next/link";
export default function NotFound() {
  return (
    <main className="empty">
      <h1>Record not found</h1>
      <p>
        This record may have been removed, expired or be unavailable to your
        account.
      </p>
      <Link href="/">Back to workspace</Link>
    </main>
  );
}
