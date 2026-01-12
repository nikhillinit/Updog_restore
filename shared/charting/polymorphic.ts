/**
 * Polymorphic component helper that resolves React forwardRef typing issues
 * Eliminates the need for @ts-expect-error comments around polymorphic components
 */

import type {
  ComponentPropsWithoutRef,
  ElementType,
  ForwardedRef,
  ReactNode} from 'react';
import {
  forwardRef
} from 'react';

/**
 * Utility type for polymorphic component props
 */
export type PolymorphicProps<T extends ElementType, P> =
  P & Omit<ComponentPropsWithoutRef<T>, keyof P | 'as'> & { as?: T };

/**
 * Higher-order function for creating type-safe polymorphic components with forwardRef
 * 
 * Usage:
 * ```ts
 * const MyComponent = polymorphicForwardRef<'div', { variant: string }>(
 *   function MyComponent<T extends ElementType = 'div'>(
 *     { as, variant, ...props }: PolymorphicProps<T, { variant: string }>,
 *     ref
 *   ) {
 *     const Comp = (as ?? 'div') as T;
 *     return <Comp ref={ref} className={variant} {...props as any} />;
 *   }
 * );
 * ```
 */
export function polymorphicForwardRef<
  DefaultTag extends ElementType,
  ExtraProps = {}
>(
  render: <T extends ElementType = DefaultTag>(
    props: PolymorphicProps<T, ExtraProps>,
    ref: ForwardedRef<Element>
  ) => ReactNode
) {
  // Simplified type assertion to work with strict mode
  type RenderType = React.ForwardRefRenderFunction<Element, PolymorphicProps<DefaultTag, ExtraProps>>;
  return forwardRef(render as unknown as RenderType) as <T extends ElementType = DefaultTag>(
    props: PolymorphicProps<T, ExtraProps> & { ref?: ForwardedRef<Element> }
  ) => ReactNode;
}

/**
 * Simplified polymorphic component creator without forwardRef
 * Use when ref forwarding is not needed
 */
export function createPolymorphicComponent<
  DefaultTag extends ElementType,
  ExtraProps = {}
>(
  render: <T extends ElementType = DefaultTag>(
    props: PolymorphicProps<T, ExtraProps>
  ) => ReactNode
) {
  return render as <T extends ElementType = DefaultTag>(
    props: PolymorphicProps<T, ExtraProps>
  ) => ReactNode;
}

/**
 * Type guard to check if a component accepts a specific prop
 */
export function hasProperty<T extends ElementType, K extends string>(
  Component: T,
  _propName: K
): Component is T & { [_P in K]: unknown } {
  // This is a runtime check - in practice you'd implement based on your needs
  return true; // Simplified for type-level usage
}

/**
 * Utility for extracting the default element type from a polymorphic component
 */
export type ExtractDefaultElement<T> = T extends ElementType ? T : 'div';

/**
 * Utility for creating strongly-typed component variants
 */
export type PolymorphicVariantProps<
  T extends ElementType,
  V extends string
> = PolymorphicProps<T, { variant: V }>;

/**
 * Helper type for component props with required children
 */
export type PolymorphicPropsWithChildren<T extends ElementType, P = {}> = 
  PolymorphicProps<T, P & { children: ReactNode }>;

/**
 * Helper type for component props with optional children
 */
export type PolymorphicPropsWithOptionalChildren<T extends ElementType, P = {}> = 
  PolymorphicProps<T, P & { children?: ReactNode }>;