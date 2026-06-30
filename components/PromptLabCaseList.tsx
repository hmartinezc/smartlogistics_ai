import React from 'react';
import { ChevronLeft, ChevronRight, FileText, Loader2 } from './Icons';
import type { PromptLabCase } from '../types';

interface PromptLabCaseListProps {
  cases: PromptLabCase[];
  isCollapsed: boolean;
  isLoading: boolean;
  onSelect: (caseId: string) => void;
  onToggleCollapsed: () => void;
  selectedCaseId: string | null;
}

function formatDate(value?: string | null): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('es-EC', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  });
}

function formatNumber(value: number | undefined | null): string {
  return new Intl.NumberFormat('es-EC').format(value || 0);
}

function getStatusClasses(status: string): string {
  if (status === 'ANALYZED') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200';
  }
  if (status === 'ANALYSIS_ERROR') {
    return 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200';
  }
  return 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300';
}

function getStatusDotClasses(status: string): string {
  if (status === 'ANALYZED') return 'bg-emerald-500';
  if (status === 'ANALYSIS_ERROR') return 'bg-red-500';
  return 'bg-slate-400 dark:bg-slate-500';
}

export default function PromptLabCaseList({
  cases,
  isCollapsed,
  isLoading,
  onSelect,
  onToggleCollapsed,
  selectedCaseId,
}: PromptLabCaseListProps) {
  const expandedList = (
    <>
      <div className="border-b border-slate-100 p-4 dark:border-slate-800">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-slate-900 dark:text-white">Casos guardados</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {isLoading ? 'Cargando...' : `${cases.length} caso(s)`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-indigo-500" /> : null}
            <button
              aria-expanded={!isCollapsed}
              aria-label="Colapsar casos guardados"
              className="hidden h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 xl:inline-flex"
              onClick={onToggleCollapsed}
              title="Colapsar casos guardados"
              type="button"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
      <div className="max-h-[760px] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
        {cases.length === 0 ? (
          <div className="p-6 text-sm text-slate-500 dark:text-slate-400">
            No hay casos de Prompt Lab para esta agencia.
          </div>
        ) : (
          cases.map((item) => (
            <button
              className={`w-full p-4 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60 ${
                selectedCaseId === item.id ? 'bg-indigo-50/70 dark:bg-indigo-500/10' : ''
              }`}
              key={item.id}
              onClick={() => onSelect(item.id)}
              type="button"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900 dark:text-white">
                    {item.originalFileName}
                  </p>
                  <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                    {item.agencyName || item.agencyId} · {formatDate(item.createdAt)}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-bold ${getStatusClasses(
                    item.status,
                  )}`}
                >
                  {item.status}
                </span>
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <FileText className="h-3.5 w-3.5" />
                {item.pdfDeletedAt ? 'PDF eliminado' : `${formatNumber(item.fileSizeBytes)} bytes`}
              </div>
            </button>
          ))
        )}
      </div>
    </>
  );

  const collapsedList = (
    <div className="hidden xl:block">
      <div className="border-b border-slate-100 p-2 dark:border-slate-800">
        <button
          aria-expanded={false}
          aria-label="Expandir casos guardados"
          className="flex h-10 w-full items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          onClick={onToggleCollapsed}
          title="Expandir casos guardados"
          type="button"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <p className="mt-2 text-center text-[11px] font-bold text-slate-500 dark:text-slate-400">
          {isLoading ? '...' : cases.length}
        </p>
      </div>
      <div className="max-h-[760px] space-y-2 overflow-y-auto p-2">
        {cases.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-400 dark:text-slate-500">0</div>
        ) : (
          cases.map((item) => (
            <button
              aria-label={`Seleccionar caso ${item.originalFileName}`}
              className={`relative flex h-12 w-full items-center justify-center rounded-lg border transition-colors ${
                selectedCaseId === item.id
                  ? 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200'
                  : 'border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-200'
              }`}
              key={item.id}
              onClick={() => onSelect(item.id)}
              title={item.originalFileName}
              type="button"
            >
              <FileText className="h-4 w-4" />
              <span
                className={`absolute right-2 top-2 h-2 w-2 rounded-full ${getStatusDotClasses(
                  item.status,
                )}`}
              />
            </button>
          ))
        )}
      </div>
    </div>
  );

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      {isCollapsed ? (
        <>
          {collapsedList}
          <div className="xl:hidden">{expandedList}</div>
        </>
      ) : (
        expandedList
      )}
    </section>
  );
}
