 
 
 
 
 
import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-lightGray bg-white px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-charcoal/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beige focus:border-beige focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-lightGray disabled:opacity-50 md:text-sm font-poppins transition-colors",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }

