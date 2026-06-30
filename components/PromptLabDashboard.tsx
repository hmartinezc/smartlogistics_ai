import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BrainCircuit,
  CheckCircle,
  Loader2,
  RefreshCw,
  Save,
  Trash2,
  Upload,
  Zap,
} from './Icons';
import PageHeader from './PageHeader';
import { AnalysisPanel, Metric, Panel } from './PromptLabAnalysisPanel';
import PromptLabCaseList from './PromptLabCaseList';
import { api } from '../services/apiClient';
import type { Agency, AgentType, PromptLabAnalysis, PromptLabCase } from '../types';

interface PromptLabDashboardProps {
  agencies: Agency[];
}

type Notice = { text: string; type: 'error' | 'info' | 'success' } | null;

const DEFAULT_FORMAT: AgentType = 'AGENT_GENERIC_A';

function formatNumber(value: number | undefined | null): string {
  return new Intl.NumberFormat('es-EC').format(value || 0);
}

function formatUsd(value: number | undefined | null): string {
  return new Intl.NumberFormat('en-US', {
    currency: 'USD',
    maximumFractionDigits: 4,
    style: 'currency',
  }).format(value || 0);
}

export default function PromptLabDashboard({ agencies }: PromptLabDashboardProps) {
  const [agencyId, setAgencyId] = useState(() => agencies[0]?.id || '');
  const [cases, setCases] = useState<PromptLabCase[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{
    analyses: PromptLabAnalysis[];
    case: PromptLabCase;
  } | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [expectedJson, setExpectedJson] = useState('');
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [isLoadingCases, setIsLoadingCases] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSavingExpected, setIsSavingExpected] = useState(false);
  const [isDeletingPdf, setIsDeletingPdf] = useState(false);
  const [isCaseListCollapsed, setIsCaseListCollapsed] = useState(true);

  const selectedCase = detail?.case || cases.find((item) => item.id === selectedCaseId) || null;
  const latestAnalysis = detail?.analyses[0] || null;
  const caseListColumnClasses = isCaseListCollapsed
    ? 'xl:grid-cols-[88px_minmax(0,1fr)]'
    : 'xl:grid-cols-[390px_minmax(0,1fr)]';

  const selectedAgency = useMemo(
    () => agencies.find((agency) => agency.id === agencyId) || null,
    [agencies, agencyId],
  );

  const loadCases = useCallback(async () => {
    setIsLoadingCases(true);
    setNotice(null);
    try {
      const response = await api.getPromptLabCases({ agencyId, limit: 40 });
      setCases(response.cases);
      setSelectedCaseId((current) => current || response.cases[0]?.id || null);
    } catch (error) {
      setNotice({
        text: error instanceof Error ? error.message : 'No se pudieron cargar los casos.',
        type: 'error',
      });
    } finally {
      setIsLoadingCases(false);
    }
  }, [agencyId]);

  const loadDetail = useCallback(async (caseId: string) => {
    setIsLoadingDetail(true);
    try {
      const response = await api.getPromptLabCase(caseId);
      setDetail(response);
      setAdminNotes(response.case.adminNotes || '');
      setExpectedJson(response.case.expectedJson || '');
    } catch (error) {
      setNotice({
        text: error instanceof Error ? error.message : 'No se pudo cargar el caso.',
        type: 'error',
      });
    } finally {
      setIsLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    if (!agencyId && agencies[0]) {
      setAgencyId(agencies[0].id);
    }
  }, [agencies, agencyId]);

  useEffect(() => {
    void loadCases();
  }, [loadCases]);

  useEffect(() => {
    if (!selectedCaseId) {
      setDetail(null);
      return;
    }
    void loadDetail(selectedCaseId);
  }, [selectedCaseId, loadDetail]);

  useEffect(() => {
    let revokedUrl: string | null = null;
    setPdfUrl(null);

    if (!detail?.case.objectKey || detail.case.pdfDeletedAt) {
      return;
    }

    api
      .getPromptLabCasePdfBlobUrl(detail.case.id)
      .then((url) => {
        revokedUrl = url;
        setPdfUrl(url);
      })
      .catch(() => setPdfUrl(null));

    return () => {
      if (revokedUrl) {
        URL.revokeObjectURL(revokedUrl);
      }
    };
  }, [detail?.case.id, detail?.case.objectKey, detail?.case.pdfDeletedAt]);

  async function createCase() {
    if (!agencyId || !selectedAgency) {
      setNotice({ text: 'Selecciona una agencia específica.', type: 'error' });
      return;
    }
    if (!file) {
      setNotice({ text: 'Selecciona un PDF para analizar.', type: 'error' });
      return;
    }

    setIsCreating(true);
    setNotice(null);
    try {
      const response = await api.createPromptLabCase({
        agencyId,
        adminNotes,
        expectedJson,
        file,
        format: DEFAULT_FORMAT,
      });
      setDetail(response);
      setSelectedCaseId(response.case.id);
      setFile(null);
      setNotice({ text: 'Caso de Prompt Lab AI creado.', type: 'success' });
      await loadCases();
    } catch (error) {
      setNotice({
        text: error instanceof Error ? error.message : 'No se pudo crear el caso.',
        type: 'error',
      });
    } finally {
      setIsCreating(false);
    }
  }

  async function saveExpected() {
    if (!selectedCase) return;

    setIsSavingExpected(true);
    setNotice(null);
    try {
      const response = await api.updatePromptLabExpected({
        adminNotes,
        expectedJson,
        id: selectedCase.id,
      });
      setDetail(response);
      setNotice({ text: 'Notas y verdad esperada guardadas.', type: 'success' });
      await loadCases();
    } catch (error) {
      setNotice({
        text: error instanceof Error ? error.message : 'No se pudo guardar la referencia.',
        type: 'error',
      });
    } finally {
      setIsSavingExpected(false);
    }
  }

  async function analyzeCase() {
    if (!selectedCase) return;

    setIsAnalyzing(true);
    setNotice(null);
    try {
      const response = await api.analyzePromptLabCase(selectedCase.id);
      setDetail(response);
      setNotice({ text: 'Análisis de Prompt Lab AI generado.', type: 'success' });
      await loadCases();
    } catch (error) {
      setNotice({
        text: error instanceof Error ? error.message : 'No se pudo analizar el caso.',
        type: 'error',
      });
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function deletePdf() {
    if (!selectedCase) return;
    const ok = window.confirm('Eliminar solo el PDF guardado de este caso?');
    if (!ok) return;

    setIsDeletingPdf(true);
    setNotice(null);
    try {
      const response = await api.deletePromptLabCasePdf(selectedCase.id);
      setDetail(response);
      setNotice({ text: 'PDF eliminado; el análisis se conserva.', type: 'success' });
      await loadCases();
    } catch (error) {
      setNotice({
        text: error instanceof Error ? error.message : 'No se pudo eliminar el PDF.',
        type: 'error',
      });
    } finally {
      setIsDeletingPdf(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1600px] p-6 lg:p-8">
      <PageHeader
        badge="Laboratorio IA"
        icon={<BrainCircuit className="h-3.5 w-3.5" />}
        subtitle="Diagnóstico guardado para validar clasificador, extractor y futuras propuestas de aprendizaje guiado."
        title="Prompt Lab AI"
      >
        <button
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          disabled={isLoadingCases}
          onClick={loadCases}
          type="button"
        >
          <RefreshCw className={`h-4 w-4 ${isLoadingCases ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
        <button
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-indigo-500/20 transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isCreating || !file || !agencyId}
          onClick={createCase}
          type="button"
        >
          {isCreating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          Crear caso
        </button>
      </PageHeader>

      <section className="mb-5 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="grid gap-3 lg:grid-cols-[280px_minmax(260px,1fr)_1.3fr]">
          <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Agencia
            </span>
            <select
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-indigo-500/20"
              onChange={(event) => {
                setAgencyId(event.target.value);
                setSelectedCaseId(null);
              }}
              value={agencyId}
            >
              {agencies.map((agency) => (
                <option key={agency.id} value={agency.id}>
                  {agency.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              PDF
            </span>
            <input
              accept="application/pdf,.pdf"
              className="block w-full cursor-pointer rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 file:mr-3 file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-bold file:text-slate-700 hover:file:bg-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:file:bg-slate-800 dark:file:text-slate-200"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
              type="file"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Notas humanas
            </span>
            <input
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-indigo-500/20"
              onChange={(event) => setAdminNotes(event.target.value)}
              placeholder="Correcciones, sospecha o contexto del formato"
              value={adminNotes}
            />
          </label>
        </div>
      </section>

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

      <div className={`grid gap-5 ${caseListColumnClasses}`}>
        <PromptLabCaseList
          cases={cases}
          isCollapsed={isCaseListCollapsed}
          isLoading={isLoadingCases}
          onSelect={setSelectedCaseId}
          onToggleCollapsed={() => setIsCaseListCollapsed((current) => !current)}
          selectedCaseId={selectedCaseId}
        />

        <section className="min-w-0 rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 dark:border-slate-800 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-900 dark:text-white">
                {selectedCase?.originalFileName || 'Selecciona un caso'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {selectedCase
                  ? `${selectedCase.extractionFormat} · ${selectedCase.agencyName || selectedCase.agencyId}`
                  : 'Sin caso activo'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                disabled={!selectedCase || isSavingExpected}
                onClick={saveExpected}
                type="button"
              >
                {isSavingExpected ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Guardar referencia
              </button>
              <button
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                disabled={!selectedCase || isAnalyzing || Boolean(selectedCase.pdfDeletedAt)}
                onClick={analyzeCase}
                type="button"
              >
                {isAnalyzing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Zap className="h-4 w-4" />
                )}
                Ejecutar validador
              </button>
              <button
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200"
                disabled={!selectedCase || isDeletingPdf || Boolean(selectedCase.pdfDeletedAt)}
                onClick={deletePdf}
                type="button"
              >
                {isDeletingPdf ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                Borrar PDF
              </button>
            </div>
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
            <div className="grid min-h-[680px] gap-0 2xl:grid-cols-[minmax(0,1fr)_minmax(430px,0.9fr)]">
              <div className="min-h-[560px] border-b border-slate-100 bg-slate-100 dark:border-slate-800 dark:bg-slate-950 2xl:border-b-0 2xl:border-r">
                {pdfUrl ? (
                  <iframe
                    className="h-full min-h-[680px] w-full"
                    src={pdfUrl}
                    title="PDF Prompt Lab"
                  />
                ) : (
                  <div className="flex h-full min-h-[560px] items-center justify-center text-sm text-slate-500">
                    PDF no disponible.
                  </div>
                )}
              </div>

              <div className="max-h-[820px] overflow-y-auto p-4">
                <div className="mb-4 grid grid-cols-3 gap-2">
                  <Metric label="Input" value={formatNumber(latestAnalysis?.inputTokens)} />
                  <Metric label="Output" value={formatNumber(latestAnalysis?.outputTokens)} />
                  <Metric label="Costo" value={formatUsd(latestAnalysis?.estimatedCostUsd)} />
                </div>

                <Panel title="Verdad esperada">
                  <textarea
                    className="min-h-[120px] w-full rounded-lg border border-slate-200 bg-white p-3 font-mono text-xs text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-indigo-500/20"
                    onChange={(event) => setExpectedJson(event.target.value)}
                    placeholder='{"invoiceNumber":"...","totalValue":0}'
                    value={expectedJson}
                  />
                </Panel>

                {selectedCase.analysisError && (
                  <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                    {selectedCase.analysisError}
                  </div>
                )}

                {latestAnalysis ? (
                  <AnalysisPanel analysis={latestAnalysis} />
                ) : (
                  <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                    Ejecuta el validador para generar diagnóstico.
                  </div>
                )}

                {latestAnalysis?.promptSnapshots?.length ? (
                  <Panel title="Prompts usados">
                    <div className="space-y-3">
                      {latestAnalysis.promptSnapshots.map((snapshot) => (
                        <details
                          className="rounded-md border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950"
                          key={snapshot.id}
                        >
                          <summary className="cursor-pointer text-xs font-bold text-slate-800 dark:text-slate-100">
                            {snapshot.promptKind} · {snapshot.routerCategory || 'sin categoría'} ·{' '}
                            {snapshot.promptHash}
                          </summary>
                          <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap text-[11px] leading-5 text-slate-600 dark:text-slate-300">
                            {snapshot.promptText}
                          </pre>
                        </details>
                      ))}
                    </div>
                  </Panel>
                ) : null}

                {latestAnalysis?.extraction ? (
                  <Panel title="JSON extraído">
                    <pre className="max-h-96 overflow-auto rounded-md bg-slate-950 p-3 text-[11px] leading-5 text-slate-100">
                      {JSON.stringify(latestAnalysis.extraction, null, 2)}
                    </pre>
                  </Panel>
                ) : null}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
