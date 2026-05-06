import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Agency,
  AgentType,
  DocumentJob,
  DocumentJobStatus,
  DocumentJobSummary,
  UserRole,
} from '../types';
import { api, ApiError } from '../services/apiClient';
import {
  AlertCircle,
  ArrowRight,
  BrainCircuit,
  CheckCircle,
  FileText,
  HardDrive,
  History,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
  Zap,
} from './Icons';
import DocumentStorageManager from './DocumentStorageManager';

interface DocumentProcessingWorkspaceProps {
  currentAgencyId: string;
  currentAgency?: Agency;
  userRole?: UserRole;
  onViewHistory: () => void;
  onResultsUpdated: () => Promise<void> | void;
  onConfirm: (message: string) => Promise<boolean>;
}

const MAX_FILES = 50;
const POLL_INTERVAL_MS = 3000;

const TERMINAL_STATUSES = new Set<DocumentJobStatus>(['SUCCESS', 'ERROR', 'CANCELLED']);
const QUEUEABLE_STATUSES = new Set<DocumentJobStatus>(['UPLOADED', 'ERROR']);

const AGENT_OPTIONS: Array<{ id: AgentType; label: string; caption: string }> = [
  { id: 'AGENT_GENERIC_A', label: 'Factura General', caption: 'Extracción completa de invoice' },
];

function buildEmptySummary(): DocumentJobSummary {
  return {
    UPLOADED: 0,
    QUEUED: 0,
    PROCESSING: 0,
    SUCCESS: 0,
    ERROR: 0,
    CANCELLED: 0,
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(value: string | null): string {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin fecha';
  return date.toLocaleString('es-MX', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getFileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function isPdf(file: File): boolean {
  return file.name.toLowerCase().endsWith('.pdf');
}

function getStatusMeta(status: DocumentJobStatus) {
  switch (status) {
    case 'UPLOADED':
      return {
        label: 'Cargado',
        icon: FileText,
        className:
          'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
      };
    case 'QUEUED':
      return {
        label: 'En cola',
        icon: Zap,
        className:
          'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200',
      };
    case 'PROCESSING':
      return {
        label: 'Procesando',
        icon: Loader2,
        className:
          'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-200',
      };
    case 'SUCCESS':
      return {
        label: 'Listo',
        icon: CheckCircle,
        className:
          'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200',
      };
    case 'ERROR':
      return {
        label: 'Error',
        icon: AlertCircle,
        className:
          'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200',
      };
    case 'CANCELLED':
      return {
        label: 'Cancelado',
        icon: AlertCircle,
        className:
          'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400',
      };
  }
}

const StatusBadge: React.FC<{ status: DocumentJobStatus }> = ({ status }) => {
  const meta = getStatusMeta(status);
  const Icon = meta.icon;

  return (
    <span
      className={`inline-flex min-w-[112px] items-center justify-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-bold ${meta.className}`}
    >
      <Icon className={`h-3.5 w-3.5 ${status === 'PROCESSING' ? 'animate-spin' : ''}`} />
      {meta.label}
    </span>
  );
};

const DocumentProcessingWorkspace: React.FC<DocumentProcessingWorkspaceProps> = ({
  currentAgencyId,
  currentAgency,
  userRole = 'OPERADOR',
  onViewHistory,
  onResultsUpdated,
  onConfirm,
}) => {
  const [workspaceView, setWorkspaceView] = useState<'process' | 'storage'>('process');
  const [selectedFormat, setSelectedFormat] = useState<AgentType>('AGENT_GENERIC_A');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [jobs, setJobs] = useState<DocumentJob[]>([]);
  const [uploadErrors, setUploadErrors] = useState<Array<{ fileName: string; error: string }>>([]);
  const [notice, setNotice] = useState<{ type: 'error' | 'success' | 'info'; text: string } | null>(
    null,
  );
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isQueueing, setIsQueueing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const currentAgencyIdRef = useRef(currentAgencyId);
  const completedBatchIdsRef = useRef<Set<string>>(new Set());
  const documentRequestIdRef = useRef(0);
  const pollingInFlightRef = useRef(false);

  const isAgencyReady = Boolean(currentAgencyId && currentAgencyId !== 'GLOBAL');

  const summary = useMemo(() => {
    const next = buildEmptySummary();
    jobs.forEach((job) => {
      next[job.status] += 1;
    });
    return next;
  }, [jobs]);

  const selectedTotalBytes = useMemo(
    () => selectedFiles.reduce((total, file) => total + file.size, 0),
    [selectedFiles],
  );

  const terminalCount = summary.SUCCESS + summary.ERROR + summary.CANCELLED;
  const activeCount = summary.QUEUED + summary.PROCESSING;
  const pendingCount = summary.UPLOADED + summary.QUEUED + summary.PROCESSING;
  const currentBatchPendingCount = pendingCount;
  const progress = jobs.length > 0 ? Math.round((terminalCount / jobs.length) * 100) : 0;
  const canSelectFiles =
    isAgencyReady &&
    !activeBatchId &&
    currentBatchPendingCount === 0 &&
    !isUploading &&
    !isQueueing;
  const canUpload = canSelectFiles && selectedFiles.length > 0;
  const canStartProcessing =
    isAgencyReady &&
    jobs.some((job) => QUEUEABLE_STATUSES.has(job.status)) &&
    !isUploading &&
    !isQueueing;
  const hasCurrentBatch = Boolean(activeBatchId && jobs.length > 0);
  const isBatchComplete = jobs.length > 0 && jobs.every((job) => TERMINAL_STATUSES.has(job.status));

  const setErrorNotice = useCallback((error: unknown, fallback: string) => {
    const text = error instanceof ApiError ? error.message : fallback;
    setNotice({ type: 'error', text });
  }, []);

  const loadDocuments = useCallback(
    async (options: { batchId: string | null; silent?: boolean }) => {
      const requestId = documentRequestIdRef.current + 1;
      documentRequestIdRef.current = requestId;

      if (!isAgencyReady) {
        setJobs([]);
        return;
      }

      const { batchId } = options;
      if (!options.silent) {
        setIsRefreshing(true);
      }

      try {
        const response = await api.getDocuments({
          agencyId: currentAgencyId,
          batchId: batchId || undefined,
          limit: batchId ? 200 : 30,
        });
        if (requestId !== documentRequestIdRef.current) {
          return;
        }

        let nextJobs = batchId ? response.jobs : [];
        if (!batchId) {
          const recoverableJob = response.jobs.find((job) => job.status === 'UPLOADED');
          if (recoverableJob) {
            const batchResponse = await api.getDocuments({
              agencyId: currentAgencyId,
              batchId: recoverableJob.batchId,
              limit: 200,
            });
            if (requestId !== documentRequestIdRef.current) {
              return;
            }
            setActiveBatchId(recoverableJob.batchId);
            nextJobs = batchResponse.jobs.filter((job) => job.status !== 'SUCCESS');
          }
        }

        setJobs(nextJobs);
        if (batchId && nextJobs.length === 0) {
          setActiveBatchId(null);
        }
      } catch (error) {
        if (requestId === documentRequestIdRef.current && !options.silent) {
          setErrorNotice(error, 'No se pudieron cargar los documentos.');
        }
      } finally {
        if (!options.silent) {
          setIsRefreshing(false);
        }
      }
    },
    [currentAgencyId, isAgencyReady, setErrorNotice],
  );

  useEffect(() => {
    currentAgencyIdRef.current = currentAgencyId;
    documentRequestIdRef.current += 1;
    pollingInFlightRef.current = false;
    setSelectedFiles([]);
    setActiveBatchId(null);
    setJobs([]);
    setUploadErrors([]);
    setNotice(null);

    if (isAgencyReady) {
      void loadDocuments({ batchId: null, silent: true });
    }
  }, [currentAgencyId, isAgencyReady, loadDocuments]);

  useEffect(() => {
    if (!isAgencyReady || activeCount === 0) {
      return;
    }

    const intervalId = window.setInterval(() => {
      if (pollingInFlightRef.current) {
        return;
      }

      pollingInFlightRef.current = true;
      void loadDocuments({ batchId: activeBatchId, silent: true }).finally(() => {
        pollingInFlightRef.current = false;
      });
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [activeBatchId, activeCount, isAgencyReady, loadDocuments]);

  useEffect(() => {
    if (!activeBatchId || !isBatchComplete || completedBatchIdsRef.current.has(activeBatchId)) {
      return;
    }

    completedBatchIdsRef.current.add(activeBatchId);
    void onResultsUpdated();
  }, [activeBatchId, isBatchComplete, onResultsUpdated]);

  const addFiles = (incomingFiles: File[]) => {
    if (!isAgencyReady) {
      setNotice({ type: 'error', text: 'Selecciona una agencia para cargar documentos.' });
      return;
    }

    if (activeBatchId || currentBatchPendingCount > 0) {
      setNotice({ type: 'info', text: 'Termina o limpia el lote actual antes de cargar otro.' });
      return;
    }

    const pdfFiles = incomingFiles.filter(isPdf);
    if (pdfFiles.length !== incomingFiles.length) {
      setNotice({ type: 'error', text: 'Solo se aceptan archivos PDF.' });
    } else {
      setNotice(null);
    }

    setSelectedFiles((current) => {
      const existingKeys = new Set(current.map(getFileKey));
      const next = [...current];

      for (const file of pdfFiles) {
        if (!existingKeys.has(getFileKey(file)) && next.length < MAX_FILES) {
          next.push(file);
          existingKeys.add(getFileKey(file));
        }
      }

      if (current.length + pdfFiles.length > MAX_FILES) {
        setNotice({ type: 'error', text: `Máximo ${MAX_FILES} PDFs por carga.` });
      }

      return next;
    });
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(event.target.files || []));
    event.target.value = '';
  };

  const handleDrop = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
    addFiles(Array.from(event.dataTransfer.files || []));
  };

  const removeSelectedFile = (fileToRemove: File) => {
    setSelectedFiles((current) =>
      current.filter((file) => getFileKey(file) !== getFileKey(fileToRemove)),
    );
  };

  const clearSelectedFiles = () => {
    setSelectedFiles([]);
    setUploadErrors([]);
    setNotice(null);
  };

  const handleUpload = async () => {
    if (!canUpload) return;

    const agencyIdAtStart = currentAgencyId;
    setIsUploading(true);
    setUploadErrors([]);
    setNotice(null);

    try {
      const response = await api.uploadDocuments({
        files: selectedFiles,
        agencyId: agencyIdAtStart,
        format: selectedFormat,
      });

      if (currentAgencyIdRef.current !== agencyIdAtStart) {
        return;
      }

      setActiveBatchId(response.batchId);
      setJobs(response.jobs);
      setUploadErrors(response.errors || []);
      setSelectedFiles([]);
      setNotice({ type: 'success', text: `${response.count} documentos cargados.` });
    } catch (error) {
      if (currentAgencyIdRef.current === agencyIdAtStart) {
        setErrorNotice(error, 'No se pudieron cargar los documentos.');
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleStartProcessing = async () => {
    const queueableJobIds = jobs
      .filter((job) => QUEUEABLE_STATUSES.has(job.status))
      .map((job) => job.id);
    if (!isAgencyReady || isUploading || isQueueing || queueableJobIds.length === 0) return;

    const agencyIdAtStart = currentAgencyId;
    const batchIdAtStart = activeBatchId;
    setIsQueueing(true);
    setNotice(null);

    try {
      const response = await api.processDocuments({
        ...(batchIdAtStart ? { batchId: batchIdAtStart } : { jobIds: queueableJobIds }),
        agencyId: agencyIdAtStart,
      });

      if (currentAgencyIdRef.current !== agencyIdAtStart) {
        return;
      }

      setJobs(response.jobs);
      setNotice({
        type: response.queuedCount > 0 ? 'success' : 'info',
        text:
          response.queuedCount > 0
            ? `${response.queuedCount} documentos enviados al worker.`
            : 'No hay documentos pendientes para enviar.',
      });
      void loadDocuments({ batchId: batchIdAtStart, silent: true });
    } catch (error) {
      if (currentAgencyIdRef.current === agencyIdAtStart) {
        setErrorNotice(error, 'No se pudo iniciar el procesamiento.');
      }
    } finally {
      setIsQueueing(false);
    }
  };

  const handleRetryErrors = async () => {
    const agencyIdAtStart = currentAgencyId;
    const errorJobIds = jobs
      .filter((job) => job.status === 'ERROR' && job.agencyId === agencyIdAtStart)
      .map((job) => job.id);
    if (!isAgencyReady || isUploading || errorJobIds.length === 0 || isQueueing) return;

    setIsQueueing(true);
    setNotice(null);

    try {
      const response = await api.processDocuments({
        jobIds: errorJobIds,
        agencyId: agencyIdAtStart,
      });

      if (currentAgencyIdRef.current !== agencyIdAtStart) {
        return;
      }

      setJobs(response.jobs);
      setNotice({ type: 'success', text: `${response.queuedCount} documentos reenviados.` });
    } catch (error) {
      if (currentAgencyIdRef.current === agencyIdAtStart) {
        setErrorNotice(error, 'No se pudieron reenviar los errores.');
      }
    } finally {
      setIsQueueing(false);
    }
  };

  const handleNewBatch = () => {
    if (isUploading || isQueueing || currentBatchPendingCount > 0) return;

    setActiveBatchId(null);
    setJobs([]);
    setSelectedFiles([]);
    setUploadErrors([]);
    setNotice(null);
    void loadDocuments({ batchId: null, silent: true });
  };

  const recentMode = !activeBatchId;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-6 lg:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-md border border-cyan-200 bg-cyan-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-700 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-200">
            <BrainCircuit className="h-3.5 w-3.5" />
            Agentes IA
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Procesamiento de facturas
          </h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {currentAgency?.name || 'Selecciona una agencia'}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void loadDocuments({ batchId: activeBatchId, silent: false })}
            disabled={!isAgencyReady || isRefreshing}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
          <button
            type="button"
            onClick={onViewHistory}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-cyan-500 dark:hover:bg-cyan-400"
          >
            <History className="h-4 w-4" />
            Historial
          </button>
        </div>
      </div>

      {!isAgencyReady && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm font-medium text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
          Selecciona una agencia específica para cargar y procesar facturas.
        </div>
      )}

      {notice && (
        <div
          className={`rounded-lg border p-4 text-sm font-medium ${
            notice.type === 'error'
              ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200'
              : notice.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200'
                : 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-200'
          }`}
        >
          {notice.text}
        </div>
      )}

      <div className="inline-flex rounded-md bg-slate-100 p-1 dark:bg-slate-800">
        <button
          type="button"
          onClick={() => setWorkspaceView('process')}
          className={`inline-flex h-10 items-center gap-2 rounded-md px-4 text-sm font-semibold transition-colors ${
            workspaceView === 'process'
              ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white'
              : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <BrainCircuit className="h-4 w-4" />
          Procesar
        </button>
        <button
          type="button"
          onClick={() => setWorkspaceView('storage')}
          className={`inline-flex h-10 items-center gap-2 rounded-md px-4 text-sm font-semibold transition-colors ${
            workspaceView === 'storage'
              ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white'
              : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <HardDrive className="h-4 w-4" />
          Almacenamiento
        </button>
      </div>

      {workspaceView === 'process' ? (
        <>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    Carga de PDFs
                  </h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {selectedFiles.length} seleccionados · {formatBytes(selectedTotalBytes)}
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-2 rounded-md bg-slate-100 p-1 dark:bg-slate-800">
                  {AGENT_OPTIONS.map((agent) => (
                    <button
                      key={agent.id}
                      type="button"
                      onClick={() => setSelectedFormat(agent.id)}
                      className={`h-11 rounded-md px-3 text-left text-xs transition-colors ${
                        selectedFormat === agent.id
                          ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white'
                          : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                      }`}
                    >
                      <span className="block font-bold leading-tight">{agent.label}</span>
                      <span className="block leading-tight">{agent.caption}</span>
                    </button>
                  ))}
                </div>
              </div>

              <label
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`flex min-h-[190px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors ${
                  isDragging
                    ? 'border-cyan-400 bg-cyan-50 dark:border-cyan-400 dark:bg-cyan-500/10'
                    : 'border-slate-200 bg-slate-50 hover:border-cyan-300 hover:bg-cyan-50/60 dark:border-slate-700 dark:bg-slate-950/40 dark:hover:border-cyan-500/50 dark:hover:bg-cyan-500/10'
                } ${!canSelectFiles ? 'pointer-events-none opacity-60' : ''}`}
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-md bg-white text-cyan-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-cyan-300 dark:ring-slate-700">
                  <Upload className="h-6 w-6" />
                </div>
                <div className="text-base font-bold text-slate-900 dark:text-white">
                  Seleccionar documentos
                </div>
                <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  PDF · máximo 50
                </div>
                <input
                  type="file"
                  multiple
                  accept=".pdf,application/pdf"
                  className="hidden"
                  onChange={handleInputChange}
                  disabled={!canSelectFiles}
                />
              </label>

              {selectedFiles.length > 0 && (
                <div className="mt-5 max-h-72 overflow-auto rounded-lg border border-slate-200 dark:border-slate-800">
                  {selectedFiles.map((file) => (
                    <div
                      key={getFileKey(file)}
                      className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0 dark:border-slate-800"
                    >
                      <div className="min-w-0 flex items-center gap-3">
                        <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                            {file.name}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {formatBytes(file.size)}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeSelectedFile(file)}
                        className="rounded-md p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-red-500 dark:hover:bg-slate-800"
                        aria-label="Quitar archivo"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {uploadErrors.length > 0 && (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-500/30 dark:bg-red-500/10">
                  {uploadErrors.map((error) => (
                    <p
                      key={`${error.fileName}-${error.error}`}
                      className="text-sm font-medium text-red-700 dark:text-red-200"
                    >
                      {error.fileName}: {error.error}
                    </p>
                  ))}
                </div>
              )}

              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={clearSelectedFiles}
                  disabled={selectedFiles.length === 0 || isUploading}
                  className="h-10 rounded-md border border-slate-200 px-4 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Limpiar
                </button>
                <button
                  type="button"
                  onClick={handleUpload}
                  disabled={!canUpload}
                  className="inline-flex h-10 items-center gap-2 rounded-md bg-cyan-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isUploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  Cargar documentos
                </button>
              </div>
            </section>

            <aside className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Lote actual</h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {activeBatchId ? activeBatchId : 'Sin lote activo'}
                  </p>
                </div>
                {activeCount > 0 && <Loader2 className="h-5 w-5 animate-spin text-cyan-600" />}
              </div>

              <div className="mb-5">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-semibold text-slate-600 dark:text-slate-300">Progreso</span>
                  <span className="font-bold text-slate-900 dark:text-white">{progress}%</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full bg-cyan-600 transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-950/50">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
                    Cargados
                  </p>
                  <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">
                    {summary.UPLOADED}
                  </p>
                </div>
                <div className="rounded-md bg-amber-50 p-3 dark:bg-amber-500/10">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-amber-600 dark:text-amber-200">
                    Cola
                  </p>
                  <p className="mt-1 text-2xl font-bold text-amber-700 dark:text-amber-100">
                    {summary.QUEUED}
                  </p>
                </div>
                <div className="rounded-md bg-cyan-50 p-3 dark:bg-cyan-500/10">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-cyan-600 dark:text-cyan-200">
                    Proceso
                  </p>
                  <p className="mt-1 text-2xl font-bold text-cyan-700 dark:text-cyan-100">
                    {summary.PROCESSING}
                  </p>
                </div>
                <div className="rounded-md bg-emerald-50 p-3 dark:bg-emerald-500/10">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-emerald-600 dark:text-emerald-200">
                    Listos
                  </p>
                  <p className="mt-1 text-2xl font-bold text-emerald-700 dark:text-emerald-100">
                    {summary.SUCCESS}
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-2">
                <button
                  type="button"
                  onClick={handleStartProcessing}
                  disabled={!canStartProcessing}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-cyan-500 dark:hover:bg-cyan-400"
                >
                  {isQueueing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowRight className="h-4 w-4" />
                  )}
                  Iniciar procesamiento
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleRetryErrors}
                    disabled={!isAgencyReady || isUploading || summary.ERROR === 0 || isQueueing}
                    className="h-10 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Reintentar errores
                  </button>
                  <button
                    type="button"
                    onClick={handleNewBatch}
                    disabled={isUploading || isQueueing || currentBatchPendingCount > 0}
                    className={`rounded-md border px-3 text-sm font-semibold transition-all ${
                      isBatchComplete && hasCurrentBatch
                        ? 'h-10 animate-glow-pulse border-indigo-400 bg-indigo-600 text-white hover:bg-indigo-700 dark:border-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-600'
                        : 'h-10 border-slate-200 text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800'
                    }`}
                  >
                    Nuevo lote
                  </button>
                </div>
              </div>
            </aside>
          </div>

          <section className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-2 border-b border-slate-200 p-5 dark:border-slate-800 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  {recentMode ? 'Documentos recientes' : 'Documentos del lote'}
                </h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {jobs.length} documentos · {terminalCount} terminados
                </p>
              </div>
              {isBatchComplete && hasCurrentBatch && (
                <span className="inline-flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-bold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
                  <CheckCircle className="h-4 w-4" />
                  Lote finalizado
                </span>
              )}
            </div>

            {jobs.length === 0 ? (
              <div className="flex min-h-[220px] flex-col items-center justify-center p-8 text-center">
                <FileText className="mb-3 h-10 w-10 text-slate-300 dark:text-slate-600" />
                <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                  Sin documentos
                </p>
              </div>
            ) : (
              <div className="max-h-[400px] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
                {jobs.map((job) => (
                  <div
                    key={job.id}
                    className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,1fr)_140px_120px] md:items-center"
                  >
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-3">
                        <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                        <p className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">
                          {job.originalFileName}
                        </p>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 pl-7 text-xs text-slate-500 dark:text-slate-400">
                        <span>{formatBytes(job.fileSizeBytes)}</span>
                        <span>{formatTime(job.processedAt || job.startedAt || job.createdAt)}</span>
                        {job.error && (
                          <span className="text-red-600 dark:text-red-300">{job.error}</span>
                        )}
                      </div>
                    </div>
                    <div className="md:justify-self-end">
                      <StatusBadge status={job.status} />
                    </div>
                    <div className="text-left text-xs font-semibold text-slate-500 dark:text-slate-400 md:text-right">
                      {job.retryCount > 0
                        ? `Intento ${job.retryCount + 1}/${job.maxRetries + 1}`
                        : 'Primer intento'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      ) : (
        <DocumentStorageManager
          currentAgencyId={currentAgencyId}
          isAdmin={userRole === 'ADMIN'}
          onConfirm={onConfirm}
          onDocumentsChanged={async () => {
            await loadDocuments({ batchId: activeBatchId, silent: true });
            await onResultsUpdated();
          }}
        />
      )}
    </div>
  );
};

export default DocumentProcessingWorkspace;
