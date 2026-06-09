import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Agency, BatchItem, BatchExportDocument } from '../types';
import {
  buildInvoicedAwbRecords,
  getBatchItemOperationDate,
  getOperationDateKey,
  getOperationDateRange,
  isOperationDateInRange,
} from '../services/operationalService';
import { downloadAsJSON, formatDateTime, formatNumber } from '../utils/helpers';
import {
  AlertCircle,
  Calendar,
  CheckCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Globe,
  Hash,
  Package,
  Plane,
  X,
} from './Icons';
import PageHeader from './PageHeader';
import {
  buildAwbExportFilename,
  buildBatchExportDocuments,
  enrichBatchItemsForExport,
} from '../services/productMatchService';
import { ApiError } from '../services/apiClient';
import { hasClientFieldMappings } from '../shared/integrationConfig';
import { executeIntegrationExport } from '../services/integrationExportService';

interface OperatorPanelProps {
  results: BatchItem[];
  currentAgencyId: string;
  currentAgency?: Agency;
  operationDate: string;
  onOperationDateChange: (date: string) => void;
}

type ExportMode = 'native' | 'client';

type ExportModalState = {
  mawb: string;
  documents: BatchExportDocument[];
  missingMatches: number;
};

const LOW_CONFIDENCE_THRESHOLD = 75;

const MONTHS_ES_FULL = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];
const MONTHS_ES_SHORT = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
];
const DAYS_ES_MIN = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'];

const formatOperationDateDisplay = (dateStr: string): string => {
  if (!dateStr) return 'Seleccionar';
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  return `${d} ${MONTHS_ES_SHORT[m - 1]} ${y}`;
};

const OperatorPanel: React.FC<OperatorPanelProps> = ({
  results,
  currentAgencyId,
  currentAgency,
  operationDate,
  onOperationDateChange,
}) => {
  const [exportingMawb, setExportingMawb] = useState<string | null>(null);
  const [exportNotice, setExportNotice] = useState<{
    tone: 'error' | 'warning' | 'success';
    message: string;
  } | null>(null);
  const [exportModal, setExportModal] = useState<ExportModalState | null>(null);
  const [selectedExportMode, setSelectedExportMode] = useState<ExportMode>('native');
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());
  const datePickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isDatePickerOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (datePickerRef.current && !datePickerRef.current.contains(e.target as Node)) {
        setIsDatePickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [isDatePickerOpen]);

  const openDatePicker = () => {
    const [y, m] = operationDate.split('-').map(Number);
    if (y && m) {
      setViewYear(y);
      setViewMonth(m - 1);
    }
    setIsDatePickerOpen((v) => !v);
  };

  const goToMonth = (dir: -1 | 1) => {
    setViewMonth((m) => {
      const next = m + dir;
      if (next < 0) {
        setViewYear((y) => y - 1);
        return 11;
      }
      if (next > 11) {
        setViewYear((y) => y + 1);
        return 0;
      }
      return next;
    });
  };

  const handleDaySelect = (day: number) => {
    const val = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    onOperationDateChange(val);
    setIsDatePickerOpen(false);
  };

  const handleGoToday = () => {
    const today = getOperationDateKey();
    onOperationDateChange(today);
    const [y, m] = today.split('-').map(Number);
    setViewYear(y);
    setViewMonth(m - 1);
    setIsDatePickerOpen(false);
  };

  const calendarGrid = useMemo(() => {
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
    const totalCells = Math.ceil((firstDayOfWeek + daysInMonth) / 7) * 7;
    return { daysInMonth, firstDayOfWeek, totalCells };
  }, [viewYear, viewMonth]);

  const operationDateRange = useMemo(() => getOperationDateRange(operationDate), [operationDate]);
  const operationDateRangeLabel = `${formatOperationDateDisplay(operationDateRange.startDate)} - ${formatOperationDateDisplay(operationDateRange.endDate)}`;

  const filteredDayResults = useMemo(() => {
    return results
      .filter((item) => currentAgencyId === 'GLOBAL' || item.agencyId === currentAgencyId)
      .filter((item) =>
        isOperationDateInRange(
          getBatchItemOperationDate(item),
          operationDateRange.startDate,
          operationDateRange.endDate,
        ),
      );
  }, [currentAgencyId, operationDateRange.endDate, operationDateRange.startDate, results]);

  const filteredSuccessResults = useMemo(() => {
    return filteredDayResults.filter((item) => item.status === 'SUCCESS' && item.result);
  }, [filteredDayResults]);

  const incidentResults = useMemo(() => {
    return filteredDayResults
      .filter(
        (item) =>
          item.status === 'ERROR' ||
          (item.result?.confidenceScore ?? 100) < LOW_CONFIDENCE_THRESHOLD,
      )
      .sort((left, right) => {
        const leftTime = left.processedAt ? new Date(left.processedAt).getTime() : 0;
        const rightTime = right.processedAt ? new Date(right.processedAt).getTime() : 0;
        return rightTime - leftTime;
      });
  }, [filteredDayResults]);

  const awbDocuments = useMemo(() => {
    const documents = new Map<string, BatchItem[]>();

    filteredSuccessResults.forEach((item) => {
      const mawb = item.result?.mawb?.trim() || 'UNKNOWN';
      const current = documents.get(mawb) || [];
      current.push(item);
      documents.set(mawb, current);
    });

    return documents;
  }, [filteredSuccessResults]);

  const invoicedAwbs = useMemo(() => {
    return buildInvoicedAwbRecords(results, {
      agencyId: currentAgencyId,
      operationDate,
      operationDateStart: operationDateRange.startDate,
      operationDateEnd: operationDateRange.endDate,
    });
  }, [
    currentAgencyId,
    operationDate,
    operationDateRange.endDate,
    operationDateRange.startDate,
    results,
  ]);

  const awbRows = useMemo(() => {
    return invoicedAwbs.map((record) => {
      const documents = awbDocuments.get(record.mawb) || [];
      const needsReview = documents.some(
        (item) => (item.result?.confidenceScore ?? 0) < LOW_CONFIDENCE_THRESHOLD,
      );

      return {
        ...record,
        documents,
        status: needsReview ? 'REVIEW' : 'READY',
      };
    });
  }, [awbDocuments, invoicedAwbs]);

  const totals = useMemo(() => {
    return awbRows.reduce(
      (accumulator, row) => {
        accumulator.awbs += 1;
        accumulator.hijas += row.invoicedHijas;
        accumulator.pieces += row.invoicedPieces;
        accumulator.fulls += row.invoicedFulls;
        return accumulator;
      },
      {
        awbs: 0,
        hijas: 0,
        pieces: 0,
        fulls: 0,
      },
    );
  }, [awbRows]);

  const hasClientMapping = hasClientFieldMappings(currentAgency?.integrationConfig);

  const finalizeDownload = useCallback(
    async ({
      mawb,
      documents,
      missingMatches,
      useClientMapping,
    }: {
      mawb: string;
      documents: BatchExportDocument[];
      missingMatches: number;
      useClientMapping: boolean;
    }) => {
      const filename = buildAwbExportFilename(mawb);
      const exportResult = await executeIntegrationExport({
        agency: currentAgency,
        documents,
        useClientMapping,
        source: 'operator_panel',
        exportReference: mawb,
        exportFilename: filename,
      });

      downloadAsJSON(exportResult.exportedDocuments, filename);

      const mappingMessage = exportResult.usedClientMapping
        ? ' usando el mapping del cliente'
        : ' usando el mapping nativo';
      const deliveryMessage = exportResult.deliveryResult
        ? exportResult.deliveryResult.ok
          ? ' También se envió al endpoint del cliente.'
          : ` El envío al endpoint del cliente falló: ${exportResult.deliveryResult.error || exportResult.deliveryResult.statusCode || 'sin detalle'}.`
        : '';

      setExportNotice(
        missingMatches > 0
          ? {
              tone:
                exportResult.deliveryResult && !exportResult.deliveryResult.ok
                  ? 'error'
                  : 'warning',
              message: `La AWB ${mawb === 'UNKNOWN' ? 'SIN MAWB' : mawb} se exportó${mappingMessage} con ${missingMatches} line item(s) sin equivalencia.${deliveryMessage}`,
            }
          : {
              tone:
                exportResult.deliveryResult && !exportResult.deliveryResult.ok
                  ? 'error'
                  : 'success',
              message: `La AWB ${mawb === 'UNKNOWN' ? 'SIN MAWB' : mawb} se exportó${mappingMessage} con el catálogo vigente aplicado.${deliveryMessage}`,
            },
      );
    },
    [currentAgency],
  );

  const handleDownloadAwb = async (mawb: string) => {
    const sourceItems = awbDocuments.get(mawb) || [];

    if (sourceItems.length === 0) {
      return;
    }

    setExportingMawb(mawb);
    setExportNotice(null);

    try {
      const { items: exportItems, missingMatches } = await enrichBatchItemsForExport(sourceItems);
      const documents = buildBatchExportDocuments(exportItems);

      if (hasClientMapping) {
        setSelectedExportMode('native');
        setExportModal({ mawb, documents, missingMatches });
        return;
      }

      await finalizeDownload({
        mawb,
        documents,
        missingMatches,
        useClientMapping: false,
      });
    } catch (error) {
      setExportNotice({
        tone: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'No fue posible enriquecer el JSON antes de descargar esta AWB.',
      });
    } finally {
      setExportingMawb(null);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <PageHeader
        icon={<Plane className="h-3.5 w-3.5" />}
        badge="Panel Diario"
        title="Panel"
        subtitle={
          currentAgency?.name
            ? `Consolidado facturado por Master AWB para ${currentAgency.name}.`
            : 'Consolidado facturado por Master AWB a partir del historial procesado.'
        }
      >
        <div ref={datePickerRef} className="relative flex">
          <button
            type="button"
            onClick={openDatePicker}
            className="group flex h-full min-h-[112px] w-full cursor-pointer flex-col justify-center gap-2 rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100 px-4 py-4 shadow-sm transition-all hover:border-indigo-300 hover:shadow-md active:scale-[0.99] dark:border-slate-700 dark:from-slate-800 dark:via-slate-800 dark:to-slate-900 dark:hover:border-indigo-500/60 md:w-64"
            aria-label="Seleccionar rango operativo"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">
                Rango Operativo
              </span>
              <ChevronDown
                className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${isDatePickerOpen ? 'rotate-180 text-indigo-500' : 'group-hover:text-indigo-500'}`}
              />
            </div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600 transition-colors group-hover:bg-indigo-200 dark:bg-indigo-500/20 dark:text-indigo-300 dark:group-hover:bg-indigo-500/30">
                <Calendar className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <span className="block text-sm font-bold text-slate-800 dark:text-white">
                  {formatOperationDateDisplay(operationDate)}
                </span>
                <span className="mt-0.5 block text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  {operationDateRangeLabel}
                </span>
              </div>
            </div>
          </button>

          {isDatePickerOpen && (
            <div className="absolute left-0 top-[calc(100%+8px)] z-50 w-72 rounded-2xl border border-slate-200 bg-white shadow-xl ring-1 ring-slate-900/5 dark:border-slate-700 dark:bg-slate-800 dark:ring-white/10">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => goToMonth(-1)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-white"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-sm font-bold capitalize text-slate-800 dark:text-white">
                  {MONTHS_ES_FULL[viewMonth]} {viewYear}
                </span>
                <button
                  type="button"
                  onClick={() => goToMonth(1)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-white"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              <div className="grid grid-cols-7 px-3 pt-3">
                {DAYS_ES_MIN.map((d) => (
                  <div
                    key={d}
                    className="flex h-8 items-center justify-center text-[10px] font-bold uppercase text-slate-400"
                  >
                    {d}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 px-3 pb-2">
                {Array.from({ length: calendarGrid.totalCells }, (_, i) => {
                  const day = i - calendarGrid.firstDayOfWeek + 1;
                  if (day < 1 || day > calendarGrid.daysInMonth) return <div key={i} />;
                  const val = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const isSelected = val === operationDate;
                  const isToday = val === getOperationDateKey();
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleDaySelect(day)}
                      className={`flex h-9 items-center justify-center rounded-lg text-sm font-medium transition-all active:scale-95
                        ${
                          isSelected
                            ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200 dark:shadow-indigo-900/50'
                            : isToday
                              ? 'border border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-300 dark:hover:bg-indigo-500/20'
                              : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
                        }`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>

              <div className="border-t border-slate-100 px-3 py-2.5 dark:border-slate-700">
                <button
                  type="button"
                  onClick={handleGoToday}
                  className="w-full rounded-lg bg-indigo-50 py-1.5 text-xs font-bold text-indigo-600 transition-colors hover:bg-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300 dark:hover:bg-indigo-500/20"
                >
                  Ir a hoy
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex min-h-[112px] flex-col justify-center rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 shadow-sm dark:border-emerald-500/30 dark:bg-emerald-500/10">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-600 dark:text-emerald-300">
            Fuente
          </p>
          <p className="mt-3 text-sm font-semibold text-emerald-900 dark:text-emerald-100">
            Historial procesado del rango operativo
          </p>
          <p className="mt-1 text-xs text-emerald-700/80 dark:text-emerald-200/80">
            Click en una AWB para descargar el JSON de sus facturas extraídas.
          </p>
        </div>
      </PageHeader>

      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Master AWB</p>
            <Plane className="w-5 h-5 text-indigo-500" />
          </div>
          <h3 className="mt-5 text-4xl font-bold text-indigo-600 dark:text-indigo-400">
            {totals.awbs}
          </h3>
          <p className="mt-2 text-xs text-slate-400">
            Guías madre con facturación en el rango elegido.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
              Hijas Facturadas
            </p>
            <FileText className="w-5 h-5 text-slate-500" />
          </div>
          <h3 className="mt-5 text-4xl font-bold text-slate-800 dark:text-white">{totals.hijas}</h3>
          <p className="mt-2 text-xs text-slate-400">Documentos exitosos agrupados por Master.</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Piezas</p>
            <Package className="w-5 h-5 text-amber-500" />
          </div>
          <h3 className="mt-5 text-4xl font-bold text-slate-800 dark:text-white">
            {formatNumber(totals.pieces, 0)}
          </h3>
          <p className="mt-2 text-xs text-slate-400">
            Suma facturada de piezas dentro del rango operativo.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">EQ Full</p>
            <Hash className="w-5 h-5 text-emerald-500" />
          </div>
          <h3 className="mt-5 text-4xl font-bold text-emerald-600 dark:text-emerald-400">
            {formatNumber(totals.fulls)}
          </h3>
          <p className="mt-2 text-xs text-slate-400">Total consolidado de fulles facturados.</p>
        </div>
      </div>

      <div
        className={`mb-8 overflow-hidden rounded-2xl border shadow-sm ${incidentResults.length > 0 ? 'border-amber-200 bg-amber-50/80 dark:border-amber-500/30 dark:bg-amber-500/10' : 'border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10'}`}
      >
        <div className="flex flex-col gap-4 px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <div
              className={`rounded-xl p-2 ${incidentResults.length > 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'}`}
            >
              {incidentResults.length > 0 ? (
                <AlertCircle className="w-5 h-5" />
              ) : (
                <CheckCircle className="w-5 h-5" />
              )}
            </div>
            <div>
              <h3
                className={`text-sm font-bold uppercase tracking-[0.18em] ${incidentResults.length > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300'}`}
              >
                Incidencias del rango
              </h3>
              <p
                className={`mt-1 text-sm ${incidentResults.length > 0 ? 'text-amber-900 dark:text-amber-100' : 'text-emerald-900 dark:text-emerald-100'}`}
              >
                {incidentResults.length > 0
                  ? `${incidentResults.length} documento(s) requieren atención por error de extracción o baja confianza.`
                  : 'No se detectaron incidencias para el rango operativo seleccionado.'}
              </p>
            </div>
          </div>
          {incidentResults.length > 0 && (
            <div className="rounded-full bg-white/80 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-amber-700 shadow-sm dark:bg-slate-900/70 dark:text-amber-300">
              Revisar historial
            </div>
          )}
        </div>

        {incidentResults.length > 0 && (
          <div className="border-t border-amber-200/70 bg-white/70 px-3 py-3 dark:border-amber-500/20 dark:bg-slate-900/40">
            <div className="grid gap-3 lg:grid-cols-2">
              {incidentResults.map((item) => {
                const incidentType =
                  item.status === 'ERROR' ? 'Error de extracción' : 'Baja confianza';
                const incidentDetail =
                  item.status === 'ERROR'
                    ? item.error || 'El documento no pudo ser procesado.'
                    : `Confianza ${item.result?.confidenceScore ?? 0}% en ${item.result?.mawb?.trim() || 'SIN MAWB'}`;

                return (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-amber-100 bg-white px-4 py-3 shadow-sm dark:border-amber-500/20 dark:bg-slate-900/70"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-800 dark:text-white">
                          {item.fileName}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          {item.processedAt ? formatDateTime(item.processedAt) : 'Sin fecha'}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${item.status === 'ERROR' ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'}`}
                      >
                        {incidentType}
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                      {incidentDetail}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {exportNotice && (
        <div
          className={`mb-8 rounded-2xl border px-5 py-4 text-sm ${exportNotice.tone === 'error' ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200' : exportNotice.tone === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200' : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200'}`}
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{exportNotice.message}</span>
          </div>
        </div>
      )}

      {exportModal && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5 dark:border-slate-800">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
                  Exportación JSON
                </p>
                <h3 className="mt-2 text-2xl font-bold text-slate-800 dark:text-white">
                  Selecciona el mapping para esta descarga
                </h3>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                  Esta agencia tiene un mapping cliente configurado. Puedes descargar con formato
                  Smart Invoice o con formato del cliente.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setExportModal(null)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-5 px-6 py-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setSelectedExportMode('native')}
                  className={`rounded-2xl border px-5 py-5 text-left transition-all ${selectedExportMode === 'native' ? 'border-indigo-300 bg-indigo-50 shadow-sm dark:border-indigo-500/40 dark:bg-indigo-500/10' : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-950 dark:hover:border-slate-500'}`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl ${selectedExportMode === 'native' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300'}`}
                    >
                      <FileText className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800 dark:text-white">
                        Usar mapping nuestro
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                        Descarga el JSON con el formato nativo Smart Invoice.
                      </p>
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedExportMode('client')}
                  className={`rounded-2xl border px-5 py-5 text-left transition-all ${selectedExportMode === 'client' ? 'border-emerald-300 bg-emerald-50 shadow-sm dark:border-emerald-500/40 dark:bg-emerald-500/10' : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-950 dark:hover:border-slate-500'}`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl ${selectedExportMode === 'client' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300'}`}
                    >
                      <Globe className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800 dark:text-white">
                        Usar mapping del cliente
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                        Renombra las claves del JSON según la configuración de integración y, si el
                        endpoint está activo, también lo envía.
                      </p>
                    </div>
                  </div>
                </button>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-700 dark:bg-slate-950/50">
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                  <span className="rounded-full bg-white px-2.5 py-1 font-semibold ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700">
                    MAWB: {exportModal.mawb}
                  </span>
                  <span className="rounded-full bg-white px-2.5 py-1 font-semibold ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700">
                    {exportModal.documents.length} documento(s)
                  </span>
                  <span className="rounded-full bg-white px-2.5 py-1 font-semibold ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700">
                    {Object.keys(currentAgency?.integrationConfig?.fieldMappings || {}).length}{' '}
                    mapping(s)
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-slate-100 px-6 py-5 sm:flex-row sm:justify-end dark:border-slate-800">
              <button
                type="button"
                onClick={() => setExportModal(null)}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  const payload = exportModal;
                  setExportModal(null);
                  setExportingMawb(payload.mawb);
                  void finalizeDownload({
                    mawb: payload.mawb,
                    documents: payload.documents,
                    missingMatches: payload.missingMatches,
                    useClientMapping: selectedExportMode === 'client',
                  }).finally(() => setExportingMawb(null));
                }}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
              >
                <Download className="h-4 w-4" /> Descargar JSON
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800 overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50 px-5 py-4 dark:border-slate-700 dark:bg-slate-900/50">
          <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-lg font-bold text-slate-800 dark:text-white">
                Consolidado por Master AWB
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Solo facturado. La guía descarga su JSON consolidado al hacer click.
              </p>
            </div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              {awbRows.length} AWB visibles
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900 dark:text-slate-400">
              <tr>
                <th className="px-6 py-4">Master AWB</th>
                <th className="px-4 py-4 text-right">Hijas</th>
                <th className="px-4 py-4 text-right">Piezas</th>
                <th className="px-4 py-4 text-right">EQ Full</th>
                <th className="px-6 py-4 text-center">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {awbRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-14 text-center text-slate-400">
                    <div className="flex flex-col items-center gap-2">
                      <Package className="w-8 h-8 opacity-20" />
                      <span>No hay facturas exitosas para el rango operativo seleccionado.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                awbRows.map((row) => {
                  const displayMawb = row.mawb === 'UNKNOWN' ? 'SIN MAWB' : row.mawb;

                  return (
                    <tr
                      key={`${row.mawb}-${row.operationDate}`}
                      className="hover:bg-slate-50 dark:hover:bg-slate-700/40"
                    >
                      <td className="px-6 py-4">
                        <button
                          type="button"
                          onClick={() => void handleDownloadAwb(row.mawb)}
                          className="group flex items-center gap-3 text-left"
                          title="Descargar JSON de esta AWB"
                          disabled={exportingMawb === row.mawb}
                        >
                          <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-2 text-indigo-600 transition-colors group-hover:border-indigo-200 group-hover:bg-indigo-100 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300 dark:group-hover:bg-indigo-500/20">
                            <Download className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="font-mono text-sm font-bold text-indigo-600 dark:text-indigo-300">
                              {displayMawb}
                            </div>
                            <div className="text-xs text-slate-400">
                              {exportingMawb === row.mawb
                                ? 'Exportando...'
                                : 'Descargar JSON extraído'}
                            </div>
                          </div>
                        </button>
                      </td>
                      <td className="px-4 py-4 text-right font-semibold text-slate-700 dark:text-slate-200">
                        {row.invoicedHijas}
                      </td>
                      <td className="px-4 py-4 text-right font-semibold text-slate-700 dark:text-slate-200">
                        {formatNumber(row.invoicedPieces, 0)}
                      </td>
                      <td className="px-4 py-4 text-right font-bold text-emerald-600 dark:text-emerald-400">
                        {formatNumber(row.invoicedFulls)}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {row.status === 'READY' ? (
                          <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                            <CheckCircle className="w-3 h-3" /> Listo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-lg border border-amber-100 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                            <AlertCircle className="w-3 h-3" /> Revisar
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default React.memo(OperatorPanel);
