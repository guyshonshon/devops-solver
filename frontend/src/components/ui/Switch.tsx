import * as RadixSwitch from "@radix-ui/react-switch";
import { forwardRef } from "react";

interface SwitchProps extends React.ComponentPropsWithoutRef<typeof RadixSwitch.Root> {
  color?: string;
  label?: string;
}

export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(
  ({ color = "#2563eb", label, checked, ...props }, ref) => (
    <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
      <RadixSwitch.Root
        ref={ref}
        checked={checked}
        style={{
          position: "relative",
          width: "36px",
          height: "20px",
          background: checked ? color : "#1e2a45",
          border: `1px solid ${checked ? color : "#2a3a60"}`,
          borderRadius: "10px",
          cursor: "pointer",
          outline: "none",
          transition: "background 0.2s, border-color 0.2s",
        }}
        {...props}
      >
        <RadixSwitch.Thumb
          style={{
            display: "block",
            width: "14px",
            height: "14px",
            background: "white",
            borderRadius: "50%",
            boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
            transition: "transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
            transform: checked ? "translateX(17px)" : "translateX(2px)",
            willChange: "transform",
          }}
        />
      </RadixSwitch.Root>
      {label && (
        <span style={{ fontSize: "12px", fontFamily: "JetBrains Mono, monospace", color: "#4a5568" }}>
          {label}
        </span>
      )}
    </label>
  )
);
Switch.displayName = "Switch";
