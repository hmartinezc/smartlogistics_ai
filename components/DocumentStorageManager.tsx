import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DocumentJob, DocumentJobStatus } from '../types';
import { api, ApiError } from '../services/apiClient';
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  FileText,
  HardDrive,
  Loader2,
  Lock,
  RefreshCw,
  Trash2,
} from './Icons';

interface DocumentStorageManagerProps {
  currentAgencyId: string;
  isAdmin: boolean;
  onConfirm: (message: string) => Promise<boolean>;
  onDocumentsChanged: () => Promise<void> | void;
}

const PAGE_SIZE_OPTIONS = [10, 15, 25, 50] as const;
const DEFAULT_PAGE_SIZE = 10;

const DELETABLE_STATUSES = new Set<DocumentJobStatus>([
  'UPLOADED',
  'SUCCESS',
  'ERROR',
  'CANCELLED',
]);
const STATUS_FILTERS: Array<{ value: 'ALL' | DocumentJobStatus; label: string }> = [
  { value: 'ALL', label: 'Todos' },
  { value: 'UPLOADED', label: 'Cargados' },
  { value: 'QUEUED', label: 'En cola' },
  { value: 'PROCESSING', label: 'Procesando' },
  { value: 'SUCCESS', label: 'Listos' },
  { value: 'ERROR', label: 'Errores' },
  { value: 'CANCELLED', label: 'Cancelados' },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string | null): string {
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

function getTodayDateInput(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getStatusLabel(status: DocumentJobStatus): string {
  switch (status) {
    case 'UPLOADED':
      return 'Cargado';
    case 'QUEUED':
      return 'En cola';
    case 'PROCESSING':
      return 'Procesando';
    case 'SUCCESS':
      return 'Listo';
    case 'ERROR':
      return 'Error';
    case 'CANCELLED':
      return 'Cancelado';
  }
}

function getStatusClasses(status: DocumentJobStatus): string {
  switch (status) {
    case 'SUCCESS':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200';
    case 'ERROR':
      return 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200';
    case 'QUEUED':
      return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200';
    case 'PROCESSING':
      return 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-200';
    default:
      return 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300';
  }
}

function canDeleteJob(job: DocumentJob): boolean {
  return DELETABLE_STATUSES.has(job.status);
}

const DocumentStorageManager: React.FC<DocumentStorageManagerProps> = ({
  currentAgencyId,
  isAdmin,
  onConfirm,
  onDocumentsChanged,
}) => {
  const [statusFilter, setStatusFilter] = useState<'ALL' | DocumentJobStatus>('ALL');
  const [jobs, setJobs] = useState<DocumentJob[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<{ type: 'error' | 'success' | 'info'; text: string } | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [dateFrom, setDateFrom] = useState(getTodayDateInput);
  const [dateTo, setDateTo] = useState(getTodayDateInput);
  const requestIdRef = useRef(0);
  const currentAgencyIdRef = useRef(currentAgencyId);

  const isAgencyReady = Boolean(currentAgencyId && currentAgencyId !== 'GLOBAL');

  const totalBytes = useMemo(
    () => jobs.reduce((total, job) => total + job.fileSizeBytes, 0),
    [jobs],
  );
  const deletableJobs = useMemo(() => jobs.filter(canDeleteJob), [jobs]);
  const selectedJobs = useMemo(
    () => jobs.filter((job) => selectedIds.has(job.id)),
    [jobs, selectedIds],
  );
  const selectedDeletableJobs = useMemo(() => selectedJobs.filter(canDeleteJob), [selectedJobs]);
  const selectedBytes = useMemo(
    () => selectedDeletableJobs.reduce((total, job) => total + job.fileSizeBytes, 0),
    [selectedDeletableJobs],
  );
  const allDeletableSelected =
    deletableJobs.length > 0 && deletableJobs.every((job) => selectedIds.has(job.id));

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const pageEnd = Math.min(page * pageSize, total);

  const setErrorNotice = useCallback((error: unknown, fallback: string) => {
    const text = error instanceof ApiError ? error.message : fallback;
    setNotice({ type: 'error', text });
  }, []);

  const loadDocuments = useCallback(
    async (silent = false, forcePage?: number) => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;

      if (!isAgencyReady) {
        setJobs([]);
        setSelectedIds(new Set());
        setTotal(0);
        return;
      }

      if (!silent) {
        setIsLoading(true);
      }

      const currentPage = forcePage ?? page;

      try {
        const response = await api.getDocuments({
          agencyId: currentAgencyId,
          status: statusFilter === 'ALL' ? undefined : statusFilter,
          limit: pageSize,
          offset: (currentPage - 1) * pageSize,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        });

        if (requestId !== requestIdRef.current) {
          return;
        }

        setJobs(response.jobs);
        setTotal(response.total ?? response.jobs.length);
        setSelectedIds((current) => {
          const next = new Set<string>();
          const availableIds = new Set(response.jobs.map((job) => job.id));
          current.forEach((id) => {
            if (availableIds.has(id)) {
              next.add(id);
            }
          });
          return next;
        });
      } catch (error) {
        if (requestId === requestIdRef.current) {
          setErrorNotice(error, 'No se pudieron cargar los documentos almacenados.');
        }
      } finally {
        if (!silent) {
          setIsLoading(false);
        }
      }
    },
    [
      currentAgencyId,
      isAgencyReady,
      setErrorNotice,
      statusFilter,
      page,
      pageSize,
      dateFrom,
      dateTo,
    ],
  );

  useEffect(() => {
    currentAgencyIdRef.current = currentAgencyId;
    requestIdRef.current += 1;
    setJobs([]);
    setSelectedIds(new Set());
    setTotal(0);
    setNotice(null);
    setPage(1);
    void loadDocuments(true, 1);
  }, [currentAgencyId, statusFilter, pageSize, dateFrom, dateTo]);

  const toggleJob = (job: DocumentJob) => {
    if (!canDeleteJob(job) || isDeleting || !isAdmin) return;

    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(job.id)) {
        next.delete(job.id);
      } else {
        next.add(job.id);
      }
      return next;
    });
  };

  const toggleAllDeletable = () => {
    if (isDeleting || !isAdmin) return;

    setSelectedIds((current) => {
      if (allDeletableSelected) {
        return new Set();
      }

      const next = new Set(current);
      deletableJobs.forEach((job) => next.add(job.id));
      return next;
    });
  };

  const deleteJobs = async (jobsToDelete: DocumentJob[]) => {
    const deletable = jobsToDelete.filter(canDeleteJob);
    if (!isAgencyReady || deletable.length === 0 || isDeleting || !isAdmin) return;

    const agencyIdAtStart = currentAgencyId;
    const bytesToFree = deletable.reduce((total, job) => total + job.fileSizeBytes, 0);
    const confirmed = await onConfirm(
      `Eliminar ${deletable.length} documento(s) y liberar ${formatBytes(bytesToFree)} de MinIO?`,
    );

    if (!confirmed) return;

    setIsDeleting(true);
    setNotice(null);

    try {
      const response = await api.deleteDocuments({
        jobIds: deletable.map((job) => job.id),
        agencyId: agencyIdAtStart,
      });

      if (currentAgencyIdRef.current !== agencyIdAtStart) {
        return;
      }

      setJobs((current) => current.filter((job) => !response.deletedIds.includes(job.id)));
      setSelectedIds((current) => {
        const next = new Set(current);
        response.deletedIds.forEach((id) => next.delete(id));
        return next;
      });
      setNotice({
        type: response.errors.length > 0 ? 'info' : 'success',
        text:
          response.errors.length > 0
            ? `${response.deletedCount} eliminados. ${response.errors.length} no se pudieron eliminar.`
            : `${response.deletedCount} documentos eliminados. Espacio liberado: ${formatBytes(response.freedBytes)}.`,
      });
      try {
        await onDocumentsChanged();
      } catch (refreshError) {
        console.error('Error actualizando vistas despues de eliminar documentos:', refreshError);
      }

      void loadDocuments(true);
    } catch (error) {
      if (currentAgencyIdRef.current === agencyIdAtStart) {
        setErrorNotice(error, 'No se pudieron eliminar los documentos.');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const handleFilterApply = () => {
    setPage(1);
    void loadDocuments(false, 1);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    void loadDocuments(false, newPage);
  };

  return (
    <div className="space-y-6">
      {!isAdmin && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 shrink-0" />
            Solo el administrador puede gestionar el almacenamiento. Los demas roles tienen acceso
            de solo lectura.
          </div>
        </div>
      )}

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <HardDrive className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Gestion de almacenamiento
              </h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Elimina PDFs ya cargados para liberar espacio en MinIO sin borrar los resultados
                extraidos.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-sm sm:min-w-[280px]">
            <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-950/50">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Docs</p>
              <p className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{total}</p>
            </div>
            <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-950/50">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Total</p>
              <p className="mt-1 text-xl font-bold text-slate-900 dark:text-white">
                {formatBytes(totalBytes)}
              </p>
            </div>
            <div className="rounded-md bg-cyan-50 p-3 dark:bg-cyan-500/10">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-cyan-600 dark:text-cyan-200">
                Seleccion
              </p>
              <p className="mt-1 text-xl font-bold text-cyan-700 dark:text-cyan-100">
                {formatBytes(selectedBytes)}
              </p>
            </div>
          </div>
        </div>

        {!isAgencyReady && (
          <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
            Selecciona una agencia especifica para gestionar documentos almacenados.
          </div>
        )}

        {notice && (
          <div
            className={`mt-5 rounded-lg border p-4 text-sm font-medium ${
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
      </section>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-5 dark:border-slate-800 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Desde
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none transition-colors focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Hasta
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none transition-colors focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
              />
            </div>
            <button
              type="button"
              onClick={handleFilterApply}
              disabled={!isAgencyReady || isLoading}
              className="h-9 rounded-md bg-cyan-600 px-3 text-sm font-semibold text-white transition-colors hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Filtrar
            </button>
            <div className="mx-1 h-9 w-px bg-slate-200 dark:bg-slate-700" />
            <select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value as 'ALL' | DocumentJobStatus);
                setPage(1);
              }}
              disabled={!isAgencyReady || isLoading || isDeleting}
              className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition-colors focus:border-cyan-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            >
              {STATUS_FILTERS.map((filter) => (
                <option key={filter.value} value={filter.value}>
                  {filter.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void loadDocuments(false)}
              disabled={!isAgencyReady || isLoading || isDeleting}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Actualizar
            </button>
          </div>

          {isAdmin && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={toggleAllDeletable}
                disabled={!isAgencyReady || deletableJobs.length === 0 || isDeleting}
                className="h-9 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {allDeletableSelected ? 'Limpiar seleccion' : 'Seleccionar borrables'}
              </button>
              <button
                type="button"
                onClick={() => void deleteJobs(selectedDeletableJobs)}
                disabled={!isAgencyReady || selectedDeletableJobs.length === 0 || isDeleting}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-red-600 px-3 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isDeleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                Eliminar seleccionados
              </button>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="flex min-h-[260px] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-cyan-600" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="flex min-h-[260px] flex-col items-center justify-center p-8 text-center">
            <FileText className="mb-3 h-10 w-10 text-slate-300 dark:text-slate-600" />
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
              No hay documentos para este filtro
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {jobs.map((job) => {
              const deletable = canDeleteJob(job);
              const selected = selectedIds.has(job.id);

              return (
                <div
                  key={job.id}
                  className="grid gap-2 px-4 py-2.5 md:grid-cols-[28px_minmax(0,1fr)_112px_90px_96px] md:items-center"
                >
                  {isAdmin ? (
                    <div>
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={!deletable || isDeleting}
                        onChange={() => toggleJob(job)}
                        className="h-3.5 w-3.5 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500 disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label={`Seleccionar ${job.originalFileName}`}
                      />
                    </div>
                  ) : (
                    <div />
                  )}
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <p className="truncate text-xs font-bold text-slate-800 dark:text-slate-100">
                        {job.originalFileName}
                      </p>
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0 pl-5 text-[11px] text-slate-500 dark:text-slate-400">
                      <span>{formatDate(job.createdAt)}</span>
                      {!deletable && <span>No eliminable mientras esta activo</span>}
                    </div>
                  </div>
                  <div>
                    <span
                      className={`inline-flex min-w-[96px] items-center justify-center rounded-md border px-2 py-0.5 text-[11px] font-bold ${getStatusClasses(job.status)}`}
                    >
                      {getStatusLabel(job.status)}
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    {formatBytes(job.fileSizeBytes)}
                  </div>
                  <div className="md:text-right">
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => void deleteJobs([job])}
                        disabled={!deletable || isDeleting}
                        className="inline-flex h-7 items-center justify-center gap-1.5 rounded-md border border-red-200 px-2 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-red-500/30 dark:text-red-300 dark:hover:bg-red-500/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Eliminar
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {jobs.some((job) => !canDeleteJob(job)) && (
          <div className="flex items-start gap-2 border-t border-slate-200 bg-slate-50 p-4 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            Los documentos en cola o procesamiento se protegen hasta que el worker termine.
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-slate-200 p-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <span>
              {pageStart}-{pageEnd} de {total} documentos
            </span>
            <span className="hidden text-slate-300 dark:text-slate-700 sm:inline">|</span>
            <span>Filas:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              disabled={isLoading}
              className="h-8 rounded border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handlePageChange(page - 1)}
              disabled={page <= 1 || isLoading}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => handlePageChange(page + 1)}
              disabled={page >= totalPages || isLoading}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default DocumentStorageManager;
