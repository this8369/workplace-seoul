import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export default function AssetTypeSelect() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const office = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    office.current?.focus();
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  return (
    <div
      className="asset-type-select"
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          event.stopPropagation();
          close();
        } else if (
          ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
        ) {
          event.preventDefault();
          setOpen(true);
          office.current?.focus();
        }
      }}
    >
      <h1>
        <button
          ref={trigger}
          type="button"
          className="asset-type-trigger"
          aria-label="자산 유형: OFFICE"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          onClick={() => setOpen((value) => !value)}
        >
          OFFICE
          <ChevronDown size={15} aria-hidden="true" />
        </button>
      </h1>
      {open && (
        <div
          id={menuId}
          className="asset-type-menu"
          role="menu"
          aria-label="자산 유형"
        >
          <button
            ref={office}
            type="button"
            role="menuitemradio"
            aria-checked="true"
            onClick={close}
          >
            <span>OFFICE</span>
            <Check size={16} aria-hidden="true" />
          </button>
          {["호텔", "시니어", "DataCenter"].map((label) => (
            <button
              key={label}
              type="button"
              role="menuitemradio"
              aria-checked="false"
              disabled
            >
              <span>{label}</span>
              <span className="asset-type-badge">준비중</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
