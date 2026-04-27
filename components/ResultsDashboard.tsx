
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BatchItem } from '../types';
import { CheckCircle, AlertCircle, FileText, Download, ArrowRight, Eye, Trash2, BrainCircuit, ChevronDown, Hash, Search } from './Icons';
import ValidationForm from './ValidationForm';
import { getConfidenceColor, getConfidenceLabel, downloadAsJSON, formatDate } from '../utils/helpers';
import { enrichBatchItemsForExport } from '../services/productMatchService';
import { ApiError } from '../services/apiClient';

interface ResultsDashboardProps {
  results: BatchItem[];
  onBack: () => void;
  onClearHistory?: () => void;
  onUpdateItem?: (item: BatchItem) => void; // Call back to update parent
}

type SortKey = 'processedAt' | 'invoiceDate' | 'mawb';
type SortDirection = 'asc' | 'desc';

const toSortableDate = (dateValue?: string): number => {
  if (!dateValue) return 0;

  const dateOnlyMatch = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    return Number(`${dateOnlyMatch[1]}${dateOnlyMatch[2]}${dateOnlyMatch[3]}`);
  }

  const timestamp = new Date(dateValue).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

const getSortValue = (item: BatchItem, key: SortKey): string | number => {
  if (key === 'processedAt') {
    return toSortableDate(item.processedAt || item.createdAt);
  }

  if (key === 'invoiceDate') {
    return toSortableDate(item.result?.date?.trim());
  }

  return item.result?.mawb?.trim().toLowerCase() || '';
};

const ResultsDashboard: React.FC<ResultsDashboardProps> = ({ results, onBack, onClearHistory, onUpdateItem }) => {
  const [viewingItem, setViewingItem] = useState<BatchItem | null>(null);
  const [selectedAwb, setSelectedAwb] = useState('ALL');
  const [awbSearch, setAwbSearch] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection } | null>(null);
  const [isAwbMenuOpen, setIsAwbMenuOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [downloadNotice, setDownloadNotice] = useState<{ tone: 'error' | 'warning' | 'success'; message: string } | null>(null);
  const awbMenuRef = useRef<HTMLDivElement | null>(null);
  const awbSearchInputRef = useRef<HTMLInputElement | null>(null);
  const successCount = results.filter(r => r.status === 'SUCCESS').length;
  const errorCount = results.filter(r => r.status === 'ERROR').length;

  const awbCounts = useMemo(() => {
    const counts = new Map<string, number>();

    results.forEach((item) => {
      const awb = item.result?.mawb?.trim();
      if (!awb) {
        return;
      }

      counts.set(awb, (counts.get(awb) || 0) + 1);
    });

    return counts;
  }, [results]);

  const awbOptions = useMemo(() => {
    return Array.from(awbCounts.keys()).sort((left, right) => left.localeCompare(right));
  }, [awbCounts]);

  const filteredAwbOptions = useMemo(() => {
    const normalizedSearch = awbSearch.trim().toLowerCase();
    const compactSearch = normalizedSearch.replace(/[^a-z0-9]/g, '');
    if (!normalizedSearch) {
      return awbOptions;
    }

    return awbOptions.filter((awb) => {
      const normalizedAwb = awb.toLowerCase();
      const compactAwb = normalizedAwb.replace(/[^a-z0-9]/g, '');
      return normalizedAwb.includes(normalizedSearch) || Boolean(compactSearch && compactAwb.includes(compactSearch));
    });
  }, [awbOptions, awbSearch]);

  const filteredResults = useMemo(() => {
    if (selectedAwb === 'ALL') {
      return results;
    }

    return results.filter((item) => item.result?.mawb?.trim() === selectedAwb);
  }, [results, selectedAwb]);

  const sortedResults = useMemo(() => {
    if (!sortConfig) {
      return filteredResults;
    }

    return [...filteredResults].sort((left, right) => {
      const leftValue = getSortValue(left, sortConfig.key);
      const rightValue = getSortValue(right, sortConfig.key);

      const comparison = typeof leftValue === 'number' && typeof rightValue === 'number'
        ? leftValue - rightValue
        : String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true });

      return sortConfig.direction === 'asc' ? comparison : -comparison;
    });
  }, [filteredResults, sortConfig]);

  const filteredSuccessResults = filteredResults.filter((item) => item.status === 'SUCCESS' && item.result);
  const selectedAwbLabel = selectedAwb === 'ALL' ? 'Todas las AWB' : selectedAwb;
  const isSearchingAwb = awbSearch.trim().length > 0;

  useEffect(() => {
    if (selectedAwb !== 'ALL' && !awbCounts.has(selectedAwb)) {
      setSelectedAwb('ALL');
    }
  }, [awbCounts, selectedAwb]);

  useEffect(() => {
    if (!isAwbMenuOpen) {
      setAwbSearch('');
      return;
    }

    window.setTimeout(() => awbSearchInputRef.current?.focus(), 0);

    const handleClickOutside = (event: MouseEvent) => {
      if (!awbMenuRef.current) {
        return;
      }

      const target = event.target;
      if (target instanceof Node && !awbMenuRef.current.contains(target)) {
        setIsAwbMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isAwbMenuOpen]);

  const handleSelectAwb = (awb: string) => {
    setSelectedAwb(awb);
    setAwbSearch('');
    setIsAwbMenuOpen(false);
  };

  const toggleSort = (key: SortKey) => {
    setSortConfig((current) => {
      if (!current || current.key !== key) {
        return { key, direction: key === 'mawb' ? 'asc' : 'desc' };
      }

      return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
    });
  };

  const sortableHeader = (key: SortKey, label: string, className: string) => {
    const isActive = sortConfig?.key === key;
    const direction = isActive ? sortConfig.direction : undefined;

    return (
      <th className={className} aria-sort={isActive ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
        <button
          type="button"
          onClick={() => toggleSort(key)}
          className={`inline-flex items-center gap-1 rounded-md px-1.5 py-1 transition-colors ${isActive ? 'text-indigo-600 dark:text-indigo-300' : 'hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200'}`}
        >
          {label}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isActive ? 'opacity-100' : 'opacity-35'} ${direction === 'asc' ? 'rotate-180' : ''}`} />
        </button>
      </th>
    );
  };

  const handleDownloadAll = async () => {
    if (selectedAwb === 'ALL' || filteredSuccessResults.length === 0) {
      return;
    }

    setIsExporting(true);
    setDownloadNotice(null);

    try {
      const { items: exportItems, missingMatches } = await enrichBatchItemsForExport(filteredSuccessResults);
      const cleanData = exportItems.map(({ item, data }) => ({
        filename: item.fileName,
        processedAt: item.processedAt,
        ...data,
      }));

      const awbSuffix = selectedAwb.replace(/[^a-zA-Z0-9_-]+/g, '_');

      downloadAsJSON(cleanData, `TCBV_SESSION_EXPORT_${awbSuffix}_${new Date().getTime()}.json`);

      setDownloadNotice(
        missingMatches > 0
          ? {
              tone: 'warning',
              message: `Se exportó el JSON con ${missingMatches} line item(s) sin equivalencia en el catálogo vigente.`,
            }
          : {
              tone: 'success',
              message: 'Se exportó el JSON con matches aplicados sobre el catálogo vigente.',
            }
      );
    } catch (error) {
      setDownloadNotice({
        tone: 'error',
        message: error instanceof ApiError ? error.message : 'No fue posible enriquecer el JSON antes de descargar.',
      });
    } finally {
      setIsExporting(false);
    }
  };

  if (viewingItem && viewingItem.result) {
      return (
          // Reduced padding for modal mode to fit minimalist design
          <div className="p-4 h-full bg-slate-100 dark:bg-slate-900 overflow-hidden flex items-center justify-center">
             <ValidationForm 
                data={viewingItem.result} 
                onSave={(updatedData) => {
                    if (onUpdateItem) {
                        onUpdateItem({
                            ...viewingItem,
                            result: updatedData,
                        });
                    }
                    setViewingItem(null);
                }}
                onCancel={() => setViewingItem(null)}
             />
          </div>
      );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6 h-full flex flex-col">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex items-center gap-4">
          <div className="p-3 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 rounded-lg">
             <FileText className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-slate-500 dark:text-slate-400">Archivos Acumulados</p>
            <p className="text-2xl font-bold text-slate-800 dark:text-white">{results.length}</p>
          </div>
        </div>
        
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex items-center gap-4">
          <div className="p-3 bg-green-100 dark:bg-green-900/50 text-green-600 rounded-lg">
             <CheckCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-slate-500 dark:text-slate-400">Total Exitosos</p>
            <p className="text-2xl font-bold text-slate-800 dark:text-white">{successCount}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex items-center gap-4">
          <div className="p-3 bg-red-100 dark:bg-red-900/50 text-red-600 rounded-lg">
             <AlertCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-slate-500 dark:text-slate-400">Total Fallidos</p>
            <p className="text-2xl font-bold text-slate-800 dark:text-white">{errorCount}</p>
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex flex-col gap-3 bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 xl:flex-row xl:items-center xl:justify-between">
        <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
          Historial
        </h2>
         <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap sm:justify-end">
            <div className="relative" ref={awbMenuRef}>
              <button
                type="button"
                onClick={() => setIsAwbMenuOpen((current) => !current)}
                className="group flex min-w-[260px] items-center gap-3 rounded-xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100 px-3 py-2.5 text-left shadow-sm transition-all hover:border-indigo-200 hover:shadow-md dark:border-slate-700 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 dark:hover:border-indigo-500/50"
                aria-haspopup="listbox"
                aria-expanded={isAwbMenuOpen}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
                  <Hash className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">
                    Filtro AWB
                  </p>
                  <p className="truncate text-sm font-semibold text-slate-800 dark:text-white">
                    {selectedAwbLabel}
                  </p>
                </div>
                <div className="rounded-full bg-slate-200/70 px-2.5 py-1 text-xs font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-200">
                  {awbOptions.length}
                </div>
                <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${isAwbMenuOpen ? 'rotate-180 text-indigo-500' : 'group-hover:text-slate-600 dark:group-hover:text-slate-200'}`} />
              </button>

              {isAwbMenuOpen && (
                <div className="absolute right-0 z-20 mt-2 w-[320px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-200/80 dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/40">
                  <div className="border-b border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/70">
                    <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">Filtro AWB</p>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Selecciona una AWB para exportar una guía a la vez.</p>
                    <div className="relative mt-3">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        ref={awbSearchInputRef}
                        value={awbSearch}
                        onChange={(event) => setAwbSearch(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && filteredAwbOptions.length === 1) {
                            handleSelectAwb(filteredAwbOptions[0]);
                          }
                        }}
                        placeholder="Buscar AWB..."
                        className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm font-medium text-slate-700 outline-none transition-shadow placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                      />
                    </div>
                  </div>

                  <div className="max-h-72 space-y-1 overflow-auto p-2">
                    {!isSearchingAwb && (
                      <button
                        type="button"
                        onClick={() => handleSelectAwb('ALL')}
                        className={`flex w-full items-center rounded-xl px-3 py-2.5 text-left transition-colors ${selectedAwb === 'ALL' ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200' : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800'}`}
                      >
                        <div>
                          <p className="text-sm font-semibold">Todas las AWB</p>
                          <p className="text-xs text-slate-400 dark:text-slate-500">Solo visualiza la sesión completa</p>
                        </div>
                      </button>
                    )}

                    {filteredAwbOptions.map((awb) => {
                      const isSelected = selectedAwb === awb;

                      return (
                        <button
                          key={awb}
                          type="button"
                          onClick={() => handleSelectAwb(awb)}
                          className={`flex w-full items-center rounded-xl px-3 py-2.5 text-left transition-colors ${isSelected ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200' : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800'}`}
                        >
                          <div className="min-w-0 pr-3">
                            <p className="truncate font-mono text-sm font-semibold">{awb}</p>
                            <p className="text-xs text-slate-400 dark:text-slate-500">Filtra tabla y JSON por esta guía</p>
                          </div>
                        </button>
                      );
                    })}

                    {filteredAwbOptions.length === 0 && (
                      <div className="px-3 py-6 text-center text-sm text-slate-400 dark:text-slate-500">
                        No hay AWB que coincidan.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            {results.length > 0 && onClearHistory && (
                <button 
                  onClick={onClearHistory}
                  className="px-3 py-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                  title="Limpiar historial"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
            )}
            <button 
              onClick={onBack}
              className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors text-sm font-medium flex items-center gap-2"
            >
               Procesar más
               <ArrowRight className="w-4 h-4" />
            </button>
            <button 
              onClick={() => void handleDownloadAll()}
              disabled={selectedAwb === 'ALL' || filteredSuccessResults.length === 0 || isExporting}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" /> {isExporting ? 'Exportando...' : selectedAwb === 'ALL' ? 'Selecciona AWB' : 'Exportar AWB'}
            </button>
         </div>
      </div>

      {downloadNotice && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${downloadNotice.tone === 'error' ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200' : downloadNotice.tone === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200' : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200'}`}>
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{downloadNotice.message}</span>
          </div>
        </div>
      )}

      {/* Results Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden flex-1 flex flex-col">
        <div className="overflow-auto flex-1">
           {results.length === 0 ? (
             <div className="h-full flex flex-col items-center justify-center text-slate-400 p-12">
                <FileText className="w-12 h-12 mb-4 opacity-20" />
                <p>No hay facturas procesadas en esta sesión.</p>
             </div>
           ) : filteredResults.length === 0 ? (
             <div className="h-full flex flex-col items-center justify-center text-slate-400 p-12">
               <FileText className="w-12 h-12 mb-4 opacity-20" />
               <p>No hay resultados para la AWB seleccionada.</p>
             </div>
          ) : (
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900 uppercase border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
              <tr>
                <th className="px-6 py-3">Estado</th>
                {sortableHeader('processedAt', 'Proc.', 'px-4 py-2')}
                <th className="px-6 py-3">Archivo</th>
                {sortableHeader('invoiceDate', 'Fact.', 'px-4 py-2')}
                {sortableHeader('mawb', 'MAWB', 'px-6 py-2')}
                <th className="px-6 py-3">Invoice #</th>
                <th className="px-6 py-3 text-right">Piezas</th>
                <th className="px-6 py-3 text-right">Valor</th>
                {/* CONFIDENCE COLUMN */}
                <th className="px-6 py-3 text-center">Fiabilidad</th> 
                <th className="px-6 py-3 text-center">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {sortedResults.map((item) => {
                const confidence = item.result?.confidenceScore || 0;
                const isLowConfidence = item.status === 'SUCCESS' && confidence < 75;
                const processedAt = item.processedAt || item.createdAt;
                const invoiceDate = item.result?.date?.trim();
                const invoiceDateLabel = invoiceDate?.match(/^\d{4}-\d{2}-\d{2}$/) ? invoiceDate : invoiceDate ? formatDate(invoiceDate) : '-';
                
                return (
                <tr key={item.id} className={`hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors ${isLowConfidence ? 'bg-red-50/50 dark:bg-red-900/10' : ''}`}>
                  <td className="px-6 py-4">
                    {item.status === 'SUCCESS' ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
                        OK
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300">
                        Error
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {processedAt ? formatDate(processedAt) : '-'}
                  </td>
                  <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">
                    {item.fileName}
                    {item.error && <div className="text-xs text-red-500 mt-1">{item.error}</div>}
                  </td>
                  <td className="px-4 py-4 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {invoiceDateLabel}
                  </td>
                  <td className="px-6 py-4 font-mono text-slate-500 dark:text-slate-400">
                    {item.result?.mawb || '-'}
                  </td>
                  <td className="px-6 py-4 text-slate-500 dark:text-slate-400 font-mono">
                    {item.result?.invoiceNumber || '-'}
                  </td>
                  <td className="px-6 py-4 text-right font-mono text-slate-600 dark:text-slate-300">
                    {item.result?.totalPieces || '-'}
                  </td>
                  <td className="px-6 py-4 text-right font-mono text-emerald-600 dark:text-emerald-400 font-medium">
                    {item.result?.totalValue ? `$${item.result.totalValue}` : '-'}
                  </td>
                  
                  {/* CONFIDENCE COLUMN WITH PULSE */}
                  <td className="px-6 py-4 text-center">
                    {item.status === 'SUCCESS' && item.result?.confidenceScore !== undefined ? (
                       <div className="flex flex-col items-center gap-1">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${getConfidenceColor(item.result.confidenceScore)} ${isLowConfidence ? 'animate-pulse shadow-md shadow-red-200 dark:shadow-red-900/50' : ''}`}>
                             <BrainCircuit className="w-3 h-3" />
                             {item.result.confidenceScore}% {getConfidenceLabel(item.result.confidenceScore)}
                          </span>
                       </div>
                    ) : (
                       <span className="text-slate-300">-</span>
                    )}
                  </td>

                  <td className="px-6 py-4 text-center">
                     {item.status === 'SUCCESS' && (
                        <button 
                           onClick={() => setViewingItem(item)}
                           className={`p-2 rounded-lg transition-colors ${isLowConfidence ? 'text-red-600 bg-red-100 hover:bg-red-200' : 'text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50'}`}
                           title="Ver detalle"
                        >
                           <Eye className="w-5 h-5" />
                        </button>
                     )}
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResultsDashboard;
