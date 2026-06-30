import React from 'react';
import { Search } from './Icons';
import type { PromptLabAnalysis } from '../types';

function getVerdictClasses(verdict?: string): string {
  if (verdict === 'OK') return 'text-emerald-700 dark:text-emerald-300';
  if (verdict === 'NEW_CATEGORY_SUGGESTED') return 'text-purple-700 dark:text-purple-300';
  if (verdict === 'PROMPT_IMPROVEMENT_SUGGESTED') return 'text-indigo-700 dark:text-indigo-300';
  return 'text-amber-700 dark:text-amber-300';
}

export function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{value}</p>
    </div>
  );
}

export function Panel({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white">
        <Search className="h-4 w-4 text-indigo-500" />
        {title}
      </div>
      {children}
    </div>
  );
}

export function AnalysisPanel({ analysis }: { analysis: PromptLabAnalysis }) {
  const payload = analysis.analysis;
  const patch = analysis.patchProposal || payload?.patchProposal;
  return (
    <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`text-sm font-black ${getVerdictClasses(analysis.verdict)}`}>
            {analysis.verdict}
          </p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {payload?.summary || 'Análisis generado.'}
          </p>
        </div>
        <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200">
          {analysis.confidenceScore ?? '-'}%
        </span>
      </div>

      <FindingList items={payload?.fieldFindings || []} title="Hallazgos por campo" />
      <RecommendationList items={payload?.classifierRecommendations || []} title="Clasificador" />
      <RecommendationList items={payload?.extractorRecommendations || []} title="Extractor" />

      {payload?.newCategoryRecommendation?.needed && (
        <div className="mt-3 rounded-md border border-purple-100 bg-white p-3 text-xs dark:border-purple-500/20 dark:bg-slate-900">
          <p className="font-bold text-purple-700 dark:text-purple-300">
            Nueva categoría sugerida:{' '}
            {payload.newCategoryRecommendation.suggestedName || 'por definir'}
          </p>
          <p className="mt-1 text-slate-600 dark:text-slate-300">
            {(payload.newCategoryRecommendation.visualSignals || []).join(' · ')}
          </p>
        </div>
      )}

      <TextList items={payload?.schemaOrCodeRecommendations || []} title="Schema o código" />
      <TextList
        items={payload?.deterministicRuleRecommendations || []}
        title="Reglas determinísticas"
      />
      <TextList items={payload?.costNotes || []} title="Costo" />
      <TextList items={payload?.validationPlan || []} title="Plan de validación" />

      {patch && (
        <div className="mt-3 rounded-md border border-indigo-100 bg-white p-3 text-xs dark:border-indigo-500/20 dark:bg-slate-900">
          <p className="font-bold text-slate-800 dark:text-slate-100">
            Propuesta V2 · {patch.type || 'NONE'} · {patch.target || 'sin target'}
          </p>
          {patch.rationale && (
            <p className="mt-1 text-slate-600 dark:text-slate-300">{patch.rationale}</p>
          )}
          {patch.proposedDiff && (
            <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded bg-slate-950 p-3 text-[11px] leading-5 text-slate-100">
              {patch.proposedDiff}
            </pre>
          )}
          {patch.risk && (
            <p className="mt-2 text-amber-700 dark:text-amber-300">Riesgo: {patch.risk}</p>
          )}
        </div>
      )}
    </div>
  );
}

function FindingList({
  items,
  title,
}: {
  items: NonNullable<PromptLabAnalysis['analysis']>['fieldFindings'];
  title: string;
}) {
  if (!items || items.length === 0) return null;
  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {title}
      </p>
      {items.map((item, index) => (
        <div
          className="rounded-md border border-amber-100 bg-white p-3 text-xs dark:border-amber-500/20 dark:bg-slate-900"
          key={`${item.field || 'field'}-${index}`}
        >
          <p className="font-bold text-slate-800 dark:text-slate-100">
            {item.field || 'Campo'} · {item.severity || 'MEDIUM'}
          </p>
          <p className="mt-1 text-slate-600 dark:text-slate-300">{item.reason}</p>
        </div>
      ))}
    </div>
  );
}

function RecommendationList({
  items,
  title,
}: {
  items: NonNullable<PromptLabAnalysis['analysis']>['classifierRecommendations'];
  title: string;
}) {
  if (!items || items.length === 0) return null;
  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {title}
      </p>
      {items.map((item, index) => (
        <div
          className="rounded-md border border-indigo-100 bg-white p-3 text-xs dark:border-indigo-500/20 dark:bg-slate-900"
          key={`${item.area || item.category || 'recommendation'}-${index}`}
        >
          <p className="font-bold text-slate-800 dark:text-slate-100">
            {item.category || item.area || 'Área'} · {item.costImpact || 'NEUTRAL'}
          </p>
          <p className="mt-1 text-slate-600 dark:text-slate-300">{item.recommendation}</p>
        </div>
      ))}
    </div>
  );
}

function TextList({ items, title }: { items: string[]; title: string }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {title}
      </p>
      <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
        {items.map((item, index) => (
          <li
            className="rounded-md border border-slate-100 bg-white p-2 dark:border-slate-800 dark:bg-slate-900"
            key={`${title}-${index}`}
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
