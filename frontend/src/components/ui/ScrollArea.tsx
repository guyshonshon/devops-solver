import * as RadixScroll from "@radix-ui/react-scroll-area";
import { forwardRef } from "react";

export const ScrollArea = forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof RadixScroll.Root>
>(({ children, style, ...props }, ref) => (
  <RadixScroll.Root
    style={{ overflow: "hidden", ...style }}
    {...props}
  >
    <RadixScroll.Viewport
      style={{ width: "100%", height: "100%", borderRadius: "inherit" }}
    >
      {children}
    </RadixScroll.Viewport>
    <RadixScroll.Scrollbar
      orientation="vertical"
      style={{
        display: "flex",
        userSelect: "none",
        touchAction: "none",
        padding: "2px",
        width: "8px",
        transition: "background 0.15s",
      }}
    >
      <RadixScroll.Thumb
        style={{
          flex: 1,
          background: "#2a3a60",
          borderRadius: "4px",
          position: "relative",
        }}
      />
    </RadixScroll.Scrollbar>
  </RadixScroll.Root>
));
ScrollArea.displayName = "ScrollArea";
