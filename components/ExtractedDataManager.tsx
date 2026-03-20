import React, { useEffect, useState } from 'react';
import { BatchItem } from '../types';
import { AlertCircle, BrainCircuit, CheckCircle, FileText, RefreshCw, Search, Trash2, X } from './Icons';
import { getConfidenceColor, getConfidenceLabel } from '../utils/helpers';

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
  const [statusFilter, setStatusFilter] = useState<'ALL' | BatchItem['status']>('ALL');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const filteredResults = results.filter((item) => {
    const normalizedQuery = query.trim().toLowerCase();
    const matchesStatus = statusFilter === 'ALL' || item.status === statusFilter;
    if (!matchesStatus) {
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
  });

  const selectedVisibleCount = filteredResults.filter((item) => selectedIds.includes(item.id)).length;
  const successCount = results.filter((item) => item.status === 'SUCCESS').length;
  const errorCount = results.filter((item) => item.status === 'ERROR').length;
  const hasActiveFilters = query.trim().length > 0 || statusFilter !== 'ALL';

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => results.some((item) => item.id === id)));
  }, [results]);

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]);
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

  const clearFilters = () => {
    setQuery('');
    setStatusFilter('ALL');
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6 h-full flex flex-col">
      {/* Stat Cards — compact, consistent with app design */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
            <p className="text-2xl font-bold text-slate-800 dark:text-white">{selectedIds.length}</p>
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
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Busca, revisa y elimina registros procesados.</p>
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

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'ALL' | BatchItem['status'])}
                className="px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ALL">Todos los estados</option>
                <option value="SUCCESS">Solo exitosos</option>
                <option value="ERROR">Solo errores</option>
                <option value="PROCESSING">Procesando</option>
                <option value="PENDING">Pendientes</option>
              </select>

              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-500 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors inline-flex items-center gap-2"
                >
                  <X className="w-4 h-4" />
                  Limpiar filtros
                </button>
              )}

              <button
                onClick={() => onRefresh()}
                disabled={isBusy}
                className="px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors disabled:opacity-50 inline-flex items-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${isBusy ? 'animate-spin' : ''}`} />
                Recargar
              </button>
            </div>
          </div>

          {/* Action row */}
          <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="text-sm text-slate-500 dark:text-slate-400">
              Mostrando <span className="font-semibold text-slate-800 dark:text-white">{filteredResults.length}</span> de {results.length} registros
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={toggleSelectAllVisible}
                disabled={filteredResults.length === 0}
                className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-900 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
              >
                {selectedVisibleCount === filteredResults.length && filteredResults.length > 0 ? 'Quitar visibles' : 'Seleccionar visibles'}
              </button>

              <button
                onClick={() => handleDelete(selectedIds)}
                disabled={selectedIds.length === 0 || isBusy}
                className="px-4 py-2 rounded-lg bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 transition-colors disabled:opacity-50 inline-flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Eliminar seleccionados
              </button>
            </div>
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
              <p className="text-lg font-semibold text-slate-600 dark:text-slate-300">Sin resultados</p>
              <p className="text-sm mt-2 max-w-md">Ajusta la búsqueda o el filtro de estado.</p>
            </div>
          ) : (
            filteredResults.map((item) => {
              const confidence = item.result?.confidenceScore;
              const isSelected = selectedIds.includes(item.id);

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
                      <span className="font-semibold text-sm text-slate-900 dark:text-white truncate block">{item.fileName}</span>
                      {item.error && <span className="text-xs text-rose-500 truncate block mt-0.5">{item.error}</span>}
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {item.status === 'SUCCESS' && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-700 px-2.5 py-1 text-xs font-bold"><CheckCircle className="w-3.5 h-3.5" /> OK</span>}
                      {item.status === 'ERROR' && <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 text-rose-700 px-2.5 py-1 text-xs font-bold"><AlertCircle className="w-3.5 h-3.5" /> Error</span>}
                      {item.status === 'PROCESSING' && <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 px-2.5 py-1 text-xs font-bold">Procesando</span>}
                      {item.status === 'PENDING' && <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-600 px-2.5 py-1 text-xs font-bold">Pendiente</span>}

                      <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-700 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
                        {item.agencyId || 'Sin agencia'}
                      </span>

                      <span className="text-xs text-slate-400 hidden sm:inline">
                        {item.processedAt ? new Date(item.processedAt).toLocaleDateString() : '-'}
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
                      <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">Invoice</p>
                      <p className="font-mono text-slate-700 dark:text-slate-200 mt-0.5">{item.result?.invoiceNumber || '-'}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">Shipper</p>
                      <p className="text-slate-600 dark:text-slate-300 mt-0.5 truncate">{item.result?.shipperName || '-'}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">Consignee</p>
                      <p className="text-slate-600 dark:text-slate-300 mt-0.5 truncate">{item.result?.consigneeName || '-'}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">MAWB</p>
                      <p className="font-mono text-slate-600 dark:text-slate-300 mt-0.5">{item.result?.mawb || '-'}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">HAWB</p>
                      <p className="font-mono text-slate-600 dark:text-slate-300 mt-0.5">{item.result?.hawb || '-'}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">Piezas / Valor</p>
                      <p className="text-slate-700 dark:text-slate-200 mt-0.5">
                        <span className="font-semibold">{item.result?.totalPieces ?? '-'}</span>
                        <span className="text-slate-300 dark:text-slate-600 mx-1.5">|</span>
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">{item.result?.totalValue ? `$${item.result.totalValue}` : '-'}</span>
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">Fiabilidad</p>
                      {confidence !== undefined ? (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border mt-0.5 ${getConfidenceColor(confidence)}`}>
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
                    <span>Usuario: <span className="text-slate-600 dark:text-slate-300 font-medium">{item.user || '-'}</span></span>
                    <span>·</span>
                    <span>{item.processedAt ? new Date(item.processedAt).toLocaleString() : '-'}</span>
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
                {selectedIds.length} {selectedIds.length === 1 ? 'registro seleccionado' : 'registros seleccionados'}
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

export default ExtractedDataManager;