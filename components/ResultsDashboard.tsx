
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BatchItem } from '../types';
import { CheckCircle, AlertCircle, FileText, Download, ArrowRight, Eye, Trash2, ChevronDown, Hash, Search, Package, Calendar, X, Grid, List } from './Icons';
import ValidationForm from './ValidationForm';
import { getConfidenceLabel, getConfidenceLevel, downloadAsJSON, formatDate, formatCurrency } from '../utils/helpers';
import { buildAwbExportFilename, buildBatchExportDocuments, enrichBatchItemsForExport } from '../services/productMatchService';
import { ApiError } from '../services/apiClient';

interface ResultsDashboardProps {
  results: BatchItem[];
  onBack: () => void;
  onClearHistory?: () => void;
  onUpdateItem?: (item: BatchItem) => void; // Call back to update parent
}

type SortKey = 'processedAt' | 'invoiceDate' | 'mawb';
type SortDirection = 'asc' | 'desc';
type ColumnFilterKey = 'processedDate' | 'invoiceDate' | 'mawb' | 'hawb' | 'invoiceNumber';
type GroupByKey = 'none' | 'mawb' | 'hawb' | 'processedDate';

type GroupOption = {
  key: GroupByKey;
  label: string;
  description: string;
};

type HistoryGroup = {
  id: string;
  label: string;
  fieldLabel: string;
  items: BatchItem[];
  itemCount: number;
  pieceCount: number;
  hawbCount: number;
  valueTotal: number;
};

type MutableHistoryGroup = Omit<HistoryGroup, 'hawbCount'> & {
  hawbs: Set<string>;
};

const GROUP_OPTIONS: GroupOption[] = [
  { key: 'none', label: 'Sin agrupar', description: 'Vista normal de registros' },
  { key: 'mawb', label: 'MAWB', description: 'Agrupa por master AWB' },
  { key: 'hawb', label: 'HAWB', description: 'Agrupa por house AWB' },
  { key: 'processedDate', label: 'Fecha procesada', description: 'Agrupa por día procesado' },
];

const toSortableDate = (dateValue?: string): number => {
  if (!dateValue) return 0;

  const dateOnlyMatch = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    return Number(`${dateOnlyMatch[1]}${dateOnlyMatch[2]}${dateOnlyMatch[3]}`);
  }

  const timestamp = new Date(dateValue).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

const formatDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toDateKey = (dateValue?: string): string => {
  const trimmedValue = dateValue?.trim();
  if (!trimmedValue) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmedValue)) return trimmedValue;

  const date = new Date(trimmedValue);
  if (Number.isNaN(date.getTime())) return '';
  return formatDateKey(date);
};

const getProcessedDateKey = (item: BatchItem): string => toDateKey(item.processedAt || item.createdAt);

const getInvoiceDateKey = (item: BatchItem): string => toDateKey(item.result?.date);

const getGroupFieldLabel = (groupBy: GroupByKey): string => {
  if (groupBy === 'mawb') return 'MAWB';
  if (groupBy === 'hawb') return 'HAWB';
  if (groupBy === 'processedDate') return 'Fecha procesada';
  return 'Sin agrupar';
};

const getGroupValue = (item: BatchItem, groupBy: GroupByKey): { id: string; label: string; fieldLabel: string } => {
  const fieldLabel = getGroupFieldLabel(groupBy);

  if (groupBy === 'mawb') {
    const value = item.result?.mawb?.trim();
    return { id: value || '__empty_mawb', label: value || 'Sin MAWB', fieldLabel };
  }

  if (groupBy === 'hawb') {
    const value = item.result?.hawb?.trim();
    return { id: value || '__empty_hawb', label: value || 'Sin HAWB', fieldLabel };
  }

  if (groupBy === 'processedDate') {
    const dateKey = getProcessedDateKey(item);
    return { id: dateKey || '__empty_processed_date', label: dateKey ? formatDate(dateKey) : 'Sin fecha procesada', fieldLabel };
  }

  return { id: '__all', label: 'Sin agrupar', fieldLabel };
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

const getConfidenceTextColor = (score: number): string => {
  const level = getConfidenceLevel(score);
  if (level === 'high') return 'text-emerald-600 dark:text-emerald-400';
  if (level === 'medium') return 'text-amber-600 dark:text-amber-400';
  return 'text-rose-600 dark:text-rose-400';
};

type HistoryTooltipDetail = {
  label: string;
  value?: React.ReactNode;
  tone?: 'neutral' | 'danger';
};

type HistoryTooltipState = {
  left: number;
  top: number;
  width: number;
  placement: 'top' | 'bottom';
};

const hasDetailValue = (detail: HistoryTooltipDetail): boolean => {
  if (detail.value === null || detail.value === undefined) return false;
  if (typeof detail.value === 'string') return detail.value.trim().length > 0;
  return true;
};

const hasTooltipDetails = (details?: HistoryTooltipDetail[]): boolean => Boolean(details?.some(hasDetailValue));

interface HistoryTooltipAnchorProps {
  tooltipTitle: string;
  tooltipValue: React.ReactNode;
  details?: HistoryTooltipDetail[];
  showOnlyWhenOverflow?: boolean;
  className?: string;
  children: React.ReactNode;
}

const HistoryTooltipAnchor: React.FC<HistoryTooltipAnchorProps> = ({
  tooltipTitle,
  tooltipValue,
  details,
  showOnlyWhenOverflow = false,
  className = '',
  children,
}) => {
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const [tooltip, setTooltip] = useState<HistoryTooltipState | null>(null);

  const hideTooltip = () => setTooltip(null);

  const showTooltip = () => {
    const anchor = anchorRef.current;
    if (!anchor) return;

    const overflowTarget = anchor.querySelector<HTMLElement>('[data-history-tooltip-measure]') || anchor;
    const isOverflowing = overflowTarget.scrollWidth > overflowTarget.clientWidth + 1 || overflowTarget.scrollHeight > overflowTarget.clientHeight + 1;
    const shouldShow = !showOnlyWhenOverflow || isOverflowing || hasTooltipDetails(details);

    if (!shouldShow) {
      setTooltip(null);
      return;
    }

    const rect = anchor.getBoundingClientRect();
    const width = Math.max(160, Math.min(260, window.innerWidth - 32));
    const maxLeft = Math.max(12, window.innerWidth - width - 12);
    const left = Math.min(Math.max(rect.left + rect.width / 2 - width / 2, 12), maxLeft);
    const placement = rect.top > 116 ? 'top' : 'bottom';
    const top = placement === 'top' ? rect.top - 8 : rect.bottom + 8;

    setTooltip({ left, top, width, placement });
  };

  return (
    <span
      ref={anchorRef}
      className={`inline-flex items-center ${className}`}
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          hideTooltip();
        }
      }}
    >
      {children}
      {tooltip && createPortal(
        <div
          role="tooltip"
          style={{ left: tooltip.left, top: tooltip.top, width: tooltip.width }}
          className={`pointer-events-none fixed z-[80] rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-left text-xs text-slate-700 shadow-lg shadow-slate-900/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 ${tooltip.placement === 'top' ? '-translate-y-full' : ''}`}
        >
          <div
            className={`absolute left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 ${tooltip.placement === 'top' ? '-bottom-1 border-b border-r' : '-top-1 border-l border-t'}`}
          />
          <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">{tooltipTitle}</p>
          <p className="mt-0.5 whitespace-normal break-words text-[12px] font-medium leading-snug text-slate-800 dark:text-slate-100">{tooltipValue}</p>
          {details?.filter(hasDetailValue).map((detail, index) => (
            <div
              key={`${detail.label}-${index}`}
              className={`mt-1.5 rounded-md px-2 py-1 ${detail.tone === 'danger' ? 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-200' : 'bg-slate-50 text-slate-700 dark:bg-slate-800/60 dark:text-slate-200'}`}
            >
              <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-400 dark:text-slate-500">{detail.label}</p>
              <p className="mt-0.5 whitespace-normal break-words text-[11px] font-medium leading-snug">{detail.value}</p>
            </div>
          ))}
        </div>,
        document.body
      )}
    </span>
  );
};

interface HistoryOverflowTextProps {
  label: string;
  value?: string | number | null;
  details?: HistoryTooltipDetail[];
  className?: string;
  textClassName?: string;
  emptyValue?: string;
}

const HistoryOverflowText: React.FC<HistoryOverflowTextProps> = ({
  label,
  value,
  details,
  className = '',
  textClassName = '',
  emptyValue = '-',
}) => {
  const displayValue = value === null || value === undefined || value === '' ? emptyValue : String(value);
  const hasUsefulTooltip = displayValue !== emptyValue || hasTooltipDetails(details);

  return (
    <HistoryTooltipAnchor
      tooltipTitle={label}
      tooltipValue={displayValue}
      details={details}
      showOnlyWhenOverflow
      className={`flex w-full min-w-0 items-center ${className}`}
    >
      <span
        data-history-tooltip-measure
        tabIndex={hasUsefulTooltip ? 0 : -1}
        className={`block w-full min-w-0 truncate rounded-md outline-none ${hasUsefulTooltip ? 'cursor-help focus-visible:ring-2 focus-visible:ring-indigo-500/35' : ''} ${textClassName}`}
      >
        {displayValue}
      </span>
    </HistoryTooltipAnchor>
  );
};

const formatPiecesValue = (value?: number): string => typeof value === 'number' ? value.toLocaleString('es-EC') : '-';

const formatCurrencyValue = (value?: number): string => typeof value === 'number' ? formatCurrency(value) : '-';

const ResultsDashboard: React.FC<ResultsDashboardProps> = ({ results, onBack, onClearHistory, onUpdateItem }) => {
  const [viewingItem, setViewingItem] = useState<BatchItem | null>(null);
  const [selectedAwb, setSelectedAwb] = useState('ALL');
  const [awbSearch, setAwbSearch] = useState('');
  const [globalSearch, setGlobalSearch] = useState('');
  const [processedDateFilter, setProcessedDateFilter] = useState('');
  const [invoiceDateFilter, setInvoiceDateFilter] = useState('');
  const [mawbFilter, setMawbFilter] = useState('');
  const [invoiceFilter, setInvoiceFilter] = useState('');
  const [hawbFilter, setHawbFilter] = useState('');
  const [groupBy, setGroupBy] = useState<GroupByKey>('none');
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(() => new Set());
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection } | null>(null);
  const [openColumnFilter, setOpenColumnFilter] = useState<ColumnFilterKey | null>(null);
  const [isAwbMenuOpen, setIsAwbMenuOpen] = useState(false);
  const [isGroupMenuOpen, setIsGroupMenuOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [downloadNotice, setDownloadNotice] = useState<{ tone: 'error' | 'warning' | 'success'; message: string } | null>(null);
  const awbMenuRef = useRef<HTMLDivElement | null>(null);
  const filterMenuRef = useRef<HTMLDivElement | null>(null);
  const groupMenuRef = useRef<HTMLDivElement | null>(null);
  const awbSearchInputRef = useRef<HTMLInputElement | null>(null);
  const activeFilterCount = [
    selectedAwb !== 'ALL',
    globalSearch.trim().length > 0,
    processedDateFilter.length > 0,
    invoiceDateFilter.length > 0,
    mawbFilter.trim().length > 0,
    invoiceFilter.trim().length > 0,
    hawbFilter.trim().length > 0,
  ].filter(Boolean).length;
  const hasActiveFilters = activeFilterCount > 0;
  const successCount = results.filter(r => r.status === 'SUCCESS').length;
  const errorCount = results.filter(r => r.status === 'ERROR').length;
  const selectedGroupOption = GROUP_OPTIONS.find((option) => option.key === groupBy) || GROUP_OPTIONS[0];

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

  const awbFilteredResults = useMemo(() => {
    if (selectedAwb === 'ALL') {
      return results;
    }

    return results.filter((item) => item.result?.mawb?.trim() === selectedAwb);
  }, [results, selectedAwb]);

  const filteredResults = useMemo(() => {
    const normalizedGlobalSearch = globalSearch.trim().toLowerCase();
    const compactGlobalSearch = normalizedGlobalSearch.replace(/[^a-z0-9]/g, '');
    const normalizedMawbFilter = mawbFilter.trim().toLowerCase();
    const normalizedInvoiceFilter = invoiceFilter.trim().toLowerCase();
    const normalizedHawbFilter = hawbFilter.trim().toLowerCase();

    return awbFilteredResults.filter((item) => {
      if (normalizedGlobalSearch) {
        const searchableValues = [
          item.fileName,
          item.error,
          item.user,
          item.processedAt,
          item.createdAt,
          getProcessedDateKey(item),
          getInvoiceDateKey(item),
          item.result?.mawb,
          item.result?.hawb,
          item.result?.invoiceNumber,
          item.result?.shipperName,
          item.result?.consigneeName,
          item.result?.dae,
          item.result?.ruc,
        ];

        const matchesGlobalSearch = searchableValues.some((value) => {
          const normalizedValue = String(value || '').toLowerCase();
          const compactValue = normalizedValue.replace(/[^a-z0-9]/g, '');
          return normalizedValue.includes(normalizedGlobalSearch) || Boolean(compactGlobalSearch && compactValue.includes(compactGlobalSearch));
        });

        if (!matchesGlobalSearch) {
          return false;
        }
      }

      if (processedDateFilter && getProcessedDateKey(item) !== processedDateFilter) {
        return false;
      }

      if (invoiceDateFilter && getInvoiceDateKey(item) !== invoiceDateFilter) {
        return false;
      }

      if (normalizedMawbFilter && !item.result?.mawb?.toLowerCase().includes(normalizedMawbFilter)) {
        return false;
      }

      if (normalizedInvoiceFilter && !item.result?.invoiceNumber?.toLowerCase().includes(normalizedInvoiceFilter)) {
        return false;
      }

      if (normalizedHawbFilter && !item.result?.hawb?.toLowerCase().includes(normalizedHawbFilter)) {
        return false;
      }

      return true;
    });
  }, [awbFilteredResults, globalSearch, hawbFilter, invoiceDateFilter, invoiceFilter, mawbFilter, processedDateFilter]);

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

  const groupedResults = useMemo<HistoryGroup[]>(() => {
    if (groupBy === 'none') {
      return [];
    }

    const groups = new Map<string, MutableHistoryGroup>();

    sortedResults.forEach((item) => {
      const groupValue = getGroupValue(item, groupBy);
      let group = groups.get(groupValue.id);

      if (!group) {
        group = {
          id: groupValue.id,
          label: groupValue.label,
          fieldLabel: groupValue.fieldLabel,
          items: [],
          itemCount: 0,
          pieceCount: 0,
          valueTotal: 0,
          hawbs: new Set<string>(),
        };
        groups.set(groupValue.id, group);
      }

      const hawb = item.result?.hawb?.trim();
      if (hawb) {
        group.hawbs.add(hawb);
      }

      group.items.push(item);
      group.itemCount += 1;
      group.pieceCount += Number(item.result?.totalPieces) || 0;
      group.valueTotal += Number(item.result?.totalValue) || 0;
    });

    return Array.from(groups.values()).map((group) => ({
      id: group.id,
      label: group.label,
      fieldLabel: group.fieldLabel,
      items: group.items,
      itemCount: group.itemCount,
      pieceCount: group.pieceCount,
      hawbCount: group.hawbs.size,
      valueTotal: group.valueTotal,
    }));
  }, [groupBy, sortedResults]);

  const collapsedGroupCount = groupBy === 'none' ? 0 : collapsedGroupIds.size;
  const hasCollapsedGroups = collapsedGroupCount > 0;
  const allGroupsCollapsed = groupedResults.length > 0 && collapsedGroupCount === groupedResults.length;

  const filteredSuccessResults = awbFilteredResults.filter((item) => item.status === 'SUCCESS' && item.result);
  const filteredPiecesCount = filteredResults.reduce((total, item) => total + (Number(item.result?.totalPieces) || 0), 0);
  const selectedAwbLabel = selectedAwb === 'ALL' ? 'Selecciona MAWB' : selectedAwb;
  const isSearchingAwb = awbSearch.trim().length > 0;

  const clearFilters = () => {
    setSelectedAwb('ALL');
    setGlobalSearch('');
    setProcessedDateFilter('');
    setInvoiceDateFilter('');
    setMawbFilter('');
    setInvoiceFilter('');
    setHawbFilter('');
    setAwbSearch('');
    setOpenColumnFilter(null);
    setIsAwbMenuOpen(false);
    setIsGroupMenuOpen(false);
    setCollapsedGroupIds(new Set());
  };

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

  useEffect(() => {
    if (!openColumnFilter) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (!filterMenuRef.current) {
        return;
      }

      const target = event.target;
      if (target instanceof Node && !filterMenuRef.current.contains(target)) {
        setOpenColumnFilter(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openColumnFilter]);

  useEffect(() => {
    if (!isGroupMenuOpen) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (!groupMenuRef.current) {
        return;
      }

      const target = event.target;
      if (target instanceof Node && !groupMenuRef.current.contains(target)) {
        setIsGroupMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isGroupMenuOpen]);

  useEffect(() => {
    if (groupBy === 'none') {
      setCollapsedGroupIds((current) => current.size === 0 ? current : new Set());
      return;
    }

    const availableGroupIds = new Set(groupedResults.map((group) => group.id));
    setCollapsedGroupIds((current) => {
      const next = new Set(Array.from(current).filter((groupId) => availableGroupIds.has(groupId)));
      if (next.size === current.size) {
        return current;
      }
      return next;
    });
  }, [groupBy, groupedResults]);

  const handleSelectAwb = (awb: string) => {
    setSelectedAwb(awb);
    setAwbSearch('');
    setIsAwbMenuOpen(false);
    setOpenColumnFilter(null);
    setIsGroupMenuOpen(false);
  };

  const handleSelectGroup = (nextGroupBy: GroupByKey) => {
    setGroupBy(nextGroupBy);
    setCollapsedGroupIds(new Set());
    setIsGroupMenuOpen(false);
    setOpenColumnFilter(null);
    setIsAwbMenuOpen(false);
  };

  const toggleGroupCollapsed = (groupId: string) => {
    setCollapsedGroupIds((current) => {
      const next = new Set(current);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const expandAllGroups = () => {
    setCollapsedGroupIds(new Set());
  };

  const collapseAllGroups = () => {
    setCollapsedGroupIds(new Set(groupedResults.map((group) => group.id)));
  };

  const toggleSort = (key: SortKey) => {
    setSortConfig((current) => {
      if (!current || current.key !== key) {
        return { key, direction: key === 'mawb' ? 'asc' : 'desc' };
      }

      return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
    });
  };

  const renderFilterButton = (
    filterKey: ColumnFilterKey,
    isActive: boolean,
    title: string,
    icon: 'calendar' | 'hash' | 'search' = 'search'
  ) => {
    const FilterIcon = icon === 'calendar' ? Calendar : icon === 'hash' ? Hash : Search;

    return (
      <HistoryTooltipAnchor tooltipTitle="Filtro" tooltipValue={title} className="inline-flex">
        <button
          type="button"
          aria-label={title}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={() => {
            setIsAwbMenuOpen(false);
            setIsGroupMenuOpen(false);
            setOpenColumnFilter((current) => current === filterKey ? null : filterKey);
          }}
          className={`inline-flex h-6 w-6 items-center justify-center rounded-md border transition-colors ${isActive ? 'border-indigo-200 bg-indigo-50 text-indigo-600 dark:border-indigo-500/40 dark:bg-indigo-500/15 dark:text-indigo-300' : 'border-transparent text-slate-400 hover:border-slate-200 hover:bg-white hover:text-slate-600 dark:hover:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200'}`}
        >
          <FilterIcon className="h-3 w-3" />
        </button>
      </HistoryTooltipAnchor>
    );
  };

  const renderFilterPanel = (
    filterKey: ColumnFilterKey,
    title: string,
    children: React.ReactNode,
    align: 'left' | 'right' = 'left'
  ) => {
    if (openColumnFilter !== filterKey) {
      return null;
    }

    return (
      <div
        ref={filterMenuRef}
        onMouseDown={(event) => event.stopPropagation()}
        className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} top-full z-30 mt-2 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-2xl shadow-slate-200/70 normal-case dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/40 sm:w-72`}
      >
        <div className="border-b border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/70">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">{title}</p>
        </div>
        <div className="p-3">
          {children}
        </div>
      </div>
    );
  };

  const renderTextFilterPanel = (
    filterKey: ColumnFilterKey,
    title: string,
    value: string,
    onChange: (value: string) => void,
    placeholder: string,
    align: 'left' | 'right' = 'left'
  ) => renderFilterPanel(
    filterKey,
    title,
    <>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          autoFocus
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm font-medium text-slate-700 outline-none transition-shadow placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
        />
      </div>
      {value.trim().length > 0 && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="mt-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        >
          <X className="h-3.5 w-3.5" />
          Limpiar
        </button>
      )}
    </>,
    align
  );

  const renderDateFilterPanel = (
    filterKey: ColumnFilterKey,
    title: string,
    value: string,
    onChange: (value: string) => void
  ) => renderFilterPanel(
    filterKey,
    title,
    <>
      <input
        autoFocus
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none transition-shadow focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="mt-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        >
          <X className="h-3.5 w-3.5" />
          Limpiar
        </button>
      )}
    </>
  );

  const sortableHeader = (key: SortKey, label: string, className: string, filterButton?: React.ReactNode, filterPanel?: React.ReactNode) => {
    const isActive = sortConfig?.key === key;
    const direction = isActive ? sortConfig.direction : undefined;

    return (
      <th className={`${className} relative`} aria-sort={isActive ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
        <div className="flex min-w-0 items-center gap-1 overflow-hidden whitespace-nowrap">
          <button
            type="button"
            onClick={() => toggleSort(key)}
            className={`inline-flex min-w-0 items-center gap-1 rounded-md text-[11px] font-bold uppercase tracking-[0.06em] transition-colors ${isActive ? 'text-indigo-600 dark:text-indigo-300' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100'}`}
          >
            <span className="truncate">{label}</span>
            <ChevronDown className={`h-3 w-3 shrink-0 transition-transform ${isActive ? 'opacity-100' : 'opacity-40'} ${direction === 'asc' ? 'rotate-180' : ''}`} />
          </button>
          {filterButton}
        </div>
        {filterPanel}
      </th>
    );
  };

  const filterHeader = (label: string, className: string, filterButton: React.ReactNode, filterPanel: React.ReactNode) => {
    return (
      <th className={`${className} relative`}>
        <div className="flex min-w-0 items-center gap-1 overflow-hidden whitespace-nowrap">
          <span className="truncate text-[11px] font-bold uppercase tracking-[0.06em] text-slate-500 dark:text-slate-400">{label}</span>
          {filterButton}
        </div>
        {filterPanel}
      </th>
    );
  };

  const renderGroupOptionIcon = (optionKey: GroupByKey) => {
    if (optionKey === 'none') return <List className="h-4 w-4" />;
    if (optionKey === 'processedDate') return <Calendar className="h-4 w-4" />;
    return <Hash className="h-4 w-4" />;
  };

  const renderGroupHeaderControl = () => {
    const isGrouped = groupBy !== 'none';

    return (
      <div ref={groupMenuRef} className="relative inline-flex justify-center normal-case">
        <button
          type="button"
          aria-label={isGrouped ? `Agrupado por ${selectedGroupOption.label}` : 'Agrupar tabla'}
          aria-haspopup="menu"
          aria-expanded={isGroupMenuOpen}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={() => {
            setOpenColumnFilter(null);
            setIsAwbMenuOpen(false);
            setIsGroupMenuOpen((current) => !current);
          }}
          className={`inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors ${isGrouped ? 'border-indigo-200 bg-indigo-50 text-indigo-600 dark:border-indigo-500/40 dark:bg-indigo-500/15 dark:text-indigo-300' : 'border-transparent text-slate-400 hover:border-slate-200 hover:bg-white hover:text-slate-600 dark:hover:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200'}`}
        >
          <Grid className="h-3.5 w-3.5" />
        </button>

        {isGroupMenuOpen && (
          <div
            role="menu"
            onMouseDown={(event) => event.stopPropagation()}
            className="absolute right-0 top-full z-40 mt-2 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-2xl shadow-slate-200/70 dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/40"
          >
            <div className="border-b border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/70">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">Agrupar tabla</p>
              <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">Selecciona un campo para ordenar la lectura por bloques.</p>
            </div>

            <div className="space-y-1 p-2">
              {GROUP_OPTIONS.map((option) => {
                const isSelected = groupBy === option.key;

                return (
                  <button
                    key={option.key}
                    type="button"
                    role="menuitemradio"
                    aria-checked={isSelected}
                    onClick={() => handleSelectGroup(option.key)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${isSelected ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200' : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800'}`}
                  >
                    <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${isSelected ? 'bg-white text-indigo-600 ring-1 ring-indigo-100 dark:bg-slate-900 dark:text-indigo-300 dark:ring-indigo-500/30' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300'}`}>
                      {renderGroupOptionIcon(option.key)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold leading-tight">{option.label}</span>
                      <span className="mt-0.5 block text-xs font-medium leading-snug text-slate-500 dark:text-slate-400">{option.description}</span>
                    </span>
                    {isSelected && <CheckCircle className="h-4 w-4 shrink-0 text-indigo-500" />}
                  </button>
                );
              })}
            </div>

            {isGrouped && groupedResults.length > 0 && (
              <div className="border-t border-slate-100 bg-slate-50/80 p-2 dark:border-slate-800 dark:bg-slate-950/40">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={expandAllGroups}
                    disabled={!hasCollapsedGroups}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-600 transition-colors hover:border-indigo-200 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-45 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-indigo-500/40 dark:hover:text-indigo-300"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                    Expandir todos
                  </button>
                  <button
                    type="button"
                    onClick={collapseAllGroups}
                    disabled={allGroupsCollapsed}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-600 transition-colors hover:border-indigo-200 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-45 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-indigo-500/40 dark:hover:text-indigo-300"
                  >
                    <ChevronDown className="h-3.5 w-3.5 -rotate-90" />
                    Colapsar todos
                  </button>
                </div>
                <p className="mt-2 text-center text-[11px] font-medium text-slate-400 dark:text-slate-500">
                  {hasCollapsedGroups ? `${collapsedGroupCount} de ${groupedResults.length} grupos colapsados` : 'Todos los grupos están expandidos'}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderGroupSummaryRow = (group: HistoryGroup, isCollapsed: boolean) => (
    <tr key={`group-${group.id}`} className="bg-slate-50/95 dark:bg-slate-900/85">
      <td colSpan={11} className="!h-auto !border-r-0 !border-slate-200 !px-0 !py-0 dark:!border-slate-700">
        <button
          type="button"
          aria-expanded={!isCollapsed}
          aria-label={`${isCollapsed ? 'Expandir' : 'Colapsar'} grupo ${group.label}`}
          onClick={() => toggleGroupCollapsed(group.id)}
          className="group flex min-h-[58px] w-full items-center justify-between gap-3 border-y border-slate-200/80 bg-gradient-to-r from-slate-50 via-white to-slate-50 px-4 py-3 text-left transition-colors hover:from-indigo-50/70 hover:via-white hover:to-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500/35 dark:border-slate-700/70 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800/70 dark:hover:from-indigo-500/10 dark:hover:via-slate-900 dark:hover:to-slate-800"
        >
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/20">
              {group.fieldLabel === 'Fecha procesada' ? <Calendar className="h-4 w-4" /> : <Hash className="h-4 w-4" />}
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">Agrupado por {group.fieldLabel}</p>
              <p className="mt-0.5 truncate font-mono text-sm font-bold text-slate-800 dark:text-slate-100">{group.label}</p>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 text-xs font-bold">
            <span className="inline-flex h-7 items-center rounded-full bg-white px-2.5 text-slate-600 ring-1 ring-slate-200 dark:bg-slate-950 dark:text-slate-300 dark:ring-slate-700">
              {group.itemCount.toLocaleString('es-EC')} {group.itemCount === 1 ? 'registro' : 'registros'}
            </span>
            <span className="inline-flex h-7 items-center rounded-full bg-white px-2.5 text-slate-600 ring-1 ring-slate-200 dark:bg-slate-950 dark:text-slate-300 dark:ring-slate-700">
              {group.hawbCount.toLocaleString('es-EC')} HAWB
            </span>
            <span className="inline-flex h-7 items-center rounded-full bg-sky-50 px-2.5 text-sky-700 ring-1 ring-sky-100 dark:bg-sky-500/10 dark:text-sky-200 dark:ring-sky-500/20">
              {formatPiecesValue(group.pieceCount)} piezas
            </span>
            <span className="inline-flex h-7 items-center rounded-full bg-emerald-50 px-2.5 text-emerald-700 ring-1 ring-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-500/20">
              {formatCurrencyValue(group.valueTotal)}
            </span>
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white text-slate-400 ring-1 ring-slate-200 transition-colors group-hover:text-indigo-500 dark:bg-slate-950 dark:text-slate-500 dark:ring-slate-700 dark:group-hover:text-indigo-300">
              <ChevronDown className={`h-4 w-4 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
            </span>
          </div>
        </button>
      </td>
    </tr>
  );

  const renderResultRow = (item: BatchItem) => {
    const confidence = item.result?.confidenceScore || 0;
    const isLowConfidence = item.status === 'SUCCESS' && confidence < 75;
    const processedAt = item.processedAt || item.createdAt;
    const invoiceDate = item.result?.date?.trim();
    const invoiceDateLabel = invoiceDate?.match(/^\d{4}-\d{2}-\d{2}$/) ? invoiceDate : invoiceDate ? formatDate(invoiceDate) : '-';
    const mawbLabel = item.result?.mawb?.trim() || '-';
    const hawbLabel = item.result?.hawb?.trim() || '-';
    const invoiceNumberLabel = item.result?.invoiceNumber?.trim() || '-';
    const fileTooltipDetails = item.error ? [{ label: 'Error detectado', value: item.error, tone: 'danger' as const }] : undefined;

    return (
      <tr key={item.id} className={`h-14 transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/50 ${isLowConfidence ? 'bg-red-50/50 dark:bg-red-900/10' : ''}`}>
        <td>
          {item.status === 'SUCCESS' ? (
            <span className="inline-flex h-6 min-w-[54px] items-center justify-center rounded-full bg-green-100 px-2 text-[11px] font-bold text-green-800 dark:bg-green-900 dark:text-green-300">
              OK
            </span>
          ) : (
            <span className="inline-flex h-6 min-w-[54px] items-center justify-center rounded-full bg-red-100 px-2 text-[11px] font-bold text-red-800 dark:bg-red-900 dark:text-red-300">
              Error
            </span>
          )}
        </td>
        <td className="whitespace-nowrap font-medium text-slate-600 dark:text-slate-300">
          <span className="inline-flex h-6 items-center">{processedAt ? formatDate(processedAt) : '-'}</span>
        </td>
        <td className="min-w-0 font-medium text-slate-900 dark:text-white">
          <HistoryOverflowText
            label="Archivo"
            value={item.fileName}
            details={fileTooltipDetails}
            className="h-6"
            textClassName={item.error ? 'text-rose-600 dark:text-rose-300' : ''}
          />
        </td>
        <td className="whitespace-nowrap font-medium text-slate-600 dark:text-slate-300">
          <span className="inline-flex h-6 items-center">{invoiceDateLabel}</span>
        </td>
        <td className="font-mono font-semibold text-slate-700 dark:text-slate-200">
          <HistoryOverflowText
            label="MAWB"
            value={mawbLabel}
            className="h-6"
            textClassName="font-mono font-semibold text-slate-700 dark:text-slate-200"
          />
        </td>
        <td className="font-mono font-semibold text-slate-700 dark:text-slate-200">
          <HistoryOverflowText
            label="HAWB"
            value={hawbLabel}
            className="h-6"
            textClassName="font-mono font-semibold text-slate-700 dark:text-slate-200"
          />
        </td>
        <td className="font-mono font-semibold text-slate-700 dark:text-slate-200">
          <HistoryOverflowText
            label="Invoice #"
            value={invoiceNumberLabel}
            className="h-6"
            textClassName="font-mono font-semibold text-slate-700 dark:text-slate-200"
          />
        </td>
        <td className="whitespace-nowrap text-right font-mono font-semibold text-slate-700 dark:text-slate-200">
          <span className="inline-flex h-6 items-center">{formatPiecesValue(item.result?.totalPieces)}</span>
        </td>
        <td className="whitespace-nowrap text-right font-mono font-semibold text-emerald-600 dark:text-emerald-400">
          <span className="inline-flex h-6 items-center">{formatCurrencyValue(item.result?.totalValue)}</span>
        </td>

        <td className="text-center">
          {item.status === 'SUCCESS' && item.result?.confidenceScore !== undefined ? (
            <HistoryTooltipAnchor
              tooltipTitle="Fiabilidad"
              tooltipValue={getConfidenceLabel(item.result.confidenceScore)}
              details={[{ label: 'Confianza', value: `${item.result.confidenceScore}%` }]}
              className="inline-flex justify-center"
            >
              <span
                tabIndex={0}
                className={`inline-flex h-7 min-w-[58px] items-center justify-center rounded-full bg-white px-2 font-mono text-xs font-bold shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700 ${getConfidenceTextColor(item.result.confidenceScore)}`}
              >
                {item.result.confidenceScore}%
              </span>
            </HistoryTooltipAnchor>
          ) : (
            <span className="text-slate-300">-</span>
          )}
        </td>

        <td className="text-center">
          {item.status === 'SUCCESS' && (
            <button
              onClick={() => setViewingItem(item)}
              aria-label={`Ver detalle de ${item.fileName}`}
              className={`inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${isLowConfidence ? 'bg-red-100 text-red-600 hover:bg-red-200' : 'text-indigo-600 hover:bg-indigo-50 hover:text-indigo-800 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-300'}`}
            >
              <Eye className="h-5 w-5" />
            </button>
          )}
        </td>
      </tr>
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
      const cleanData = buildBatchExportDocuments(exportItems);

      downloadAsJSON(cleanData, buildAwbExportFilename(selectedAwb));

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
    <div className="mx-auto flex h-full min-h-0 w-full max-w-7xl flex-col space-y-4 p-3 sm:p-4 lg:space-y-6 lg:p-6">
      {/* Header Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4 xl:gap-6">
        <div className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-5 xl:p-6 xl:gap-4">
          <div className="shrink-0 rounded-lg bg-indigo-100 p-2.5 text-indigo-600 dark:bg-indigo-900/50 sm:p-3">
             <FileText className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-slate-500 dark:text-slate-400 sm:text-sm">Archivos Acumulados</p>
            <p className="text-xl font-bold text-slate-800 dark:text-white sm:text-2xl">{results.length}</p>
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-5 xl:p-6 xl:gap-4">
          <div className="shrink-0 rounded-lg bg-sky-100 p-2.5 text-sky-600 dark:bg-sky-900/50 sm:p-3">
             <Package className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-slate-500 dark:text-slate-400 sm:text-sm">Piezas filtradas</p>
            <p className="text-xl font-bold text-slate-800 dark:text-white sm:text-2xl">{filteredPiecesCount.toLocaleString('es-EC')}</p>
          </div>
        </div>
        
        <div className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-5 xl:p-6 xl:gap-4">
          <div className="shrink-0 rounded-lg bg-green-100 p-2.5 text-green-600 dark:bg-green-900/50 sm:p-3">
             <CheckCircle className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-slate-500 dark:text-slate-400 sm:text-sm">Total Exitosos</p>
            <p className="text-xl font-bold text-slate-800 dark:text-white sm:text-2xl">{successCount}</p>
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-5 xl:p-6 xl:gap-4">
          <div className="shrink-0 rounded-lg bg-red-100 p-2.5 text-red-600 dark:bg-red-900/50 sm:p-3">
             <AlertCircle className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-slate-500 dark:text-slate-400 sm:text-sm">Total Fallidos</p>
            <p className="text-xl font-bold text-slate-800 dark:text-white sm:text-2xl">{errorCount}</p>
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800 dark:text-white">
            Historial
            {hasActiveFilters && (
              <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
                {activeFilterCount} {activeFilterCount === 1 ? 'filtro' : 'filtros'}
              </span>
            )}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Mostrando {filteredResults.length} de {results.length} registros
            {groupBy !== 'none' && ` en ${groupedResults.length} ${groupedResults.length === 1 ? 'grupo' : 'grupos'} por ${selectedGroupOption.label}`}
          </p>
        </div>

         <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center lg:w-auto lg:justify-end">
            <div className="relative w-full sm:w-64 lg:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={globalSearch}
                onChange={(event) => setGlobalSearch(event.target.value)}
                aria-label="Buscar en historial"
                placeholder="Buscar archivo, MAWB, HAWB..."
                className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-9 text-sm font-medium text-slate-700 outline-none transition-shadow placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
              {globalSearch.trim().length > 0 && (
                <button
                  type="button"
                  onClick={() => setGlobalSearch('')}
                  aria-label="Limpiar búsqueda"
                  className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="relative" ref={awbMenuRef}>
              <button
                type="button"
                onClick={() => {
                  setOpenColumnFilter(null);
                  setIsGroupMenuOpen(false);
                  setIsAwbMenuOpen((current) => !current);
                }}
                className="group flex h-10 w-full min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-left shadow-sm transition-colors hover:border-indigo-200 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-indigo-500/50 dark:hover:bg-slate-900/70 sm:w-[260px] xl:w-[220px]"
                aria-haspopup="listbox"
                aria-expanded={isAwbMenuOpen}
              >
                <Hash className="h-4 w-4 shrink-0 text-indigo-500 dark:text-indigo-300" />
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] font-bold uppercase leading-none tracking-[0.16em] text-slate-400 dark:text-slate-500">MAWB JSON</p>
                  <p className="mt-0.5 truncate text-sm font-semibold leading-tight text-slate-800 dark:text-white">{selectedAwbLabel}</p>
                </div>
                {selectedAwb !== 'ALL' && (
                  <span
                    className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-300"
                    aria-label="Registros con esta MAWB"
                  >
                    {awbCounts.get(selectedAwb) || 0}
                  </span>
                )}
                <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${isAwbMenuOpen ? 'rotate-180 text-indigo-500' : 'group-hover:text-slate-600 dark:group-hover:text-slate-200'}`} />
              </button>

              {isAwbMenuOpen && (
                <div className="absolute left-0 right-0 z-30 mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl shadow-slate-200/70 dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/40 sm:left-auto sm:right-0 sm:w-80">
                  <div className="border-b border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/70">
                    <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">Seleccionar MAWB para JSON</p>
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
                        placeholder="Buscar MAWB..."
                        className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm font-medium text-slate-700 outline-none transition-shadow placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                      />
                    </div>
                  </div>

                  <div className="max-h-72 space-y-1 overflow-auto p-2">
                    {!isSearchingAwb && (
                      <button
                        type="button"
                        onClick={() => handleSelectAwb('ALL')}
                        className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors ${selectedAwb === 'ALL' ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200' : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800'}`}
                      >
                        <span className="text-sm font-semibold">Sin MAWB seleccionada</span>
                      </button>
                    )}

                    {filteredAwbOptions.map((awb) => {
                      const isSelected = selectedAwb === awb;

                      return (
                        <button
                          key={awb}
                          type="button"
                          onClick={() => handleSelectAwb(awb)}
                          className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors ${isSelected ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200' : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800'}`}
                        >
                          <span className="truncate font-mono text-sm font-semibold">{awb}</span>
                        </button>
                      );
                    })}

                    {filteredAwbOptions.length === 0 && (
                      <div className="px-3 py-6 text-center text-sm text-slate-400 dark:text-slate-500">
                        No hay MAWB que coincidan.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-500 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900 sm:justify-start"
              >
                <X className="w-4 h-4" />
                Limpiar filtros
              </button>
            )}
            {results.length > 0 && onClearHistory && (
              <HistoryTooltipAnchor tooltipTitle="Acción" tooltipValue="Limpiar historial" className="inline-flex">
                <button 
                  onClick={onClearHistory}
                  aria-label="Limpiar historial"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </HistoryTooltipAnchor>
            )}
            <button 
              onClick={onBack}
              className="flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
            >
               Procesar más
               <ArrowRight className="w-4 h-4" />
            </button>
            <button 
              onClick={() => void handleDownloadAll()}
              disabled={selectedAwb === 'ALL' || filteredSuccessResults.length === 0 || isExporting}
              className="flex items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="w-4 h-4" /> {isExporting ? 'Exportando...' : selectedAwb === 'ALL' ? 'Selecciona MAWB' : 'Exportar MAWB'}
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
      <div className="flex min-h-[320px] min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
           {results.length === 0 ? (
             <div className="flex h-full flex-col items-center justify-center p-8 text-center text-slate-400 sm:p-12">
                <FileText className="w-12 h-12 mb-4 opacity-20" />
                <p>No hay facturas procesadas en esta sesión.</p>
             </div>
           ) : filteredResults.length === 0 ? (
             <div className="flex h-full flex-col items-center justify-center p-8 text-center text-slate-400 sm:p-12">
               <FileText className="w-12 h-12 mb-4 opacity-20" />
               <p>No hay resultados para los filtros aplicados.</p>
             </div>
          ) : (
          <table className="w-full min-w-[1120px] table-fixed border-collapse text-left text-[13px] leading-5">
            <colgroup>
              <col style={{ width: '6%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '6%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '7%' }} />
              <col style={{ width: '7%' }} />
            </colgroup>
            <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 backdrop-blur text-[11px] font-bold uppercase tracking-[0.06em] text-slate-500 dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-400">
              <tr className="[&>th]:h-12 [&>th]:px-3 [&>th]:text-[11px] [&>th]:font-bold [&>th]:uppercase [&>th]:tracking-[0.06em] [&>th]:align-middle [&>th]:border-r [&>th]:border-slate-200/70 dark:[&>th]:border-slate-700/60 [&>th:last-child]:border-r-0">
                <th>Estado</th>
                {sortableHeader(
                  'processedAt',
                  'Procesado',
                  'relative',
                  renderFilterButton('processedDate', processedDateFilter.length > 0, 'Filtrar fecha procesada', 'calendar'),
                  renderDateFilterPanel('processedDate', 'Fecha procesada', processedDateFilter, setProcessedDateFilter)
                )}
                <th>Archivo</th>
                {sortableHeader(
                  'invoiceDate',
                  'Factura',
                  'relative',
                  renderFilterButton('invoiceDate', invoiceDateFilter.length > 0, 'Filtrar fecha de factura', 'calendar'),
                  renderDateFilterPanel('invoiceDate', 'Fecha de factura', invoiceDateFilter, setInvoiceDateFilter)
                )}
                {sortableHeader(
                  'mawb',
                  'MAWB',
                  'relative',
                  renderFilterButton('mawb', mawbFilter.trim().length > 0, 'Filtrar MAWB'),
                  renderTextFilterPanel('mawb', 'Filtrar MAWB', mawbFilter, setMawbFilter, 'Número MAWB')
                )}
                {filterHeader(
                  'HAWB',
                  'relative',
                  renderFilterButton('hawb', hawbFilter.trim().length > 0, 'Filtrar HAWB'),
                  renderTextFilterPanel('hawb', 'Filtrar HAWB', hawbFilter, setHawbFilter, 'Número HAWB')
                )}
                {filterHeader(
                  'Invoice #',
                  'relative',
                  renderFilterButton('invoiceNumber', invoiceFilter.trim().length > 0, 'Filtrar invoice'),
                  renderTextFilterPanel('invoiceNumber', 'Filtrar invoice', invoiceFilter, setInvoiceFilter, 'Número de invoice', 'right')
                )}
                <th className="text-right">Piezas</th>
                <th className="text-right">Valor</th>
                <th className="text-center">Fiabilidad</th>
                <th className="text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <span>Acción</span>
                    {renderGroupHeaderControl()}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[13px] dark:divide-slate-800 [&>tr>td]:h-14 [&>tr>td]:px-3 [&>tr>td]:align-middle [&>tr>td]:border-r [&>tr>td]:border-slate-100/80 dark:[&>tr>td]:border-slate-800/70 [&>tr>td:last-child]:border-r-0">
              {groupBy === 'none' ? (
                sortedResults.map(renderResultRow)
              ) : (
                groupedResults.map((group) => (
                  <React.Fragment key={group.id}>
                    {renderGroupSummaryRow(group, collapsedGroupIds.has(group.id))}
                    {!collapsedGroupIds.has(group.id) && group.items.map(renderResultRow)}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResultsDashboard;
