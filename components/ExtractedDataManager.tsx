import React, { useEffect, useMemo, useRef, useState, useDeferredValue } from 'react';
import { BatchItem } from '../types';
import {
  AlertCircle,
  BrainCircuit,
  Calendar,
  CheckCircle,
  ChevronDown,
  FileText,
  MoreVertical,
  Package,
  RefreshCw,
  Search,
  Trash2,
  X,
} from './Icons';
import { getConfidenceColor } from '../utils/helpers';

type StatusFilter = 'ALL' | BatchItem['status'];

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string; description: string }> = [
  { value: 'ALL', label: 'Todos los estados', description: 'Ver todos los registros' },
  { value: 'SUCCESS', label: 'Exitosos', description: 'Extracciones completadas' },
  { value: 'ERROR', label: 'Con error', description: 'Registros que requieren revisión' },
  { value: 'PROCESSING', label: 'Procesando', description: 'Trabajos en curso' },
  { value: 'PENDING', label: 'Pendientes', description: 'Aún no procesados' },
];

const formatDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toDateKey = (dateValue?: string): string => {
  if (!dateValue) return '';
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '';
  return formatDateKey(date);
};

const getRelativeDateKey = (daysAgo: number): string => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - daysAgo);
  return formatDateKey(date);
};

const getRecordDateKey = (item: BatchItem): string => toDateKey(item.processedAt || item.createdAt);

interface ExtractedDataManagerProps {
  results: BatchItem[];
  isBusy?: boolean;
  onRefresh: () => Promise<void> | void;
  onDeleteItems: (ids: string[]) => Promise<string | null>;
}

const ExtractedDataManager: React.FC<ExtractedDataManagerProps> = ({
  results,
  isBusy = false,
  onRefresh,
  onDeleteItems,
}) => {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [isStatusMenuOpen, setIsStatusMenuOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [isDateFiltersOpen, setIsDateFiltersOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);
  const statusMenuRef = useRef<HTMLDivElement | null>(null);
  const dateFiltersRef = useRef<HTMLDivElement | null>(null);
  const actionsMenuRef = useRef<HTMLDivElement | null>(null);

  const dateRangeInvalid = Boolean(dateFrom && dateTo && dateFrom > dateTo);

  const filteredResults = useMemo(
    () =>
      dateRangeInvalid
        ? []
        : results.filter((item) => {
            const normalizedQuery = deferredQuery.trim().toLowerCase();
            const matchesStatus = statusFilter === 'ALL' || item.status === statusFilter;
            const itemDate = getRecordDateKey(item);
            const matchesDate =
              (!dateFrom && !dateTo) ||
              (Boolean(itemDate) &&
                (!dateFrom || itemDate >= dateFrom) &&
                (!dateTo || itemDate <= dateTo));

            if (!matchesStatus) {
              return false;
            }

            if (!matchesDate) {
              return false;
            }

            if (!normalizedQuery) {
              return true;
            }

            const haystack = [
              item.fileName,
              item.agencyId,
              item.user,
              item.result?.invoiceNumber,
              item.result?.mawb,
              item.result?.hawb,
              item.result?.shipperName,
              item.result?.consigneeName,
            ]
              .filter(Boolean)
              .join(' ')
              .toLowerCase();

            return haystack.includes(normalizedQuery);
          }),
    [results, deferredQuery, statusFilter, dateFrom, dateTo, dateRangeInvalid],
  );

  const filteredIds = filteredResults.map((item) => item.id);
  const filteredPiecesCount = filteredResults.reduce(
    (total, item) => total + (Number(item.result?.totalPieces) || 0),
    0,
  );
  const selectedVisibleCount = filteredResults.filter((item) =>
    selectedIds.includes(item.id),
  ).length;
  const successCount = results.filter((item) => item.status === 'SUCCESS').length;
  const errorCount = results.filter((item) => item.status === 'ERROR').length;
  const processingCount = results.filter((item) => item.status === 'PROCESSING').length;
  const pendingCount = results.filter((item) => item.status === 'PENDING').length;
  const selectedStatusOption =
    STATUS_OPTIONS.find((option) => option.value === statusFilter) || STATUS_OPTIONS[0];
  const hasDateFilter = dateFrom.length > 0 || dateTo.length > 0;
  const hasActiveFilters = query.trim().length > 0 || statusFilter !== 'ALL' || hasDateFilter;
  const dateFilterSummary = dateRangeInvalid
    ? 'Rango inválido'
    : hasDateFilter
      ? `${filteredResults.length} registros en el rango`
      : 'Todos los días';

  const getStatusCount = (status: StatusFilter) => {
    if (status === 'ALL') return results.length;
    if (status === 'SUCCESS') return successCount;
    if (status === 'ERROR') return errorCount;
    if (status === 'PROCESSING') return processingCount;
    return pendingCount;
  };

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => results.some((item) => item.id === id)));
  }, [results]);

  useEffect(() => {
    if (!isStatusMenuOpen) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (!statusMenuRef.current) {
        return;
      }

      const target = event.target;
      if (target instanceof Node && !statusMenuRef.current.contains(target)) {
        setIsStatusMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isStatusMenuOpen]);

  useEffect(() => {
    if (!isDateFiltersOpen) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (!dateFiltersRef.current) {
        return;
      }

      const target = event.target;
      if (target instanceof Node && !dateFiltersRef.current.contains(target)) {
        setIsDateFiltersOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isDateFiltersOpen]);

  useEffect(() => {
    if (!isActionsMenuOpen) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (!actionsMenuRef.current) {
        return;
      }

      const target = event.target;
      if (target instanceof Node && !actionsMenuRef.current.contains(target)) {
        setIsActionsMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isActionsMenuOpen]);

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id],
    );
  };

  const toggleSelectAllVisible = () => {
    const visibleIds = filteredResults.map((item) => item.id);
    if (visibleIds.length === 0) {
      return;
    }

    const allVisibleSelected = visibleIds.every((id) => selectedIds.includes(id));
    setSelectedIds((prev) => {
      if (allVisibleSelected) {
        return prev.filter((id) => !visibleIds.includes(id));
      }

      return Array.from(new Set([...prev, ...visibleIds]));
    });
  };

  const handleDelete = async (ids: string[]) => {
    setErrorMessage(null);
    const error = await onDeleteItems(ids);
    if (error) {
      setErrorMessage(error);
      return;
    }

    setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)));
  };

  const applyDateWindow = (days: number) => {
    setDateFrom(getRelativeDateKey(days - 1));
    setDateTo(getRelativeDateKey(0));
  };

  const clearFilters = () => {
    setQuery('');
    setStatusFilter('ALL');
    setDateFrom('');
    setDateTo('');
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6 h-full flex flex-col">
      {/* Stat Cards — compact, consistent with app design */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex items-center gap-4">
          <div className="p-3 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 rounded-lg">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm text-slate-500 dark:text-slate-400">Registros</p>
            <p className="text-2xl font-bold text-slate-800 dark:text-white">{results.length}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex items-center gap-4">
          <div className="p-3 bg-sky-100 dark:bg-sky-900/50 text-sky-600 rounded-lg">
            <Package className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm text-slate-500 dark:text-slate-400">Piezas filtradas</p>
            <p className="text-2xl font-bold text-slate-800 dark:text-white">
              {filteredPiecesCount.toLocaleString('es-EC')}
            </p>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex items-center gap-4">
          <div className="p-3 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 rounded-lg">
            <CheckCircle className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm text-slate-500 dark:text-slate-400">Exitosos</p>
            <p className="text-2xl font-bold text-slate-800 dark:text-white">{successCount}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex items-center gap-4">
          <div className="p-3 bg-rose-100 dark:bg-rose-900/50 text-rose-600 rounded-lg">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm text-slate-500 dark:text-slate-400">Con error</p>
            <p className="text-2xl font-bold text-slate-800 dark:text-white">{errorCount}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex items-center gap-4">
          <div className="p-3 bg-slate-800 dark:bg-slate-600 text-white rounded-lg">
            <Trash2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm text-slate-500 dark:text-slate-400">Seleccionados</p>
            <p className="text-2xl font-bold text-slate-800 dark:text-white">
              {selectedIds.length}
            </p>
          </div>
        </div>
      </div>

      {/* Main Panel */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden flex-1 flex flex-col">
        {/* Search & Filter Bar */}
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-700">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                Datos Extraídos
                <span className="text-xs font-normal text-slate-400 px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded-full">
                  Base de datos
                </span>
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                Busca, revisa y elimina registros procesados.
              </p>
            </div>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative min-w-[280px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar archivo, invoice, MAWB, agencia..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="relative" ref={statusMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsStatusMenuOpen((current) => !current)}
                  className="group flex h-[42px] min-w-[250px] items-center gap-2.5 rounded-lg border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100 px-3 text-left shadow-sm transition-all hover:border-indigo-200 hover:shadow-md dark:border-slate-700 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 dark:hover:border-indigo-500/50"
                  aria-haspopup="listbox"
                  aria-expanded={isStatusMenuOpen}
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
                    {statusFilter === 'ERROR' ? (
                      <AlertCircle className="h-4 w-4" />
                    ) : statusFilter === 'SUCCESS' ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : (
                      <FileText className="h-4 w-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] font-bold uppercase leading-none tracking-[0.16em] text-slate-400 dark:text-slate-500">
                      Filtro Estado
                    </p>
                    <p className="truncate text-sm font-semibold leading-tight text-slate-800 dark:text-white">
                      {selectedStatusOption.label}
                    </p>
                  </div>
                  <div className="rounded-full bg-slate-200/70 px-2 py-0.5 text-xs font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-200">
                    {getStatusCount(statusFilter)}
                  </div>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${isStatusMenuOpen ? 'rotate-180 text-indigo-500' : 'group-hover:text-slate-600 dark:group-hover:text-slate-200'}`}
                  />
                </button>

                {isStatusMenuOpen && (
                  <div className="absolute right-0 z-20 mt-2 w-[320px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-200/80 dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/40">
                    <div className="border-b border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/70">
                      <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">
                        Estado de proceso
                      </p>
                      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                        Filtra la lista antes de seleccionar o eliminar registros.
                      </p>
                    </div>

                    <div className="max-h-72 space-y-1 overflow-auto p-2" role="listbox">
                      {STATUS_OPTIONS.map((option) => {
                        const isSelected = statusFilter === option.value;

                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => {
                              setStatusFilter(option.value);
                              setIsStatusMenuOpen(false);
                            }}
                            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${isSelected ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200' : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800'}`}
                            role="option"
                            aria-selected={isSelected}
                          >
                            <div
                              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${isSelected ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-900 dark:text-indigo-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}
                            >
                              {option.value === 'ERROR' ? (
                                <AlertCircle className="h-4 w-4" />
                              ) : option.value === 'SUCCESS' ? (
                                <CheckCircle className="h-4 w-4" />
                              ) : (
                                <FileText className="h-4 w-4" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold">{option.label}</p>
                              <p className="text-xs text-slate-400 dark:text-slate-500">
                                {option.description}
                              </p>
                            </div>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                              {getStatusCount(option.value)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-500 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors inline-flex items-center gap-2"
                >
                  <X className="w-4 h-4" />
                  Limpiar filtros
                </button>
              )}

              <div className="relative" ref={dateFiltersRef}>
                <button
                  type="button"
                  onClick={() => setIsDateFiltersOpen((current) => !current)}
                  className={`relative inline-flex h-[42px] w-[42px] items-center justify-center rounded-lg border text-sm font-semibold transition-colors ${dateRangeInvalid ? 'border-amber-300 bg-amber-50 text-amber-600 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300' : hasDateFilter ? 'border-indigo-200 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-300' : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900'}`}
                  aria-label="Filtrar por fecha procesada"
                  aria-haspopup="dialog"
                  aria-expanded={isDateFiltersOpen}
                  title="Filtrar por fecha procesada"
                >
                  <Calendar className="w-4 h-4" />
                  {hasDateFilter && (
                    <span
                      className={`absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-slate-800 ${dateRangeInvalid ? 'bg-amber-500' : 'bg-indigo-500'}`}
                    />
                  )}
                </button>

                {isDateFiltersOpen && (
                  <div className="absolute right-0 z-30 mt-2 w-[340px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-200/80 dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/40">
                    <div className="border-b border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/70">
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${hasDateFilter ? 'border-indigo-200 bg-indigo-50 text-indigo-600 dark:border-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-300' : 'border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}
                        >
                          <Calendar className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-800 dark:text-white">
                            Fecha procesada
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {dateFilterSummary}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3 p-4">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                          Desde
                          <input
                            type="date"
                            value={dateFrom}
                            max={dateTo || undefined}
                            onChange={(e) => setDateFrom(e.target.value)}
                            className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                          />
                        </label>
                        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                          Hasta
                          <input
                            type="date"
                            value={dateTo}
                            min={dateFrom || undefined}
                            onChange={(e) => setDateTo(e.target.value)}
                            className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                          />
                        </label>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => applyDateWindow(1)}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:text-indigo-300"
                        >
                          Hoy
                        </button>
                        <button
                          type="button"
                          onClick={() => applyDateWindow(7)}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:text-indigo-300"
                        >
                          7 días
                        </button>
                        <button
                          type="button"
                          onClick={() => applyDateWindow(30)}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:text-indigo-300"
                        >
                          30 días
                        </button>
                      </div>

                      {dateRangeInvalid && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 dark:border-amber-900/60 dark:bg-amber-900/20 dark:text-amber-300">
                          La fecha inicial no puede ser mayor que la fecha final.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="relative" ref={actionsMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsActionsMenuOpen((current) => !current)}
                  className="relative inline-flex h-[42px] w-[42px] items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900"
                  aria-label="Acciones"
                  aria-haspopup="menu"
                  aria-expanded={isActionsMenuOpen}
                  title="Acciones"
                >
                  <MoreVertical className="h-5 w-5" />
                </button>

                {isActionsMenuOpen && (
                  <div className="absolute right-0 z-30 mt-2 w-[280px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-200/80 dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/40">
                    <div className="border-b border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/70">
                      <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">
                        Acciones
                      </p>
                      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                        Gestiona los datos extraídos.
                      </p>
                    </div>
                    <div className="p-2 space-y-1">
                      <button
                        type="button"
                        onClick={() => {
                          setIsActionsMenuOpen(false);
                          onRefresh();
                        }}
                        disabled={isBusy}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-slate-800"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                          <RefreshCw className={`h-4 w-4 ${isBusy ? 'animate-spin' : ''}`} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                            Recargar
                          </p>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsActionsMenuOpen(false);
                          toggleSelectAllVisible();
                        }}
                        disabled={filteredResults.length === 0}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-slate-800"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                          <FileText className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                            {selectedVisibleCount === filteredResults.length &&
                            filteredResults.length > 0
                              ? 'Quitar selección visible'
                              : 'Seleccionar visibles'}
                          </p>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsActionsMenuOpen(false);
                          handleDelete(filteredIds);
                        }}
                        disabled={
                          !hasActiveFilters ||
                          filteredResults.length === 0 ||
                          isBusy ||
                          dateRangeInvalid
                        }
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-rose-500/10"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">
                          <Trash2 className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                            Eliminar filtrados ({filteredResults.length})
                          </p>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsActionsMenuOpen(false);
                          handleDelete(selectedIds);
                        }}
                        disabled={selectedIds.length === 0 || isBusy}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-rose-500/10"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">
                          <Trash2 className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                            Eliminar seleccionados{' '}
                            {selectedIds.length > 0 ? `(${selectedIds.length})` : ''}
                          </p>
                        </div>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Info row */}
          <div className="mt-4 text-sm text-slate-500 dark:text-slate-400">
            Mostrando{' '}
            <span className="font-semibold text-slate-800 dark:text-white">
              {filteredResults.length}
            </span>{' '}
            de {results.length} registros
          </div>

          {errorMessage && (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 px-4 py-3 text-sm">
              {errorMessage}
            </div>
          )}
        </div>

        {/* Card List */}
        <div className="flex-1 overflow-auto p-4 space-y-3">
          {filteredResults.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-6 py-14 text-slate-400">
              <FileText className="w-12 h-12 mb-4 opacity-30" />
              <p className="text-lg font-semibold text-slate-600 dark:text-slate-300">
                Sin resultados
              </p>
              <p className="text-sm mt-2 max-w-md">Ajusta la búsqueda o el filtro de estado.</p>
            </div>
          ) : (
            filteredResults.map((item) => {
              const confidence = item.result?.confidenceScore;
              const isSelected = selectedIds.includes(item.id);
              const recordDate = item.processedAt || item.createdAt;
              const recordDateLabel = recordDate ? new Date(recordDate).toLocaleDateString() : '-';
              const recordDateTimeLabel = recordDate ? new Date(recordDate).toLocaleString() : '-';

              return (
                <div
                  key={item.id}
                  className={`rounded-xl border transition-colors ${
                    isSelected
                      ? 'border-indigo-300 dark:border-indigo-700 bg-indigo-50/60 dark:bg-indigo-900/10'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  {/* Row 1: Header — checkbox, file name, status, agency, date, delete */}
                  <div className="flex items-center gap-4 px-5 py-3 border-b border-slate-100 dark:border-slate-700/50">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelection(item.id)}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="font-semibold text-sm text-slate-900 dark:text-white truncate block">
                        {item.fileName}
                      </span>
                      {item.error && (
                        <span className="text-xs text-rose-500 truncate block mt-0.5">
                          {item.error}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {item.status === 'SUCCESS' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-700 px-2.5 py-1 text-xs font-bold">
                          <CheckCircle className="w-3.5 h-3.5" /> OK
                        </span>
                      )}
                      {item.status === 'ERROR' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 text-rose-700 px-2.5 py-1 text-xs font-bold">
                          <AlertCircle className="w-3.5 h-3.5" /> Error
                        </span>
                      )}
                      {item.status === 'PROCESSING' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 px-2.5 py-1 text-xs font-bold">
                          Procesando
                        </span>
                      )}
                      {item.status === 'PENDING' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-600 px-2.5 py-1 text-xs font-bold">
                          Pendiente
                        </span>
                      )}

                      <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-700 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
                        {item.agencyId || 'Sin agencia'}
                      </span>

                      <span className="text-xs text-slate-400 hidden sm:inline">
                        {recordDateLabel}
                      </span>

                      <button
                        onClick={() => handleDelete([item.id])}
                        disabled={isBusy}
                        className="inline-flex items-center justify-center p-1.5 rounded-lg text-rose-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors disabled:opacity-50"
                        title="Eliminar registro"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Row 2: Data fields — horizontal grid, no stacking */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-x-6 gap-y-2 px-5 py-3 text-sm">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">
                        Invoice
                      </p>
                      <p className="font-mono text-slate-700 dark:text-slate-200 mt-0.5">
                        {item.result?.invoiceNumber || '-'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">
                        Shipper
                      </p>
                      <p className="text-slate-600 dark:text-slate-300 mt-0.5 truncate">
                        {item.result?.shipperName || '-'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">
                        Consignee
                      </p>
                      <p className="text-slate-600 dark:text-slate-300 mt-0.5 truncate">
                        {item.result?.consigneeName || '-'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">
                        MAWB
                      </p>
                      <p className="font-mono text-slate-600 dark:text-slate-300 mt-0.5">
                        {item.result?.mawb || '-'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">
                        HAWB
                      </p>
                      <p className="font-mono text-slate-600 dark:text-slate-300 mt-0.5">
                        {item.result?.hawb || '-'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">
                        Piezas / Valor
                      </p>
                      <p className="text-slate-700 dark:text-slate-200 mt-0.5">
                        <span className="font-semibold">{item.result?.totalPieces ?? '-'}</span>
                        <span className="text-slate-300 dark:text-slate-600 mx-1.5">|</span>
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                          {item.result?.totalValue ? `$${item.result.totalValue}` : '-'}
                        </span>
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">
                        Fiabilidad
                      </p>
                      {confidence !== undefined ? (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border mt-0.5 ${getConfidenceColor(confidence)}`}
                        >
                          <BrainCircuit className="w-3 h-3" />
                          {confidence}%
                        </span>
                      ) : (
                        <p className="text-slate-300 mt-0.5">-</p>
                      )}
                    </div>
                  </div>

                  {/* Row 3: Meta — user + full timestamp (compact) */}
                  <div className="flex items-center gap-4 px-5 py-2 bg-slate-50/50 dark:bg-slate-900/30 text-xs text-slate-400 border-t border-slate-100 dark:border-slate-700/50 rounded-b-xl">
                    <span>
                      Usuario:{' '}
                      <span className="text-slate-600 dark:text-slate-300 font-medium">
                        {item.user || '-'}
                      </span>
                    </span>
                    <span>·</span>
                    <span>{recordDateTimeLabel}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Sticky bulk-action bar */}
        {selectedIds.length > 0 && (
          <div className="sticky bottom-0 border-t border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-800/95 backdrop-blur px-6 py-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                {selectedIds.length}{' '}
                {selectedIds.length === 1 ? 'registro seleccionado' : 'registros seleccionados'}
              </p>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSelectedIds([])}
                  className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-900 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                  Limpiar selección
                </button>
                <button
                  onClick={() => handleDelete(selectedIds)}
                  disabled={isBusy}
                  className="px-4 py-2 rounded-lg bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 transition-colors disabled:opacity-50 inline-flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Eliminar ahora
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(ExtractedDataManager);
