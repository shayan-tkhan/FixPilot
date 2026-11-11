"use client";
import { useEffect, useState } from "react";
import { PanelLeft, Pin, PinOff } from "lucide-react";
export default function PeekSidebar({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  useEffect(() => {
    function move(e: MouseEvent) {
      if (!pinned)
        setOpen(e.clientX < 14 ? true : e.clientX > 224 ? false : open);
    }
    window.addEventListener("mousemove", move);
    return () => window.removeEventListener("mousemove", move);
  }, [pinned, open]);
  return (
    <div
      className={`peek-shell ${open || pinned ? "sidebar-open" : ""} ${pinned ? "sidebar-pinned" : ""}`}
    >
      <button
        className="peek-toggle"
        aria-label={pinned ? "Unpin sidebar" : "Open or pin sidebar"}
        aria-expanded={open || pinned}
        onClick={() => {
          setPinned(!pinned);
          setOpen(!pinned);
        }}
        title={
          pinned ? "Unpin: sidebar follows the cursor" : "Pin sidebar open"
        }
      >
        {pinned ? (
          <PinOff size={16} />
        ) : open ? (
          <Pin size={16} />
        ) : (
          <PanelLeft size={16} />
        )}
      </button>
      <div
        className="peek-edge"
        onMouseEnter={() => setOpen(true)}
        aria-hidden="true"
      />
      {children}
    </div>
  );
}
