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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">Registros</p>
          <p className="mt-3 text-3xl font-bold text-slate-900 dark:text-white">{results.length}</p>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Repositorio filtrable de extracciones persistidas.</p>
        </div>
        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">Exitosos</p>
          <p className="mt-3 text-3xl font-bold text-emerald-600">{successCount}</p>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Documentos listos para auditoría, búsqueda o depuración.</p>
        </div>
        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">Con error</p>
          <p className="mt-3 text-3xl font-bold text-rose-500">{errorCount}</p>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Registros fallidos o incompletos que conviene depurar primero.</p>
        </div>
        <div className="bg-slate-900 dark:bg-slate-800 p-5 rounded-2xl border border-slate-800 dark:border-slate-700 shadow-sm text-white">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">Seleccionados</p>
          <p className="mt-3 text-3xl font-bold">{selectedIds.length}</p>
          <p className="mt-2 text-sm text-slate-300">Borrado selectivo y controlado, sin afectar el resto del historial.</p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden flex-1 flex flex-col">
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-700 bg-[linear-gradient(135deg,rgba(79,70,229,0.08),transparent_60%)]">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Datos extraídos</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Busca por archivo, invoice, guía, agencia, shipper o usuario y elimina solo lo que realmente quieres limpiar.</p>
            </div>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative min-w-[280px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar archivo, invoice, MAWB, HAWB, agencia..."
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'ALL' | BatchItem['status'])}
                className="px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
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
                  className="px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-500 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors inline-flex items-center gap-2"
                >
                  <X className="w-4 h-4" />
                  Limpiar filtros
                </button>
              )}

              <button
                onClick={() => onRefresh()}
                disabled={isBusy}
                className="px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors disabled:opacity-50 inline-flex items-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${isBusy ? 'animate-spin' : ''}`} />
                Recargar
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="text-sm text-slate-500 dark:text-slate-400">
              Mostrando <span className="font-semibold text-slate-800 dark:text-white">{filteredResults.length}</span> registros.
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
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 text-rose-700 px-4 py-3 text-sm">
              {errorMessage}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-auto">
          {filteredResults.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-6 py-14 text-slate-400">
              <FileText className="w-12 h-12 mb-4 opacity-30" />
              <p className="text-lg font-semibold text-slate-600 dark:text-slate-300">No hay coincidencias con ese filtro.</p>
              <p className="text-sm mt-2 max-w-md">Ajusta la búsqueda o cambia el estado para encontrar los registros que quieres revisar o eliminar.</p>
            </div>
          ) : (
            <table className="w-full min-w-[1080px] text-sm text-left">
              <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400 uppercase text-[11px] tracking-[0.18em] border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="px-6 py-4">
                    <input
                      type="checkbox"
                      checked={filteredResults.length > 0 && selectedVisibleCount === filteredResults.length}
                      onChange={toggleSelectAllVisible}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                  </th>
                  <th className="px-6 py-4">Archivo</th>
                  <th className="px-6 py-4">Estado</th>
                  <th className="px-6 py-4">Agencia</th>
                  <th className="px-6 py-4">Documento</th>
                  <th className="px-6 py-4">Ruta Logística</th>
                  <th className="px-6 py-4 text-right">Piezas</th>
                  <th className="px-6 py-4 text-right">Valor</th>
                  <th className="px-6 py-4 text-center">Fiabilidad</th>
                  <th className="px-6 py-4">Usuario</th>
                  <th className="px-6 py-4">Fecha</th>
                  <th className="px-6 py-4 text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {filteredResults.map((item) => {
                  const confidence = item.result?.confidenceScore;
                  const isSelected = selectedIds.includes(item.id);

                  return (
                    <tr
                      key={item.id}
                      className={`transition-colors ${isSelected ? 'bg-indigo-50/70 dark:bg-indigo-900/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'}`}
                    >
                      <td className="px-6 py-4">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelection(item.id)}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-900 dark:text-white">{item.fileName}</div>
                        {item.error && <div className="text-xs text-rose-500 mt-1 truncate max-w-[220px]">{item.error}</div>}
                      </td>
                      <td className="px-6 py-4">
                        {item.status === 'SUCCESS' && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-700 px-2.5 py-1 text-xs font-bold"><CheckCircle className="w-3.5 h-3.5" /> OK</span>}
                        {item.status === 'ERROR' && <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 text-rose-700 px-2.5 py-1 text-xs font-bold"><AlertCircle className="w-3.5 h-3.5" /> ERROR</span>}
                        {item.status === 'PROCESSING' && <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 px-2.5 py-1 text-xs font-bold">PROCESANDO</span>}
                        {item.status === 'PENDING' && <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-600 px-2.5 py-1 text-xs font-bold">PENDIENTE</span>}
                      </td>
                      <td className="px-6 py-4 text-slate-500 dark:text-slate-400">
                        <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-900 px-2.5 py-1 text-xs font-semibold">
                          {item.agencyId || 'Sin agencia'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-600 dark:text-slate-300">
                        <div className="font-mono text-xs">{item.result?.invoiceNumber || '-'}</div>
                        <div className="text-xs text-slate-400 mt-1">{item.result?.shipperName || 'Sin shipper'}</div>
                        <div className="text-xs text-slate-400 mt-1">{item.result?.consigneeName || 'Sin consignee'}</div>
                      </td>
                      <td className="px-6 py-4 text-slate-600 dark:text-slate-300">
                        <div className="text-xs">MAWB: <span className="font-mono">{item.result?.mawb || '-'}</span></div>
                        <div className="text-xs mt-1">HAWB: <span className="font-mono">{item.result?.hawb || '-'}</span></div>
                      </td>
                      <td className="px-6 py-4 text-right font-semibold text-slate-700 dark:text-slate-200">
                        {item.result?.totalPieces ?? '-'}
                      </td>
                      <td className="px-6 py-4 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                        {item.result?.totalValue ? `$${item.result.totalValue}` : '-'}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {confidence !== undefined ? (
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${getConfidenceColor(confidence)}`}>
                            <BrainCircuit className="w-3 h-3" />
                            {confidence}% {getConfidenceLabel(confidence)}
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-500 dark:text-slate-400">{item.user || '-'}</td>
                      <td className="px-6 py-4 text-slate-500 dark:text-slate-400">
                        {item.processedAt ? new Date(item.processedAt).toLocaleString() : '-'}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => handleDelete([item.id])}
                          disabled={isBusy}
                          className="inline-flex items-center justify-center p-2 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors disabled:opacity-50"
                          title="Eliminar registro"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {selectedIds.length > 0 && (
          <div className="sticky bottom-0 border-t border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-800/95 backdrop-blur px-6 py-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  {selectedIds.length} {selectedIds.length === 1 ? 'registro seleccionado' : 'registros seleccionados'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Puedes limpiar la selección actual o ejecutar el borrado múltiple desde aquí.
                </p>
              </div>

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