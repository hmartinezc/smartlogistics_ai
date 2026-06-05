import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { Agency, AiReviewDetail, AiReviewItem, AiReviewRun } from '../types';
import { api, ApiError } from '../services/apiClient';
import PageHeader from './PageHeader';
import {
  AlertCircle,
  BrainCircuit,
  CheckCircle,
  Eye,
  FileText,
  Loader2,
  RefreshCw,
  Search,
  Zap,
} from './Icons';

interface AIReviewDashboardProps {
  agencies: Agency[];
}

function getTodayDateInput(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatNumber(value: number): string {
  return value.toLocaleString('es-MX');
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    currency: 'USD',
    maximumFractionDigits: 6,
    minimumFractionDigits: 6,
    style: 'currency',
  }).format(value);
}

function formatDate(value: string | null): string {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin fecha';
  return date.toLocaleString('es-MX', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  });
}

function getStatusClasses(status: string): string {
  switch (status) {
    case 'ANALYZED':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200';
    case 'ANALYSIS_ERROR':
      return 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200';
    default:
      return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200';
  }
}

function getVerdictClasses(verdict: string): string {
  switch (verdict) {
    case 'OK':
      return 'text-emerald-700 dark:text-emerald-300';
    case 'PROMPT_IMPROVEMENT_SUGGESTED':
      return 'text-indigo-700 dark:text-indigo-300';
    default:
      return 'text-amber-700 dark:text-amber-300';
  }
}

const AIReviewDashboard: React.FC<AIReviewDashboardProps> = ({ agencies }) => {
  const [reviewDate, setReviewDate] = useState(getTodayDateInput);
  const [agencyId, setAgencyId] = useState('GLOBAL');
  const [run, setRun] = useState<AiReviewRun | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AiReviewDetail | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'error' | 'success' | 'info'; text: string } | null>(
    null,
  );
  const [isLoadingRun, setIsLoadingRun] = useState(false);
  const [isCreatingRun, setIsCreatingRun] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const selectedItem = useMemo(
    () => run?.items.find((item) => item.id === selectedItemId) || null,
    [run?.items, selectedItemId],
  );
  const latestAnalysis = detail?.analyses[0] || null;

  const setErrorNotice = useCallback((error: unknown, fallback: string) => {
    setNotice({
      text: error instanceof ApiError ? error.message : fallback,
      type: 'error',
    });
  }, []);

  const loadLatestRun = useCallback(async () => {
    setIsLoadingRun(true);
    setNotice(null);
    try {
      const response = await api.getLatestAiReviewRun({
        agencyId,
        date: reviewDate,
      });
      setRun(response.run);
      setSelectedItemId(response.run?.items[0]?.id || null);
    } catch (error) {
      setErrorNotice(error, 'No se pudo cargar la carpeta de revisión.');
    } finally {
      setIsLoadingRun(false);
    }
  }, [agencyId, reviewDate, setErrorNotice]);

  useEffect(() => {
    void loadLatestRun();
  }, [loadLatestRun]);

  useEffect(() => {
    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [pdfUrl]);

  const loadDetail = useCallback(
    async (itemId: string) => {
      setIsLoadingDetail(true);
      setNotice(null);
      setDetail(null);
      setPdfUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });

      try {
        const loadedDetail = await api.getAiReviewItem(itemId);
        setDetail(loadedDetail);
        const nextPdfUrl = await api.getAiReviewItemPdfBlobUrl(loadedDetail.item.id);
        setPdfUrl(nextPdfUrl);
      } catch (error) {
        setErrorNotice(error, 'No se pudo cargar el detalle de revisión.');
      } finally {
        setIsLoadingDetail(false);
      }
    },
    [setErrorNotice],
  );

  useEffect(() => {
    if (selectedItemId) {
      void loadDetail(selectedItemId);
    } else {
      setDetail(null);
      setPdfUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });
    }
  }, [loadDetail, selectedItemId]);

  const createRun = async () => {
    setIsCreatingRun(true);
    setNotice(null);
    try {
      const response = await api.createAiReviewRun({
        agencyId,
        reviewDate,
      });
      setRun(response.run);
      setSelectedItemId(response.run?.items[0]?.id || null);
      setNotice({
        text:
          response.run && response.run.selectedCount > 0
            ? 'Muestra de AutoPilot AI creada.'
            : 'No hay facturas disponibles para esa fecha.',
        type: response.run && response.run.selectedCount > 0 ? 'success' : 'info',
      });
    } catch (error) {
      setErrorNotice(error, 'No se pudo crear la carpeta de revisión.');
    } finally {
      setIsCreatingRun(false);
    }
  };

  const analyzeSelectedItem = async () => {
    if (!selectedItemId) return;
    setIsAnalyzing(true);
    setNotice(null);
    try {
      const response = await api.analyzeAiReviewItem(selectedItemId);
      setDetail(response.detail);
      setRun((current) =>
        current
          ? {
              ...current,
              items: current.items.map((item) =>
                item.id === response.detail.item.id ? response.detail.item : item,
              ),
            }
          : current,
      );
      setNotice({ text: 'Análisis del agente revisor guardado.', type: 'success' });
    } catch (error) {
      setErrorNotice(error, 'No se pudo ejecutar el agente revisor.');
      void loadDetail(selectedItemId);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="min-h-full bg-slate-50 p-6 dark:bg-slate-900 lg:p-8">
      <PageHeader
        badge="Autoaprendizaje supervisado"
        icon={<BrainCircuit className="h-3.5 w-3.5" />}
        subtitle="Muestras manuales de alto consumo para que el sistema revise resultados, costos y mejoras futuras con aprobación humana."
        title="AutoPilot AI"
      >
        <button
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          disabled={isLoadingRun}
          onClick={loadLatestRun}
          type="button"
        >
          <RefreshCw className={`h-4 w-4 ${isLoadingRun ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
        <button
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-indigo-500/20 transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isCreatingRun}
          onClick={createRun}
          type="button"
        >
          {isCreatingRun ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          Validar facturas del día
        </button>
      </PageHeader>

      <div className="mb-5 grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:grid-cols-[180px_1fr] xl:grid-cols-[180px_320px_1fr]">
        <label className="block">
          <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Fecha
          </span>
          <input
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-indigo-500/20"
            onChange={(event) => setReviewDate(event.target.value)}
            type="date"
            value={reviewDate}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Agencia
          </span>
          <select
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-indigo-500/20"
            onChange={(event) => setAgencyId(event.target.value)}
            value={agencyId}
          >
            <option value="GLOBAL">Todas las agencias</option>
            {agencies.map((agency) => (
              <option key={agency.id} value={agency.id}>
                {agency.name}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3 md:col-span-2 xl:col-span-1">
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Tokens</p>
            <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
              {formatNumber(run?.totalTokens || 0)}
            </p>
          </div>
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Costo</p>
            <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
              {formatUsd(run?.totalEstimatedCostUsd || 0)}
            </p>
          </div>
        </div>
      </div>

      {notice && (
        <div
          className={`mb-5 flex items-center gap-2 rounded-lg border p-3 text-sm font-semibold ${
            notice.type === 'error'
              ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200'
              : notice.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200'
                : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200'
          }`}
        >
          {notice.type === 'error' ? (
            <AlertCircle className="h-4 w-4" />
          ) : (
            <CheckCircle className="h-4 w-4" />
          )}
          {notice.text}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[390px_minmax(0,1fr)]">
        <section className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-100 p-4 dark:border-slate-800">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  Muestra AutoPilot AI
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {run
                    ? `${run.selectedCount} documentos · ${formatDate(run.createdAt)}`
                    : 'Sin carpeta'}
                </p>
              </div>
              {isLoadingRun && <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />}
            </div>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {!run || run.items.length === 0 ? (
              <div className="p-6 text-sm text-slate-500 dark:text-slate-400">
                No hay documentos seleccionados.
              </div>
            ) : (
              run.items.map((item) => (
                <button
                  className={`w-full p-4 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60 ${
                    selectedItemId === item.id ? 'bg-indigo-50/70 dark:bg-indigo-500/10' : ''
                  }`}
                  key={item.id}
                  onClick={() => setSelectedItemId(item.id)}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-900 dark:text-white">
                        {item.originalFileName}
                      </p>
                      <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                        {item.agencyName || item.agencyId}
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
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <p className="font-semibold text-slate-400">Input</p>
                      <p className="font-bold text-slate-700 dark:text-slate-200">
                        {formatNumber(item.inputTokens)}
                      </p>
                    </div>
                    <div>
                      <p className="font-semibold text-slate-400">Output</p>
                      <p className="font-bold text-slate-700 dark:text-slate-200">
                        {formatNumber(item.outputTokens)}
                      </p>
                    </div>
                    <div>
                      <p className="font-semibold text-slate-400">Costo</p>
                      <p className="font-bold text-slate-700 dark:text-slate-200">
                        {formatUsd(item.estimatedCostUsd)}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="min-w-0 rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 dark:border-slate-800 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-900 dark:text-white">
                {selectedItem?.originalFileName || 'Selecciona una factura'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {selectedItem
                  ? `${selectedItem.extractionFormat} · ${selectedItem.modelSummary || 'modelo no registrado'}`
                  : 'Sin documento activo'}
              </p>
              {selectedItem?.reviewObjectKey && (
                <p className="mt-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                  PDF preservado en AutoPilot AI
                </p>
              )}
            </div>
            <button
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
              disabled={!selectedItemId || isAnalyzing || isLoadingDetail}
              onClick={analyzeSelectedItem}
              type="button"
            >
              {isAnalyzing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Zap className="h-4 w-4" />
              )}
              Ejecutar agente revisor
            </button>
          </div>

          {isLoadingDetail ? (
            <div className="flex h-[560px] items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            </div>
          ) : !detail ? (
            <div className="flex h-[560px] items-center justify-center text-sm text-slate-500 dark:text-slate-400">
              Sin detalle cargado.
            </div>
          ) : (
            <div className="grid min-h-[640px] gap-0 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
              <div className="min-h-[560px] border-b border-slate-100 bg-slate-100 dark:border-slate-800 dark:bg-slate-950 xl:border-b-0 xl:border-r">
                {pdfUrl ? (
                  <iframe
                    className="h-full min-h-[640px] w-full"
                    src={pdfUrl}
                    title="PDF factura"
                  />
                ) : (
                  <div className="flex h-full min-h-[560px] items-center justify-center text-sm text-slate-500">
                    PDF no disponible.
                  </div>
                )}
              </div>

              <div className="max-h-[760px] overflow-y-auto p-4">
                <div className="mb-4 grid grid-cols-3 gap-2">
                  <Metric label="Input" value={formatNumber(detail.item.inputTokens)} />
                  <Metric label="Output" value={formatNumber(detail.item.outputTokens)} />
                  <Metric label="Costo" value={formatUsd(detail.item.estimatedCostUsd)} />
                </div>

                {latestAnalysis && (
                  <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p
                          className={`text-sm font-black ${getVerdictClasses(
                            latestAnalysis.verdict,
                          )}`}
                        >
                          {latestAnalysis.verdict}
                        </p>
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                          {latestAnalysis.analysis?.summary || latestAnalysis.recommendationSummary}
                        </p>
                      </div>
                      <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200">
                        {latestAnalysis.status}
                      </span>
                    </div>
                    {latestAnalysis.analysis?.suspectedIssues &&
                      latestAnalysis.analysis.suspectedIssues.length > 0 && (
                        <div className="mt-3">
                          <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            Problemas del resultado
                          </p>
                          <div className="space-y-2">
                            {latestAnalysis.analysis.suspectedIssues.map((issue, index) => (
                              <div
                                className="rounded-md border border-amber-100 bg-white p-3 text-xs dark:border-amber-500/20 dark:bg-slate-900"
                                key={`${issue.field || 'issue'}-${index}`}
                              >
                                <p className="font-bold text-slate-800 dark:text-slate-100">
                                  {issue.field || 'Campo'} · {issue.severity || 'MEDIUM'}
                                </p>
                                <p className="mt-1 text-slate-600 dark:text-slate-300">
                                  {issue.reason}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    <ImprovementList
                      items={latestAnalysis.analysis?.extractorTechnicalImprovements || []}
                      title="Mejoras técnicas del extractor"
                    />
                    <ImprovementList
                      items={latestAnalysis.analysis?.classifierTechnicalImprovements || []}
                      title="Mejoras técnicas del clasificador"
                    />
                    <TextList
                      items={latestAnalysis.analysis?.costEfficiencyNotes || []}
                      title="Notas de costo y eficiencia"
                    />
                    <TextList
                      items={latestAnalysis.analysis?.costGuardrails || []}
                      title="Guardrails de costo"
                    />
                    {latestAnalysis.analysis?.promptRecommendations &&
                      latestAnalysis.analysis.promptRecommendations.length > 0 && (
                        <div className="mt-3 space-y-2">
                          <p className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            Recomendaciones de prompt
                          </p>
                          {latestAnalysis.analysis.promptRecommendations.map((rec, index) => (
                            <div
                              className="rounded-md border border-indigo-100 bg-white p-3 text-xs dark:border-indigo-500/20 dark:bg-slate-900"
                              key={`${rec.promptHash || 'recommendation'}-${index}`}
                            >
                              <p className="font-bold text-slate-800 dark:text-slate-100">
                                {rec.target || 'prompt'} · {rec.promptHash || 'sin hash'}
                              </p>
                              <p className="mt-1 text-slate-600 dark:text-slate-300">
                                {rec.recommendation}
                              </p>
                              {rec.risk && (
                                <p className="mt-1 text-amber-700 dark:text-amber-300">
                                  Riesgo: {rec.risk}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    <TextList
                      items={latestAnalysis.analysis?.validationPlan || []}
                      title="Plan de validación"
                    />
                  </div>
                )}

                <Panel title="Eventos Gemini">
                  <div className="space-y-2">
                    {detail.events.map((event) => (
                      <div
                        className="rounded-md border border-slate-100 bg-slate-50 p-3 text-xs dark:border-slate-800 dark:bg-slate-950"
                        key={event.id}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-bold text-slate-800 dark:text-slate-100">
                            {event.stage || event.cacheMode}
                          </p>
                          <span className={event.success ? 'text-emerald-600' : 'text-red-600'}>
                            {event.success ? 'OK' : 'ERROR'}
                          </span>
                        </div>
                        <p className="mt-1 text-slate-500 dark:text-slate-400">
                          {event.model} · hash {event.promptHash}
                        </p>
                        <p className="mt-1 text-slate-600 dark:text-slate-300">
                          in {formatNumber(event.inputTokenCount)} · out{' '}
                          {formatNumber(event.outputTokenCount)} ·{' '}
                          {formatUsd(event.estimatedCostUsd)}
                        </p>
                      </div>
                    ))}
                  </div>
                </Panel>

                <Panel title="Prompts">
                  <div className="space-y-3">
                    {detail.promptSnapshots.map((snapshot) => (
                      <details
                        className="rounded-md border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950"
                        key={snapshot.id}
                      >
                        <summary className="cursor-pointer text-xs font-bold text-slate-800 dark:text-slate-100">
                          {snapshot.promptKind} · {snapshot.promptHash}
                        </summary>
                        <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-white p-3 text-[11px] leading-5 text-slate-700 dark:bg-slate-900 dark:text-slate-200">
                          {snapshot.promptText}
                        </pre>
                      </details>
                    ))}
                    {detail.promptSnapshots.length === 0 && (
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        No hay snapshots disponibles.
                      </p>
                    )}
                  </div>
                </Panel>

                <Panel title="Resultado extraído">
                  <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-slate-950 p-3 text-[11px] leading-5 text-slate-100">
                    {JSON.stringify(detail.invoiceResult, null, 2)}
                  </pre>
                </Panel>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 truncate text-sm font-black text-slate-900 dark:text-white">{value}</p>
    </div>
  );
}

function ImprovementList({
  items,
  title,
}: {
  items: Array<{
    area?: string;
    costImpact?: string;
    expectedImpact?: string;
    recommendation?: string;
  }>;
  title: string;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="mt-3">
      <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {title}
      </p>
      <div className="space-y-2">
        {items.map((item, index) => (
          <div
            className="rounded-md border border-slate-100 bg-white p-3 text-xs dark:border-slate-800 dark:bg-slate-900"
            key={`${item.area || title}-${index}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-bold text-slate-800 dark:text-slate-100">
                {item.area || 'Área técnica'}
              </p>
              {item.costImpact && (
                <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-black text-slate-500 dark:border-slate-700 dark:text-slate-300">
                  costo {item.costImpact}
                </span>
              )}
            </div>
            <p className="mt-1 text-slate-600 dark:text-slate-300">{item.recommendation}</p>
            {item.expectedImpact && (
              <p className="mt-1 text-indigo-700 dark:text-indigo-300">
                Impacto esperado: {item.expectedImpact}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function TextList({ items, title }: { items: string[]; title: string }) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="mt-3">
      <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {title}
      </p>
      <ul className="space-y-1 rounded-md border border-slate-100 bg-white p-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
        {items.map((item, index) => (
          <li key={`${title}-${index}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function Panel({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section className="mb-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white">
        {title === 'Resultado extraído' ? (
          <FileText className="h-4 w-4 text-indigo-500" />
        ) : title === 'Prompts' ? (
          <Eye className="h-4 w-4 text-indigo-500" />
        ) : (
          <BrainCircuit className="h-4 w-4 text-indigo-500" />
        )}
        {title}
      </div>
      {children}
    </section>
  );
}

export default AIReviewDashboard;
