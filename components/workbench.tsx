import Link from "next/link";
import { ArrowUpRight, Fingerprint, Plus } from "lucide-react";
import { signOut } from "@/app/actions";

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="simple-app">
      <header className="simple-header">
        <Link className="simple-brand" href="/">
          <Fingerprint size={27} strokeWidth={1.5} />
          <span>
            Pain Discovery
            <span className="simple-brand-note">
              A LITTLE CURIOSITY GOES A LONG WAY
            </span>
          </span>
        </Link>
        <nav aria-label="Account">
          <Link href="/" className="new-research-link">
            <Plus size={15} /> New research
          </Link>
          <form action={signOut}>
            <button className="simple-signout">Sign out</button>
          </form>
        </nav>
      </header>
      <main className="simple-main">{children}</main>
      <footer className="simple-footer">
        <span>Real conversations. Fresh possibilities.</span>
        <span>Made for the curious.</span>
      </footer>
    </div>
  );
}
export function Heading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="muted intro">{description}</p>
      </div>
      {action}
    </div>
  );
}
export function Empty({
  title,
  children,
  href,
  label,
}: {
  title: string;
  children: React.ReactNode;
  href?: string;
  label?: string;
}) {
  return (
    <div className="empty">
      <Fingerprint size={36} />
      <h3>{title}</h3>
      <p>{children}</p>
      {href && (
        <Link className="inline-link" href={href}>
          {label}
          <ArrowUpRight size={15} />
        </Link>
      )}
    </div>
  );
}
export function Badge({ children }: { children: React.ReactNode }) {
  return <span className="badge">{children}</span>;
}
export function SourceLink({
  url,
  children = "Original source",
}: {
  url: string;
  children?: React.ReactNode;
}) {
  return (
    <a
      className="inline-link"
      href={url}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
      <ArrowUpRight size={14} />
    </a>
  );
}
export function Notice({ message }: { message?: string }) {
  return message ? (
    <div className="notice" role="status">
      {message}
    </div>
  ) : null;
}
