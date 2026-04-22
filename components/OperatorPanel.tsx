import React, { useMemo, useState } from 'react';
import { Agency, BatchItem } from '../types';
import { buildInvoicedAwbRecords, getOperationDateKey } from '../services/operationalService';
import { downloadAsJSON, formatDateTime, formatNumber } from '../utils/helpers';
import { AlertCircle, CheckCircle, Download, FileText, Hash, Package, Plane } from './Icons';

interface OperatorPanelProps {
  results: BatchItem[];
  currentAgencyId: string;
  currentAgency?: Agency;
}

const LOW_CONFIDENCE_THRESHOLD = 75;

const sanitizeFileSegment = (value: string): string => value.replace(/[^a-zA-Z0-9_-]+/g, '_');

const OperatorPanel: React.FC<OperatorPanelProps> = ({ results, currentAgencyId, currentAgency }) => {
  const [operationDate, setOperationDate] = useState<string>(getOperationDateKey());

  const filteredDayResults = useMemo(() => {
    return results
      .filter((item) => currentAgencyId === 'GLOBAL' || item.agencyId === currentAgencyId)
      .filter((item) => getOperationDateKey(item.processedAt) === operationDate);
  }, [currentAgencyId, operationDate, results]);

  const filteredSuccessResults = useMemo(() => {
    return filteredDayResults
      .filter((item) => item.status === 'SUCCESS' && item.result)
  }, [filteredDayResults]);

  const incidentResults = useMemo(() => {
    return filteredDayResults
      .filter((item) => item.status === 'ERROR' || ((item.result?.confidenceScore ?? 100) < LOW_CONFIDENCE_THRESHOLD))
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
    });
  }, [currentAgencyId, operationDate, results]);

  const awbRows = useMemo(() => {
    return invoicedAwbs.map((record) => {
      const documents = awbDocuments.get(record.mawb) || [];
      const needsReview = documents.some((item) => (item.result?.confidenceScore ?? 0) < LOW_CONFIDENCE_THRESHOLD);

      return {
        ...record,
        documents,
        status: needsReview ? 'REVIEW' : 'READY',
      };
    });
  }, [awbDocuments, invoicedAwbs]);

  const totals = useMemo(() => {
    return awbRows.reduce((accumulator, row) => {
      accumulator.awbs += 1;
      accumulator.hijas += row.invoicedHijas;
      accumulator.pieces += row.invoicedPieces;
      accumulator.fulls += row.invoicedFulls;
      return accumulator;
    }, {
      awbs: 0,
      hijas: 0,
      pieces: 0,
      fulls: 0,
    });
  }, [awbRows]);

  const handleDownloadAwb = (mawb: string) => {
    const documents = (awbDocuments.get(mawb) || []).map((item) => ({
      filename: item.fileName,
      processedAt: item.processedAt,
      user: item.user,
      agencyId: item.agencyId,
      ...item.result,
    }));

    if (documents.length === 0) {
      return;
    }

    downloadAsJSON(documents, `AWB_${sanitizeFileSegment(mawb)}_${operationDate}.json`);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-8 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
            <Plane className="w-3 h-3" />
            Panel Diario
          </div>
          <h1 className="mt-4 text-3xl font-bold text-slate-800 dark:text-white">Panel</h1>
          <p className="mt-1 text-slate-500 dark:text-slate-400">
            {currentAgency?.name
              ? `Consolidado facturado por Master AWB para ${currentAgency.name}.`
              : 'Consolidado facturado por Master AWB a partir del historial procesado.'}
          </p>
        </div>

        <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row md:items-stretch">
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <label className="block text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">
              Fecha Operativa
            </label>
            <input
              type="date"
              value={operationDate}
              onChange={(event) => setOperationDate(event.target.value)}
              className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 md:w-56"
            />
          </div>

          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 shadow-sm dark:border-emerald-500/30 dark:bg-emerald-500/10">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-600 dark:text-emerald-300">
              Fuente
            </p>
            <p className="mt-3 text-sm font-semibold text-emerald-900 dark:text-emerald-100">
              Historial procesado del día seleccionado
            </p>
            <p className="mt-1 text-xs text-emerald-700/80 dark:text-emerald-200/80">
              Click en una AWB para descargar el JSON de sus facturas extraídas.
            </p>
          </div>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Master AWB</p>
            <Plane className="w-5 h-5 text-indigo-500" />
          </div>
          <h3 className="mt-5 text-4xl font-bold text-indigo-600 dark:text-indigo-400">{totals.awbs}</h3>
          <p className="mt-2 text-xs text-slate-400">Guías madre con facturación en la fecha elegida.</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Hijas Facturadas</p>
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
          <h3 className="mt-5 text-4xl font-bold text-slate-800 dark:text-white">{formatNumber(totals.pieces, 0)}</h3>
          <p className="mt-2 text-xs text-slate-400">Suma facturada de piezas dentro del día operativo.</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">EQ Full</p>
            <Hash className="w-5 h-5 text-emerald-500" />
          </div>
          <h3 className="mt-5 text-4xl font-bold text-emerald-600 dark:text-emerald-400">{formatNumber(totals.fulls)}</h3>
          <p className="mt-2 text-xs text-slate-400">Total consolidado de fulles facturados.</p>
        </div>
      </div>

      <div className={`mb-8 overflow-hidden rounded-2xl border shadow-sm ${incidentResults.length > 0 ? 'border-amber-200 bg-amber-50/80 dark:border-amber-500/30 dark:bg-amber-500/10' : 'border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10'}`}>
        <div className="flex flex-col gap-4 px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <div className={`rounded-xl p-2 ${incidentResults.length > 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'}`}>
              {incidentResults.length > 0 ? <AlertCircle className="w-5 h-5" /> : <CheckCircle className="w-5 h-5" />}
            </div>
            <div>
              <h3 className={`text-sm font-bold uppercase tracking-[0.18em] ${incidentResults.length > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300'}`}>
                Incidencias del día
              </h3>
              <p className={`mt-1 text-sm ${incidentResults.length > 0 ? 'text-amber-900 dark:text-amber-100' : 'text-emerald-900 dark:text-emerald-100'}`}>
                {incidentResults.length > 0
                  ? `${incidentResults.length} documento(s) requieren atención por error de extracción o baja confianza.`
                  : 'No se detectaron incidencias para la fecha operativa seleccionada.'}
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
                const incidentType = item.status === 'ERROR' ? 'Error de extracción' : 'Baja confianza';
                const incidentDetail = item.status === 'ERROR'
                  ? (item.error || 'El documento no pudo ser procesado.')
                  : `Confianza ${item.result?.confidenceScore ?? 0}% en ${item.result?.mawb?.trim() || 'SIN MAWB'}`;

                return (
                  <div key={item.id} className="rounded-2xl border border-amber-100 bg-white px-4 py-3 shadow-sm dark:border-amber-500/20 dark:bg-slate-900/70">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-800 dark:text-white">{item.fileName}</p>
                        <p className="mt-1 text-xs text-slate-400">
                          {item.processedAt ? formatDateTime(item.processedAt) : 'Sin fecha'}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${item.status === 'ERROR' ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'}`}>
                        {incidentType}
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{incidentDetail}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800 overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50 px-5 py-4 dark:border-slate-700 dark:bg-slate-900/50">
          <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-lg font-bold text-slate-800 dark:text-white">Consolidado por Master AWB</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">Solo facturado. La guía descarga su JSON consolidado al hacer click.</p>
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
                      <span>No hay facturas exitosas para la fecha operativa seleccionada.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                awbRows.map((row) => {
                  const displayMawb = row.mawb === 'UNKNOWN' ? 'SIN MAWB' : row.mawb;

                  return (
                    <tr key={`${row.mawb}-${row.operationDate}`} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                      <td className="px-6 py-4">
                        <button
                          type="button"
                          onClick={() => handleDownloadAwb(row.mawb)}
                          className="group flex items-center gap-3 text-left"
                          title="Descargar JSON de esta AWB"
                        >
                          <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-2 text-indigo-600 transition-colors group-hover:border-indigo-200 group-hover:bg-indigo-100 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300 dark:group-hover:bg-indigo-500/20">
                            <Download className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="font-mono text-sm font-bold text-indigo-600 dark:text-indigo-300">{displayMawb}</div>
                            <div className="text-xs text-slate-400">Descargar JSON extraído</div>
                          </div>
                        </button>
                      </td>
                      <td className="px-4 py-4 text-right font-semibold text-slate-700 dark:text-slate-200">{row.invoicedHijas}</td>
                      <td className="px-4 py-4 text-right font-semibold text-slate-700 dark:text-slate-200">{formatNumber(row.invoicedPieces, 0)}</td>
                      <td className="px-4 py-4 text-right font-bold text-emerald-600 dark:text-emerald-400">{formatNumber(row.invoicedFulls)}</td>
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

export default OperatorPanel;