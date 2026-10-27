"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  LoaderCircle,
  Search,
} from "lucide-react";
import { searchResearch } from "@/app/research-actions";
import { researchCategories, type ResearchCategory } from "@/lib/research";

export function ResearchForm({
  initial = [],
}: {
  initial?: ResearchCategory[];
}) {
  const [selected, setSelected] = useState<ResearchCategory[]>(initial);
  const [open, setOpen] = useState(false);
  const [popup, setPopup] = useState({ above: false, height: 400 });
  const [state, action, pending] = useActionState(searchResearch, null);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    function outside(event: PointerEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  const labels = researchCategories
    .filter((category) => selected.includes(category.id))
    .map((category) => category.label);
  return (
    <form
      action={action}
      className="research-form"
      aria-label="New research"
      onSubmit={() => setOpen(false)}
    >
      <div className="search-row">
        <div
          className="category-field"
          ref={container}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
              trigger.current?.focus();
            }
          }}
        >
          <label id="categories-label">Research categories</label>
          <button
            ref={trigger}
            type="button"
            className={`category-trigger${open ? " is-open" : ""}`}
            aria-labelledby="categories-label categories-value"
            aria-expanded={open}
            aria-controls="category-options"
            onClick={() => {
              if (!open && container.current) {
                const bounds = container.current.getBoundingClientRect();
                const below = window.innerHeight - bounds.bottom - 18;
                const above = bounds.top - 18;
                const useAbove = below < 220 && above > below;
                setPopup({
                  above: useAbove,
                  height: Math.max(
                    120,
                    Math.min(400, useAbove ? above : below),
                  ),
                });
              }
              setOpen(!open);
            }}
            disabled={pending}
          >
            <Search size={19} aria-hidden="true" />
            <span id="categories-value">
              {labels.length
                ? `${labels.slice(0, 2).join(", ")}${labels.length > 2 ? ` +${labels.length - 2}` : ""}`
                : "Choose your categories"}
            </span>
            <ChevronDown size={17} aria-hidden="true" />
          </button>
          {selected.map((id) => (
            <input key={id} type="hidden" name="categories" value={id} />
          ))}
          {open && (
            <div
              className={`category-popover${popup.above ? " category-popover-above" : ""}`}
              style={{ maxHeight: popup.height }}
              id="category-options"
              role="group"
              aria-labelledby="categories-label"
            >
              <div className="category-popover-heading">
                <span>Explore a category</span>
                <span>{selected.length}/5 selected</span>
              </div>
              <div className="category-options-list">
                {researchCategories.map((category) => (
                  <label
                    key={category.id}
                    className={`category-option${selected.includes(category.id) ? " is-selected" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(category.id)}
                      disabled={
                        !selected.includes(category.id) && selected.length >= 5
                      }
                      onChange={(event) =>
                        setSelected((current) =>
                          event.target.checked
                            ? [...current, category.id]
                            : current.filter((id) => id !== category.id),
                        )
                      }
                    />
                    <span>{category.label}</span>
                    <Check size={16} aria-hidden="true" />
                  </label>
                ))}
              </div>
              <button
                type="button"
                className="category-done"
                onClick={() => {
                  setOpen(false);
                  trigger.current?.focus();
                }}
              >
                Done <Check size={14} />
              </button>
            </div>
          )}
        </div>
        <button
          type="submit"
          className="research-search"
          disabled={selected.length === 0 || pending}
        >
          {pending ? (
            <>
              <LoaderCircle size={17} className="spin" /> Starting…
            </>
          ) : (
            <>
              Search <ArrowRight size={18} />
            </>
          )}
        </button>
      </div>
      <p className="research-hint">
        Choose up to 5 categories. We&apos;ll take it from there.
      </p>
      {state?.error && (
        <p className="research-error" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
