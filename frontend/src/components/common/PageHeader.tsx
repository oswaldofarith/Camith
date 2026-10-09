import type React from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  children?: React.ReactNode; // Botones de acción
}

export function PageHeader({ title, description, children }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-3 border-b pb-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-primary text-2xl font-semibold md:text-3xl">{title}</h1>
        {description && <p className="text-muted-foreground mt-1 text-sm">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
