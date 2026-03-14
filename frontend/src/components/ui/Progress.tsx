import * as RadixProgress from "@radix-ui/react-progress";
import { forwardRef } from "react";

interface ProgressProps extends React.ComponentPropsWithoutRef<typeof RadixProgress.Root> {
  color?: string;
}

export const Progress = forwardRef<HTMLDivElement, ProgressProps>(
  ({ value = 0, color = "#2563eb", style, ...props }, ref) => (
    <RadixProgress.Root
      ref={ref}
      value={value}
      style={{
        position: "relative",
        height: "4px",
        background: "#1e2a45",
        borderRadius: "2px",
        overflow: "hidden",
        ...style,
      }}
      {...props}
    >
      <RadixProgress.Indicator
        style={{
          width: `${value}%`,
          height: "100%",
          background: `linear-gradient(90deg, ${color}, ${color}99)`,
          borderRadius: "2px",
          transition: "width 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      />
    </RadixProgress.Root>
  )
);
Progress.displayName = "Progress";
