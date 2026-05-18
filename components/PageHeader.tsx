import React from 'react';

interface PageHeaderProps {
  icon: React.ReactNode;
  badge: string;
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}

export default function PageHeader({ icon, badge, title, subtitle, children }: PageHeaderProps) {
  return (
    <div className="mb-8 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      <div className="min-w-0">
        <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">
          {icon}
          {badge}
        </div>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">{subtitle}</p>
        )}
      </div>
      {children && <div className="flex shrink-0 flex-wrap items-stretch gap-3">{children}</div>}
    </div>
  );
}
