/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Enhanced button variants with professional micro-interactions
const buttonEnhancedVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium",
  "transition-all duration-200 ease-professional transform",
  "focus-visible-ring reduced-motion-safe touch-target-enhanced",
  "disabled:pointer-events-none disabled:opacity-50",
  "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  "font-poppins relative overflow-hidden",
  {
    variants: {
      variant: {
        primary: [
          "btn-primary-enhanced",
          "bg-interactive-primary text-white",
          "hover:bg-interactive-primary-hover hover:shadow-elevated hover:-translate-y-0.5",
          "active:bg-interactive-primary-active active:translate-y-0 active:shadow-card-active",
          "disabled:bg-interactive-primary-disabled"
        ],
        secondary: [
          "btn-secondary-enhanced",
          "bg-interactive-secondary text-gray-700 border border-gray-300",
          "hover:bg-interactive-secondary-hover hover:border-gray-400 hover:shadow-card hover:-translate-y-0.5",
          "active:bg-interactive-secondary-active active:translate-y-0",
          "disabled:bg-interactive-secondary-disabled disabled:text-gray-400"
        ],
        accent: [
          "bg-interactive-accent text-white",
          "hover:bg-interactive-accent-hover hover:shadow-card-hover hover:-translate-y-0.5",
          "active:bg-interactive-accent-active active:translate-y-0",
          "disabled:bg-interactive-accent-disabled"
        ],
        destructive: [
          "bg-semantic-error-500 text-white",
          "hover:bg-semantic-error-600 hover:shadow-card-hover hover:-translate-y-0.5",
          "active:bg-semantic-error-700 active:translate-y-0",
          "disabled:bg-semantic-error-300"
        ],
        success: [
          "bg-semantic-success-500 text-white",
          "hover:bg-semantic-success-600 hover:shadow-success-glow hover:-translate-y-0.5",
          "active:bg-semantic-success-700 active:translate-y-0",
          "disabled:bg-semantic-success-300"
        ],
        warning: [
          "bg-semantic-warning-500 text-white",
          "hover:bg-semantic-warning-600 hover:shadow-card-hover hover:-translate-y-0.5",
          "active:bg-semantic-warning-700 active:translate-y-0",
          "disabled:bg-semantic-warning-300"
        ],
        outline: [
          "border-2 border-interactive-primary bg-transparent text-interactive-primary",
          "hover:bg-interactive-primary hover:text-white hover:-translate-y-0.5",
          "active:bg-interactive-primary-active active:translate-y-0",
          "disabled:border-gray-300 disabled:text-gray-400"
        ],
        ghost: [
          "bg-transparent text-gray-700",
          "hover:bg-gray-100 hover:text-gray-900 hover:-translate-y-0.5",
          "active:bg-gray-200 active:translate-y-0",
          "disabled:text-gray-400"
        ],
        link: [
          "bg-transparent text-interactive-primary underline-offset-4",
          "hover:underline hover:text-interactive-primary-hover",
          "active:text-interactive-primary-active",
          "disabled:text-gray-400"
        ],
        // AI-specific variants
        'ai-confidence-high': [
          "bg-confidence-high text-white border border-confidence-high",
          "hover:bg-confidence-excellent hover:shadow-confidence-glow hover:-translate-y-0.5",
          "active:translate-y-0"
        ],
        'ai-confidence-medium': [
          "bg-confidence-medium text-white border border-confidence-medium",
          "hover:bg-blue-600 hover:shadow-card-hover hover:-translate-y-0.5",
          "active:translate-y-0"
        ],
        'ai-confidence-low': [
          "bg-confidence-low text-white border border-confidence-low",
          "hover:bg-yellow-600 hover:shadow-card-hover hover:-translate-y-0.5",
          "active:translate-y-0"
        ],
      },
      size: {
        sm: "h-9 px-3 text-xs",
        default: "h-11 px-4 py-2",
        lg: "h-12 px-6 text-base",
        xl: "h-14 px-8 text-lg",
        icon: "h-11 w-11",
        'icon-sm': "h-9 w-9",
        'icon-lg': "h-12 w-12",
      },
      loading: {
        true: "text-transparent cursor-not-allowed",
        false: ""
      },
      pulse: {
        true: "animate-gentle-bounce",
        false: ""
      }
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
      loading: false,
      pulse: false
    },
  }
);

export interface ButtonEnhancedProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonEnhancedVariants> {
  asChild?: boolean;
  loading?: boolean;
  loadingText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  pulse?: boolean;
  confidence?: 'critical' | 'low' | 'medium' | 'high' | 'excellent';
  hapticFeedback?: boolean;
}

const ButtonEnhanced = React.forwardRef<HTMLButtonElement, ButtonEnhancedProps>(
  ({
    className,
    variant,
    size,
    asChild = false,
    loading = false,
    loadingText,
    leftIcon,
    rightIcon,
    pulse = false,
    confidence,
    hapticFeedback = false,
    children,
    onClick,
    ...props
  }, ref) => {
    // Auto-select variant based on confidence level
    const effectiveVariant = confidence
      ? (confidence === 'high' || confidence === 'excellent')
        ? 'ai-confidence-high'
        : confidence === 'medium'
        ? 'ai-confidence-medium'
        : 'ai-confidence-low'
      : variant;

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (loading || props.disabled) return;

      // Add haptic feedback simulation
      if (hapticFeedback) {
        e.currentTarget.classList.add('haptic-feedback');
        setTimeout(() => {
          e.currentTarget.classList.remove('haptic-feedback');
        }, 100);
      }

      onClick?.(e);
    };

    const Comp = asChild ? Slot : "button";

    return (
      <Comp
        className={cn(
          buttonEnhancedVariants({
            variant: effectiveVariant,
            size,
            loading,
            pulse,
            className
          })
        )}
        ref={ref}
        onClick={handleClick}
        disabled={loading || props.disabled}
        aria-busy={loading}
        aria-describedby={confidence ? `confidence-${confidence}` : undefined}
        {...props}
      >
        {/* Loading spinner */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-ai-thinking" />
          </div>
        )}

        {/* Button content */}
        <div className={cn(
          "flex items-center gap-2",
          loading && "invisible"
        )}>
          {leftIcon && (
            <span className="flex-shrink-0">
              {leftIcon}
            </span>
          )}

          <span>
            {loading && loadingText ? loadingText : children}
          </span>

          {rightIcon && (
            <span className="flex-shrink-0">
              {rightIcon}
            </span>
          )}
        </div>

        {/* Confidence indicator for AI buttons */}
        {confidence && (
          <div className="sr-only" id={`confidence-${confidence}`}>
            AI confidence level: {confidence}
          </div>
        )}
      </Comp>
    );
  }
);

ButtonEnhanced.displayName = "ButtonEnhanced";

// Specialized AI Action Button
export const AIActionButton = React.forwardRef<HTMLButtonElement, ButtonEnhancedProps & {
  aiAction?: 'analyze' | 'predict' | 'recommend' | 'calculate';
}>(({ aiAction, children, leftIcon, confidence = 'medium', ...props }, ref) => {
  const getAIIcon = () => {
    switch (aiAction) {
      case 'analyze': return '🔍';
      case 'predict': return '🔮';
      case 'recommend': return '💡';
      case 'calculate': return '📊';
      default: return '🤖';
    }
  };

  return (
    <ButtonEnhanced
      ref={ref}
      leftIcon={leftIcon || getAIIcon()}
      confidence={confidence}
      hapticFeedback={true}
      {...props}
    >
      {children}
    </ButtonEnhanced>
  );
});

AIActionButton.displayName = "AIActionButton";

// Button Group for related actions
export function ButtonGroup({
  children,
  className,
  variant = 'secondary',
  size = 'default'
}: {
  children: React.ReactNode;
  className?: string;
  variant?: ButtonEnhancedProps['variant'];
  size?: ButtonEnhancedProps['size'];
}) {
  return (
    <div
      className={cn(
        "inline-flex rounded-lg overflow-hidden border border-gray-300",
        "shadow-card hover:shadow-card-hover transition-shadow duration-200",
        className
      )}
      role="group"
    >
      {React.Children.map(children, (child, index) => {
        if (React.isValidElement(child)) {
          return React.cloneElement(child as any, {
            className: cn(
              child.props.className,
              "rounded-none border-0",
              index > 0 && "border-l border-gray-300"
            ),
            variant: child.props.variant || variant,
            size: child.props.size || size,
          });
        }
        return child;
      })}
    </div>
  );
}

export { ButtonEnhanced, buttonEnhancedVariants };
export default ButtonEnhanced;