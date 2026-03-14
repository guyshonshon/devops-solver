import * as RadixDialog from "@radix-ui/react-dialog";
import { motion, AnimatePresence } from "framer-motion";
import { forwardRef } from "react";
import { X } from "lucide-react";

export const Dialog = RadixDialog.Root;
export const DialogTitle = RadixDialog.Title;
export const DialogDescription = RadixDialog.Description;

export const DialogContent = forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof RadixDialog.Content> & { title?: string }
>(({ children, title, ...props }, ref) => (
  <RadixDialog.Portal>
    <RadixDialog.Overlay
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(4px)",
        zIndex: 100,
      }}
    />
    <RadixDialog.Content
      ref={ref}
      style={{
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        background: "#111827",
        border: "1px solid #1e2a45",
        borderRadius: "16px",
        padding: "24px",
        width: "min(600px, 90vw)",
        maxHeight: "80vh",
        overflowY: "auto",
        zIndex: 101,
        boxShadow: "0 25px 80px rgba(0,0,0,0.6)",
        outline: "none",
      }}
      {...props}
    >
      {title && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "20px",
          }}
        >
          <RadixDialog.Title
            style={{
              fontSize: "16px",
              fontWeight: 600,
              color: "#dde4f0",
              fontFamily: "Inter, sans-serif",
            }}
          >
            {title}
          </RadixDialog.Title>
          <RadixDialog.Close asChild>
            <button
              style={{
                background: "transparent",
                border: "1px solid #1e2a45",
                borderRadius: "6px",
                padding: "4px",
                cursor: "pointer",
                color: "#4a5568",
                display: "flex",
                alignItems: "center",
              }}
            >
              <X size={14} />
            </button>
          </RadixDialog.Close>
        </div>
      )}
      {children}
    </RadixDialog.Content>
  </RadixDialog.Portal>
));
DialogContent.displayName = "DialogContent";
