import * as RadixTabs from "@radix-ui/react-tabs";
import { motion } from "framer-motion";
import { forwardRef } from "react";

export const Tabs = RadixTabs.Root;

export const TabsList = forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof RadixTabs.List>
>(({ className, ...props }, ref) => (
  <RadixTabs.List
    ref={ref}
    className={className}
    style={{ display: "flex", borderBottom: "1px solid #1e2a45", gap: "2px" }}
    {...props}
  />
));
TabsList.displayName = "TabsList";

export const TabsTrigger = forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof RadixTabs.Trigger> & { activeColor?: string }
>(({ children, activeColor = "#60a5fa", ...props }, ref) => (
  <RadixTabs.Trigger
    ref={ref}
    style={{
      position: "relative",
      padding: "10px 16px",
      fontSize: "12px",
      fontFamily: "JetBrains Mono, monospace",
      fontWeight: 500,
      background: "transparent",
      border: "none",
      cursor: "pointer",
      color: "#4a5568",
      transition: "color 0.15s",
      outline: "none",
    }}
    onMouseEnter={(e) => { e.currentTarget.style.color = "#8899aa"; }}
    onMouseLeave={(e) => {
      if (!e.currentTarget.dataset.state?.includes("active"))
        e.currentTarget.style.color = "#4a5568";
    }}
    data-active-color={activeColor}
    {...props}
  >
    {children}
    {/* Active underline handled via CSS since Radix adds data-state="active" */}
    <style>{`
      [data-state="active"][data-active-color="${activeColor}"] {
        color: ${activeColor} !important;
      }
      [data-state="active"]::after {
        content: "";
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 2px;
        background: ${activeColor};
        border-radius: 2px 2px 0 0;
      }
    `}</style>
  </RadixTabs.Trigger>
));
TabsTrigger.displayName = "TabsTrigger";

export const TabsContent = RadixTabs.Content;
