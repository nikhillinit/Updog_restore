import React from 'react';
interface CardProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  className?: string;
  footer?: React.ReactNode;
  elevated?: boolean;
  bordered?: boolean;
}
export const Card = ({
  children,
  title,
  subtitle,
  className = '',
  footer,
  elevated = false,
  bordered = true
}: CardProps) => {
  return <div className={`
        bg-white rounded-lg overflow-hidden
        ${elevated ? 'shadow-elevated' : 'shadow-card'}
        ${bordered ? 'border border-lightGray' : ''}
        ${className}
      `}>
      {(title || subtitle) && <div className="p-5 border-b border-lightGray">
          {title && <h3 className="text-lg font-inter font-bold text-charcoal">
              {title}
            </h3>}
          {subtitle && <p className="mt-1 text-sm text-charcoal/70">{subtitle}</p>}
        </div>}
      <div className="p-5">{children}</div>
      {footer && <div className="p-4 bg-lightGray border-t border-lightGray">
          {footer}
        </div>}
    </div>;
};