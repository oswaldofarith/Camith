import type React from 'react';

interface PageHeaderProps {
  title: string;
  children?: React.ReactNode; // For action buttons or other elements
}

export function PageHeader({ title, children }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6 pb-2 border-b">
      <h1 className="text-3xl font-headline font-semibold text-primary">{title}</h1>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}
