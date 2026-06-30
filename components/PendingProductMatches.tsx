import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  Agency,
  PendingProductMatchItem,
  PendingProductMatchResponse,
  ProductMatchCatalogItem,
} from '../types';
import { api, ApiError } from '../services/apiClient';
import {
  clearProductMatchCatalogRequest,
  getCachedProductMatchCatalog,
  getProductMatchCatalogCacheVersion,
  getProductMatchCatalogRequest,
  invalidateProductMatchCatalogCache,
  setCachedProductMatchCatalog,
  setProductMatchCatalogRequest,
} from '../services/productMatchCatalogCache';
import { formatDateTime } from '../utils/helpers';
import {
  AlertCircle,
  AlertTriangle,
  Building,
  CheckCircle,
  FileWarning,
  MoreVertical,
  Package,
  RefreshCw,
  Save,
  Search,
  Zap,
} from './Icons';
import PageHeader from './PageHeader';
import { ScrollArea } from './ui/scroll-area';

interface PendingProductMatchesProps {
  currentAgencyId: string;
  currentAgency?: Agency;
}

type PendingScanSummary = Pick<
  PendingProductMatchResponse,
  'truncated' | 'scannedBatchItems' | 'scanLimit'
>;

type PendingMatchDraft = {
  clientProductCode: string;
  productMatch: string;
  htsMatch: string;
};

type DraftSource = 'default' | 'smart' | 'manual';

type SmartSuggestion = PendingMatchDraft & {
  sourceProduct: string;
  score: number;
};

type LoadPendingOptions = {
  preserveSelection?: boolean;
};

const EMPTY_DRAFT: PendingMatchDraft = {
  clientProductCode: '',
  productMatch: '',
  htsMatch: '',
};

const EMPTY_SCAN_SUMMARY: PendingScanSummary = {
  truncated: false,
  scannedBatchItems: 0,
  scanLimit: 0,
};

const SMART_PREFILL_LIMIT = 5;
const EXTRA_SCROLL_PREVIEW_ITEMS = 4;
const VISIBLE_PENDING_VIEWPORT_ITEMS = SMART_PREFILL_LIMIT + EXTRA_SCROLL_PREVIEW_ITEMS;
const PENDING_CARD_GAP_PX = 12;
const SMART_MATCH_MIN_SCORE = 450;

const formatCount = (value: number): string => value.toLocaleString('es-ES');

const getExampleHawbs = (item: PendingProductMatchItem): string[] =>
  Array.from(
    new Set(
      item.examples.map((example) => example.hawb).filter((hawb): hawb is string => Boolean(hawb)),
    ),
  );

const normalizePendingDraft = (draft: PendingMatchDraft): PendingMatchDraft => ({
  clientProductCode: draft.clientProductCode.trim(),
  productMatch: draft.productMatch.trim(),
  htsMatch: draft.htsMatch.trim(),
});

const normalizeSmartMatchText = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

const tokenizeSmartMatchText = (value: string): string[] =>
  normalizeSmartMatchText(value)
    .split(' ')
    .filter((token) => token.length >= 4);

const buildInitialDraft = (
  item: PendingProductMatchItem | null,
  suggestion?: SmartSuggestion,
  smartPrefillRun = false,
): { draft: PendingMatchDraft; source: DraftSource } => {
  if (suggestion) {
    return {
      draft: {
        clientProductCode: suggestion.clientProductCode,
        productMatch: suggestion.productMatch,
        htsMatch: suggestion.htsMatch,
      },
      source: 'smart',
    };
  }

  if (smartPrefillRun) {
    return { draft: EMPTY_DRAFT, source: 'manual' };
  }

  return {
    draft: {
      clientProductCode: '',
      productMatch: item?.product || '',
      htsMatch: item?.htsCandidates[0] || '',
    },
    source: 'default',
  };
};

function findSmartSuggestion(
  pendingItem: PendingProductMatchItem,
  catalog: ProductMatchCatalogItem[],
): SmartSuggestion | null {
  const pendingText = normalizeSmartMatchText(pendingItem.product);
  const pendingTokens = new Set(tokenizeSmartMatchText(pendingItem.product));
  let bestMatch: { item: ProductMatchCatalogItem; score: number } | null = null;

  for (const catalogItem of catalog) {
    const catalogText = normalizeSmartMatchText(catalogItem.product);
    if (!catalogText) {
      continue;
    }

    const catalogTokens = tokenizeSmartMatchText(catalogItem.product);
    let score = 0;

    const catalogTokensMatch =
      catalogTokens.length > 0 ? catalogTokens.every((token) => pendingTokens.has(token)) : false;

    if (pendingText === catalogText) {
      score = 1000;
    } else if (catalogText.length >= 5 && pendingText.startsWith(`${catalogText} `)) {
      score = 700 + catalogText.length;
    } else if (catalogTokens.length >= 2 && catalogTokensMatch) {
      score = 600 + catalogTokens.join('').length;
    }

    if (score >= SMART_MATCH_MIN_SCORE && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { item: catalogItem, score };
    }
  }

  if (!bestMatch) {
    return null;
  }

  return {
    clientProductCode: bestMatch.item.clientProductCode,
    productMatch: bestMatch.item.productMatch,
    htsMatch: bestMatch.item.htsMatch,
    sourceProduct: bestMatch.item.product,
    score: bestMatch.score,
  };
}

const PendingProductMatches: React.FC<PendingProductMatchesProps> = ({
  currentAgencyId,
  currentAgency,
}) => {
  const activeAgencyRef = useRef(currentAgencyId);
  const selectedKeyRef = useRef<string | null>(null);
  const draftVersionRef = useRef(0);
  const draftEditedByUserRef = useRef(false);
  const draftItemKeyRef = useRef<string | null>(null);
  const loadSequenceRef = useRef(0);
  const actionsMenuRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [items, setItems] = useState<PendingProductMatchItem[]>([]);
  const [query, setQuery] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<PendingMatchDraft>(EMPTY_DRAFT);
  const [draftSource, setDraftSource] = useState<DraftSource>('default');
  const [smartSuggestions, setSmartSuggestions] = useState<Record<string, SmartSuggestion>>({});
  const [smartPrefillRun, setSmartPrefillRun] = useState(false);
  const [scanSummary, setScanSummary] = useState<PendingScanSummary>(EMPTY_SCAN_SUMMARY);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSmartFilling, setIsSmartFilling] = useState(false);
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);
  const [listViewportHeight, setListViewportHeight] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  activeAgencyRef.current = currentAgencyId;
  selectedKeyRef.current = selectedKey;

  const loadPending = useCallback(
    async ({ preserveSelection = false }: LoadPendingOptions = {}) => {
      const agencyId = currentAgencyId;
      const loadSequence = ++loadSequenceRef.current;

      if (!currentAgency || agencyId === 'GLOBAL') {
        setItems([]);
        setSelectedKey(null);
        setDraft(EMPTY_DRAFT);
        setDraftSource('default');
        setSmartSuggestions({});
        setSmartPrefillRun(false);
        setScanSummary(EMPTY_SCAN_SUMMARY);
        setIsLoading(false);
        setErrorMessage(null);
        setInfoMessage(null);
        return;
      }

      setIsLoading(true);
      setErrorMessage(null);
      setInfoMessage(null);

      try {
        const result = await api.getPendingProductMatches(agencyId);
        if (activeAgencyRef.current !== agencyId || loadSequenceRef.current !== loadSequence) {
          return;
        }

        setItems(result.items);
        setSmartSuggestions({});
        setSmartPrefillRun(false);
        setDraftSource('default');
        setScanSummary({
          truncated: result.truncated,
          scannedBatchItems: result.scannedBatchItems,
          scanLimit: result.scanLimit,
        });
        setSelectedKey((current) => {
          if (preserveSelection && current && result.items.some((item) => item.key === current)) {
            return current;
          }

          return result.items[0]?.key || null;
        });
      } catch (error) {
        if (activeAgencyRef.current === agencyId && loadSequenceRef.current === loadSequence) {
          setItems([]);
          setSelectedKey(null);
          setDraft(EMPTY_DRAFT);
          setDraftSource('default');
          setSmartSuggestions({});
          setSmartPrefillRun(false);
          setScanSummary(EMPTY_SCAN_SUMMARY);
          setErrorMessage(
            error instanceof ApiError ? error.message : 'No fue posible cargar los pendientes.',
          );
        }
      } finally {
        if (activeAgencyRef.current === agencyId && loadSequenceRef.current === loadSequence) {
          setIsLoading(false);
        }
      }
    },
    [currentAgency, currentAgencyId],
  );

  useEffect(() => {
    void loadPending();
  }, [loadPending]);

  useEffect(() => {
    setQuery('');
    draftEditedByUserRef.current = false;
    draftItemKeyRef.current = null;
    setSmartSuggestions({});
    setSmartPrefillRun(false);
    setDraftSource('default');
    setIsActionsMenuOpen(false);
  }, [currentAgencyId]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return items;
    }

    return items.filter((item) =>
      [
        item.product,
        item.htsCandidates.join(' '),
        ...item.examples.flatMap((example) => [
          example.fileName,
          example.invoiceNumber || '',
          example.hawb || '',
          example.productDescription,
        ]),
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [items, query]);

  const smartPrefillItems = useMemo(
    () => filteredItems.slice(0, SMART_PREFILL_LIMIT),
    [filteredItems],
  );

  useEffect(() => {
    if (!isActionsMenuOpen) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (!actionsMenuRef.current) {
        return;
      }

      if (event.target instanceof Node && !actionsMenuRef.current.contains(event.target)) {
        setIsActionsMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isActionsMenuOpen]);

  useEffect(() => {
    if (filteredItems.length === 0) {
      setSelectedKey(null);
      return;
    }

    if (!selectedKey || !filteredItems.some((item) => item.key === selectedKey)) {
      setSelectedKey(filteredItems[0].key);
    }
  }, [filteredItems, selectedKey]);

  const selectedItem = useMemo(
    () => filteredItems.find((item) => item.key === selectedKey) || null,
    [filteredItems, selectedKey],
  );

  const selectedSuggestion = selectedItem ? smartSuggestions[selectedItem.key] : undefined;
  const selectedHtsSignature = selectedItem?.htsCandidates.join('|') || '';

  useEffect(() => {
    itemRefs.current = itemRefs.current.slice(0, filteredItems.length);

    if (filteredItems.length <= VISIBLE_PENDING_VIEWPORT_ITEMS) {
      setListViewportHeight(null);
      return;
    }

    const measureViewport = () => {
      window.requestAnimationFrame(() => {
        const visibleHeights = itemRefs.current
          .slice(0, VISIBLE_PENDING_VIEWPORT_ITEMS)
          .map((item) => item?.offsetHeight || 0)
          .filter((height) => height > 0);

        if (visibleHeights.length === 0) {
          return;
        }

        const totalHeight =
          visibleHeights.reduce((sum, height) => sum + height, 0) +
          PENDING_CARD_GAP_PX * Math.max(visibleHeights.length - 1, 0);

        setListViewportHeight(totalHeight);
      });
    };

    measureViewport();
    window.addEventListener('resize', measureViewport);

    return () => window.removeEventListener('resize', measureViewport);
  }, [filteredItems, selectedKey, smartSuggestions]);

  useEffect(() => {
    const itemKey = selectedItem?.key || null;
    if (draftItemKeyRef.current !== itemKey) {
      draftItemKeyRef.current = itemKey;
      draftEditedByUserRef.current = false;
    }

    if (draftEditedByUserRef.current) {
      return;
    }

    const initialDraft = buildInitialDraft(selectedItem, selectedSuggestion, smartPrefillRun);
    draftVersionRef.current += 1;
    setDraft(initialDraft.draft);
    setDraftSource(initialDraft.source);
  }, [
    selectedItem?.key,
    selectedItem?.product,
    selectedHtsSignature,
    selectedSuggestion,
    smartPrefillRun,
  ]);

  const totalOccurrences = useMemo(
    () => items.reduce((sum, item) => sum + item.occurrenceCount, 0),
    [items],
  );

  const itemsWithHts = useMemo(
    () => items.filter((item) => item.htsCandidates.length > 0).length,
    [items],
  );

  const handleDraftChange =
    (field: keyof PendingMatchDraft) => (event: React.ChangeEvent<HTMLInputElement>) => {
      draftVersionRef.current += 1;
      draftEditedByUserRef.current = true;
      setDraftSource('manual');
      setDraft((current) => ({
        ...current,
        [field]: event.target.value,
      }));
    };

  const handleSmartPrefill = async () => {
    if (!currentAgency || currentAgencyId === 'GLOBAL') {
      return;
    }

    if (smartPrefillItems.length === 0) {
      setInfoMessage('No hay productos filtrados para prellenar.');
      return;
    }

    const agencyId = currentAgencyId;
    const cacheVersionAtStart = getProductMatchCatalogCacheVersion();
    const draftVersionAtStart = draftVersionRef.current;
    const selectedKeyAtStart = selectedKey;
    setIsSmartFilling(true);
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      let catalog = getCachedProductMatchCatalog(agencyId);
      if (!catalog) {
        let request = getProductMatchCatalogRequest(agencyId);
        if (!request) {
          const cacheVersion = getProductMatchCatalogCacheVersion();
          request = api.getProductMatches(agencyId).then((result) => {
            setCachedProductMatchCatalog(agencyId, result, cacheVersion);
            return result;
          });
          setProductMatchCatalogRequest(agencyId, request);
        }

        try {
          catalog = await request;
        } finally {
          clearProductMatchCatalogRequest(agencyId, request);
        }
      }

      if (getProductMatchCatalogCacheVersion() !== cacheVersionAtStart) {
        if (activeAgencyRef.current === agencyId) {
          setInfoMessage(
            'El catálogo cambió mientras se calculaba la sugerencia. Ejecuta el prellenado nuevamente.',
          );
        }
        return;
      }

      if (activeAgencyRef.current !== agencyId) {
        return;
      }

      const nextSuggestions: Record<string, SmartSuggestion> = {};
      for (const item of smartPrefillItems) {
        const suggestion = findSmartSuggestion(item, catalog);
        if (suggestion) {
          nextSuggestions[item.key] = suggestion;
        }
      }

      setSmartSuggestions(nextSuggestions);
      setSmartPrefillRun(true);

      const selected = selectedItem ? nextSuggestions[selectedItem.key] : undefined;
      const initialDraft = buildInitialDraft(selectedItem, selected, true);
      if (
        draftVersionRef.current === draftVersionAtStart &&
        selectedKeyRef.current === selectedKeyAtStart
      ) {
        draftVersionRef.current += 1;
        draftEditedByUserRef.current = false;
        setDraft(initialDraft.draft);
        setDraftSource(initialDraft.source);
      }

      const suggestionCount = Object.keys(nextSuggestions).length;
      setInfoMessage(
        suggestionCount > 0
          ? `Prellenado inteligente aplicado sobre los primeros ${formatCount(smartPrefillItems.length)} resultado(s) filtrados: ${formatCount(suggestionCount)} producto(s) con sugerencia.`
          : `No se encontraron coincidencias confiables en los primeros ${formatCount(smartPrefillItems.length)} resultado(s) filtrados. Los campos quedan listos para captura manual.`,
      );
    } catch (error) {
      if (activeAgencyRef.current === agencyId) {
        setErrorMessage(
          error instanceof ApiError
            ? error.message
            : 'No fue posible ejecutar el prellenado inteligente.',
        );
      }
    } finally {
      if (activeAgencyRef.current === agencyId) {
        setIsSmartFilling(false);
      }
    }
  };

  const handleRefresh = async () => {
    setInfoMessage(null);
    setSmartSuggestions({});
    setSmartPrefillRun(false);
    await loadPending({ preserveSelection: true });
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!currentAgency || currentAgencyId === 'GLOBAL' || !selectedItem) {
      return;
    }

    const agencyId = currentAgencyId;
    const pendingKey = selectedItem.key;

    const normalizedDraft = normalizePendingDraft(draft);
    if (!normalizedDraft.clientProductCode) {
      setErrorMessage('El código producto cliente es obligatorio.');
      return;
    }

    if (!normalizedDraft.htsMatch) {
      setErrorMessage('El HTS Match es obligatorio.');
      return;
    }

    const payload = {
      agencyId,
      product: selectedItem.product,
      clientProductCode: normalizedDraft.clientProductCode,
      productMatch: normalizedDraft.clientProductCode,
      htsMatch: normalizedDraft.htsMatch,
      sourceHts: selectedItem.htsCandidates[0] || '',
    };

    setIsSaving(true);
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      await api.createPendingProductMatch(payload);
      invalidateProductMatchCatalogCache(agencyId);

      if (activeAgencyRef.current !== agencyId) {
        return;
      }

      setItems((current) => current.filter((item) => item.key !== pendingKey));
      setSmartSuggestions((current) => {
        const next = { ...current };
        delete next[pendingKey];
        return next;
      });
      setInfoMessage('Match creado correctamente. El producto salió del listado pendiente.');
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status === 400 &&
        error.message.toLowerCase().includes('ya existe un match')
      ) {
        invalidateProductMatchCatalogCache(agencyId);
        if (activeAgencyRef.current !== agencyId) {
          return;
        }
        await loadPending({ preserveSelection: true });
        setInfoMessage(
          'El producto ya había sido registrado. Se actualizó el listado de pendientes.',
        );
      } else {
        if (activeAgencyRef.current !== agencyId) {
          return;
        }
        setErrorMessage(
          error instanceof ApiError ? error.message : 'No fue posible crear el match.',
        );
      }
    } finally {
      if (activeAgencyRef.current === agencyId) {
        setIsSaving(false);
      }
    }
  };

  if (currentAgencyId === 'GLOBAL') {
    return (
      <div className="p-8 max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="rounded-[28px] border border-dashed border-slate-300 bg-white/90 p-10 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900/70">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300">
            <AlertTriangle className="h-8 w-8" />
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Selecciona una agencia para revisar pendientes de match
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
            Esta validación depende del historial de facturas y del catálogo de equivalencias de una
            agencia específica. La vista GLOBAL se mantiene solo como contexto de consulta.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8">
      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-lg shadow-slate-200/40 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
        <div className="px-8 py-8">
          <PageHeader
            icon={<FileWarning className="h-3.5 w-3.5" />}
            badge="Pendientes Match"
            title="Productos extraídos sin equivalencia"
            subtitle="Valida las descripciones detectadas en facturas que todavía no tienen correspondencia en Match Productos. Al guardar, se crea el registro y desaparece de esta lista."
          >
            <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-950/50">
              <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">
                Agencia activa
              </div>
              <div className="mt-2 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900">
                  <Building className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">
                    {currentAgency?.name || 'Agencia sin contexto'}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    ID: {currentAgencyId}
                  </div>
                </div>
              </div>
            </div>
          </PageHeader>
        </div>

        <div className="grid gap-4 border-b border-slate-200 px-8 py-6 dark:border-slate-800 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-800/60">
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
              Productos pendientes
            </div>
            <div className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">
              {formatCount(items.length)}
            </div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Descripciones distintas detectadas en el historial sin match vigente.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-800/60">
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
              Apariciones
            </div>
            <div className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">
              {formatCount(totalOccurrences)}
            </div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Veces que esos productos reaparecieron en line items procesados.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-800/60">
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
              Con HTS detectado
            </div>
            <div className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">
              {formatCount(itemsWithHts)}
            </div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Pendientes que ya traen al menos un HTS extraído como referencia.
            </p>
          </div>
        </div>

        {(errorMessage || infoMessage || scanSummary.truncated) && (
          <div className="px-8 pb-6">
            {errorMessage && (
              <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}
            {infoMessage && (
              <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
                <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{infoMessage}</span>
              </div>
            )}
            {scanSummary.truncated && (
              <div className="mt-3 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Se analizaron las {formatCount(scanSummary.scannedBatchItems)} facturas más
                  recientes de esta agencia para mantener la consulta ágil. Si necesitas ampliar el
                  alcance histórico, podemos agregar paginación o filtros en la siguiente iteración.
                </span>
              </div>
            )}
          </div>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/30 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Cola de validación
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Revisa la cola filtrada y selecciona un producto pendiente para validar sus datos
                antes de guardar.
              </p>
            </div>

            <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center lg:w-auto lg:max-w-[26rem] lg:flex-1 lg:justify-end">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar producto, HTS o HAWB..."
                  className="h-11 w-full rounded-2xl border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                />
              </div>
              <div className="relative shrink-0 self-end sm:self-auto" ref={actionsMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsActionsMenuOpen((current) => !current)}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 transition hover:border-indigo-200 hover:bg-slate-50 hover:text-indigo-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:border-indigo-500/40 dark:hover:text-indigo-300"
                  aria-label="Acciones de la cola"
                  aria-haspopup="menu"
                  aria-expanded={isActionsMenuOpen}
                  title="Acciones de la cola"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>

                {isActionsMenuOpen && (
                  <div className="absolute right-0 z-30 mt-2 w-[300px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-200/80 dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/40">
                    <div className="border-b border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/70">
                      <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">
                        Acciones de la cola
                      </p>
                      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                        Mantén la búsqueda visible y agrupa aquí las acciones rápidas.
                      </p>
                    </div>

                    <div className="space-y-1 p-2">
                      <button
                        type="button"
                        onClick={() => {
                          setIsActionsMenuOpen(false);
                          void handleSmartPrefill();
                        }}
                        disabled={isLoading || isSmartFilling || smartPrefillItems.length === 0}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-indigo-500/10"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
                          {isSmartFilling ? (
                            <RefreshCw className="h-4 w-4 animate-spin" />
                          ) : (
                            <Zap className="h-4 w-4" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                            {isSmartFilling ? 'Buscando sugerencias...' : 'Prellenar inteligente'}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                            Aplica sugerencias sobre los primeros {SMART_PREFILL_LIMIT} resultados
                            filtrados.
                          </p>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsActionsMenuOpen(false);
                          void handleRefresh();
                        }}
                        disabled={isLoading}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-slate-800"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                            Recargar pendientes
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                            Vuelve a consultar la cola y conserva la selección cuando sea posible.
                          </p>
                        </div>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {!isLoading && filteredItems.length > VISIBLE_PENDING_VIEWPORT_ITEMS && (
            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
              Se encontraron {formatCount(filteredItems.length)} producto(s) pendientes. La cola
              deja ver hasta {VISIBLE_PENDING_VIEWPORT_ITEMS} cards completas en este panel y el
              resto aparece con scroll interno.
            </div>
          )}

          {isLoading && (
            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400">
              Cargando pendientes de match...
            </div>
          )}

          {!isLoading && filteredItems.length === 0 && (
            <div className="mt-6 rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/70 px-4 py-10 text-center dark:border-emerald-500/30 dark:bg-emerald-500/10">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
                <CheckCircle className="h-7 w-7" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-slate-900 dark:text-white">
                {items.length === 0
                  ? 'No hay productos pendientes en esta agencia'
                  : 'No hay resultados para la búsqueda actual'}
              </h3>
              <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
                {items.length === 0
                  ? 'Todo lo extraído desde el historial ya tiene equivalencia en Match Productos o todavía no existen facturas exitosas para revisar.'
                  : 'Ajusta el texto de búsqueda para volver a listar los productos pendientes.'}
              </p>
            </div>
          )}

          {!isLoading && filteredItems.length > 0 && (
            <ScrollArea
              className="mt-6"
              style={listViewportHeight ? { height: `${listViewportHeight}px` } : undefined}
            >
              <div
                className={`flex flex-col gap-3 ${
                  filteredItems.length > VISIBLE_PENDING_VIEWPORT_ITEMS ? 'pr-4' : ''
                }`}
              >
                {filteredItems.map((item, index) => {
                  const isSelected = item.key === selectedKey;
                  const smartSuggestion = smartSuggestions[item.key];
                  const exampleHawbs = getExampleHawbs(item);
                  return (
                    <button
                      key={item.key}
                      ref={(element) => {
                        itemRefs.current[index] = element;
                      }}
                      type="button"
                      onClick={() => {
                        setSelectedKey(item.key);
                        setErrorMessage(null);
                        setInfoMessage(null);
                      }}
                      className={`w-full rounded-3xl border p-5 text-left transition ${
                        isSelected
                          ? 'border-indigo-300 bg-indigo-50/70 shadow-md shadow-indigo-200/40 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:shadow-none'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950/40 dark:hover:border-slate-700 dark:hover:bg-slate-900'
                      }`}
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                            <Package className="h-3.5 w-3.5" />
                            {smartSuggestion ? 'Sugerencia inteligente' : 'Producto pendiente'}
                          </div>
                          <h3 className="mt-3 text-base font-semibold text-slate-900 dark:text-white">
                            {item.product}
                          </h3>
                          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                            {formatCount(item.occurrenceCount)} apariciones en{' '}
                            {formatCount(item.invoiceCount)} documento(s)
                            {item.latestProcessedAt
                              ? ` · Última detección ${formatDateTime(item.latestProcessedAt)}`
                              : ''}
                          </p>
                          {exampleHawbs.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {exampleHawbs.slice(0, 3).map((hawb) => (
                                <span
                                  key={hawb}
                                  className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 font-mono text-xs font-semibold text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200"
                                >
                                  HAWB {hawb}
                                </span>
                              ))}
                              {exampleHawbs.length > 3 && (
                                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
                                  +{formatCount(exampleHawbs.length - 3)} más
                                </span>
                              )}
                            </div>
                          )}
                          {smartSuggestion && (
                            <p className="mt-2 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                              Prellenado desde catálogo por coincidencia con "
                              {smartSuggestion.sourceProduct}".
                            </p>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-2 lg:max-w-[260px] lg:justify-end">
                          {item.htsCandidates.length > 0 ? (
                            item.htsCandidates.slice(0, 3).map((hts) => (
                              <span
                                key={hts}
                                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                              >
                                HTS {hts}
                              </span>
                            ))
                          ) : (
                            <span className="rounded-full border border-dashed border-slate-300 px-3 py-1 text-xs font-semibold text-slate-500 dark:border-slate-700 dark:text-slate-400">
                              Sin HTS detectado
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/30 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Alta rápida en Match Productos
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Completa los datos del cliente y guarda el match sin salir de esta validación.
              </p>
            </div>
            {selectedItem && (
              <div className="rounded-2xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-right text-xs font-semibold text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300">
                {formatCount(selectedItem.occurrenceCount)} apariciones
              </div>
            )}
          </div>

          {!selectedItem ? (
            <div className="mt-8 rounded-2xl border border-dashed border-slate-300 px-4 py-10 text-center dark:border-slate-700">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                <Package className="h-7 w-7" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-slate-900 dark:text-white">
                Selecciona un producto pendiente
              </h3>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500 dark:text-slate-400">
                Al elegir un registro de la lista, aquí podrás completar el código de cliente, la
                descripción del cliente y el HTS Match.
              </p>
            </div>
          ) : (
            <form className="mt-6 space-y-6" onSubmit={handleSave}>
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-800/60">
                <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
                  Producto extraído
                </div>
                <div className="mt-3 text-lg font-semibold text-slate-900 dark:text-white">
                  {selectedItem.product}
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                  {draftSource === 'smart'
                    ? `Los campos fueron prellenados inteligentemente desde el catálogo usando la coincidencia "${selectedSuggestion?.sourceProduct || selectedItem.product}". Revísalos antes de guardar.`
                    : smartPrefillRun
                      ? 'No hay una sugerencia inteligente confiable para este producto. Completa los campos manualmente.'
                      : 'Puedes completar los campos manualmente o usar el botón Prellenar inteligente para buscar una sugerencia en Match Productos.'}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {draftSource === 'smart' ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-3 py-1 text-xs font-bold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
                      <Zap className="h-3.5 w-3.5" />
                      Prellenado inteligente
                    </span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-200">
                      {draftSource === 'manual' ? 'Edición manual' : 'Sin sugerencia aplicada'}
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="flex items-center justify-between gap-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  <span>Código producto cliente</span>
                  {draftSource === 'smart' && (
                    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">
                      Inteligente
                    </span>
                  )}
                </label>
                <input
                  value={draft.clientProductCode}
                  onChange={handleDraftChange('clientProductCode')}
                  placeholder="Ej. FLR-001"
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div className="space-y-2">
                <label className="flex items-center justify-between gap-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  <span>Descripción producto cliente</span>
                  {draftSource === 'smart' && (
                    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">
                      Inteligente
                    </span>
                  )}
                </label>
                <input
                  value={draft.clientProductCode}
                  readOnly
                  placeholder="Se guardará igual al código producto cliente"
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-100 px-4 text-sm text-slate-700 outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    HTS Match
                  </label>
                  {draftSource === 'smart' ? (
                    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">
                      Inteligente
                    </span>
                  ) : (
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {smartPrefillRun ? 'Captura manual' : 'Puedes usar el HTS detectado'}
                    </span>
                  )}
                </div>
                <input
                  value={draft.htsMatch}
                  onChange={handleDraftChange('htsMatch')}
                  placeholder="Ej. 0603.11.00.10"
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
                <div className="flex flex-wrap gap-2 pt-1">
                  {selectedItem.htsCandidates.length > 0 ? (
                    selectedItem.htsCandidates.map((hts) => (
                      <button
                        key={hts}
                        type="button"
                        onClick={() => {
                          draftVersionRef.current += 1;
                          draftEditedByUserRef.current = true;
                          setDraftSource('manual');
                          setDraft((current) => ({ ...current, htsMatch: hts }));
                        }}
                        className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-indigo-200 hover:text-indigo-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:border-indigo-500/40 dark:hover:text-indigo-300"
                      >
                        Usar {hts}
                      </button>
                    ))
                  ) : (
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      No se detectó HTS en las facturas de referencia para este producto.
                    </span>
                  )}
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-800/60">
                <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
                  Facturas de referencia
                </div>
                <div className="mt-4 space-y-3">
                  {selectedItem.examples.map((example) => (
                    <div
                      key={`${example.batchItemId}-${example.fileName}-${example.productDescription}`}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-950"
                    >
                      <div className="text-sm font-semibold text-slate-900 dark:text-white">
                        {example.fileName}
                      </div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {example.invoiceNumber
                          ? `Factura ${example.invoiceNumber}`
                          : 'Sin número de factura'}
                        {example.hawb ? ` · HAWB ${example.hawb}` : ''}
                        {example.hts ? ` · HTS ${example.hts}` : ''}
                      </div>
                      <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                        {example.productDescription}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSaving ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {isSaving ? 'Guardando match...' : 'Crear match y retirar pendiente'}
              </button>
            </form>
          )}
        </section>
      </div>
    </div>
  );
};

export default PendingProductMatches;
