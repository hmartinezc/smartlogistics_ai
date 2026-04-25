import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Agency, ProductMatchCatalogItem } from '../types';
import { api, ApiError } from '../services/apiClient';
import { generateId } from '../utils/helpers';
import { AlertCircle, AlertTriangle, ArrowRight, Building, CheckCircle, Package, Pencil, RefreshCw, Save, Search, Trash2, X } from './Icons';

interface ProductMatchCatalogProps {
  currentAgencyId: string;
  currentAgency?: Agency;
}

type ProductMatchDraft = Omit<ProductMatchCatalogItem, 'id' | 'agencyId' | 'createdAt' | 'updatedAt'>;

const EMPTY_DRAFT: ProductMatchDraft = {
  category: '',
  product: '',
  clientProductCode: '',
  productMatch: '',
  hts: '',
  htsMatch: '',
};

const PAGE_SIZE = 12;

const normalizeDraft = (draft: ProductMatchDraft): ProductMatchDraft => ({
  category: draft.category.trim(),
  product: draft.product.trim(),
  clientProductCode: draft.clientProductCode.trim(),
  productMatch: draft.productMatch.trim(),
  hts: draft.hts.trim(),
  htsMatch: draft.htsMatch.trim(),
});

const sortMatches = (items: ProductMatchCatalogItem[]) => [...items].sort((left, right) => {
  return left.product.localeCompare(right.product, 'es', { sensitivity: 'base' });
});

const productMatchCatalogCache = new Map<string, ProductMatchCatalogItem[]>();
const productMatchCatalogRequests = new Map<string, Promise<ProductMatchCatalogItem[]>>();

type LoadCatalogOptions = {
  force?: boolean;
};

const cacheProductMatches = (agencyId: string, items: ProductMatchCatalogItem[]): ProductMatchCatalogItem[] => {
  const sortedItems = sortMatches(items);
  productMatchCatalogCache.set(agencyId, sortedItems);
  return sortedItems;
};

const ProductMatchCatalog: React.FC<ProductMatchCatalogProps> = ({ currentAgencyId, currentAgency }) => {
  const activeAgencyRef = useRef(currentAgencyId);
  const [items, setItems] = useState<ProductMatchCatalogItem[]>([]);
  const [draft, setDraft] = useState<ProductMatchDraft>(EMPTY_DRAFT);
  const [query, setQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  activeAgencyRef.current = currentAgencyId;

  const resetForm = useCallback(() => {
    setDraft(EMPTY_DRAFT);
    setEditingId(null);
  }, []);

  const loadCatalog = useCallback(async ({ force = false }: LoadCatalogOptions = {}) => {
    const agencyId = currentAgencyId;

    if (!currentAgency || agencyId === 'GLOBAL') {
      setItems([]);
      return;
    }

    const cachedItems = productMatchCatalogCache.get(agencyId);
    if (cachedItems && !force) {
      setItems(cachedItems);
      setErrorMessage(null);
      return;
    }

    if (!cachedItems) {
      setItems([]);
    }

    setIsLoading(true);
    setErrorMessage(null);

    let request = productMatchCatalogRequests.get(agencyId);

    try {
      if (!request || force) {
        request = api.getProductMatches(agencyId).then((result) => cacheProductMatches(agencyId, result));
        productMatchCatalogRequests.set(agencyId, request);
      }

      const result = await request;
      if (activeAgencyRef.current === agencyId) {
        setItems(result);
      }
    } catch (error) {
      if (activeAgencyRef.current === agencyId) {
        setErrorMessage(error instanceof ApiError ? error.message : 'No fue posible cargar el catálogo.');
      }
    } finally {
      if (productMatchCatalogRequests.get(agencyId) === request) {
        productMatchCatalogRequests.delete(agencyId);
      }
      if (activeAgencyRef.current === agencyId) {
        setIsLoading(false);
      }
    }
  }, [currentAgency, currentAgencyId]);

  useEffect(() => {
    if (!currentAgency || currentAgencyId === 'GLOBAL') {
      setItems([]);
      setErrorMessage(null);
      setInfoMessage(null);
      resetForm();
      return;
    }

    void loadCatalog();
  }, [currentAgency, currentAgencyId, loadCatalog, resetForm]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return items;
    }

    return items.filter((item) => [
      item.product,
      item.clientProductCode,
      item.productMatch,
      item.htsMatch,
    ]
      .join(' ')
      .toLowerCase()
      .includes(normalizedQuery));
  }, [items, query]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const activePage = Math.min(currentPage, totalPages);
  const pageStartIndex = filteredItems.length === 0 ? 0 : (activePage - 1) * PAGE_SIZE;
  const paginatedItems = useMemo(() => filteredItems.slice(pageStartIndex, pageStartIndex + PAGE_SIZE), [filteredItems, pageStartIndex]);
  const visibleStart = filteredItems.length === 0 ? 0 : pageStartIndex + 1;
  const visibleEnd = Math.min(pageStartIndex + PAGE_SIZE, filteredItems.length);
  const hasActiveSearch = query.trim().length > 0;
  const gridSummary = filteredItems.length === 0
    ? hasActiveSearch
      ? `Sin coincidencias en ${items.length} registros.`
      : 'Sin registros para mostrar.'
    : hasActiveSearch
      ? `Mostrando ${visibleStart}-${visibleEnd} de ${filteredItems.length} coincidencias (${items.length} registros totales).`
      : `Mostrando ${visibleStart}-${visibleEnd} de ${items.length} registros.`;
  const paginationPages = useMemo(() => {
    const firstPage = Math.max(1, Math.min(activePage - 2, totalPages - 4));
    const lastPage = Math.min(totalPages, firstPage + 4);
    return Array.from({ length: lastPage - firstPage + 1 }, (_, index) => firstPage + index);
  }, [activePage, totalPages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [query, currentAgencyId]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const matchedHtsCount = useMemo(() => items.filter((item) => item.htsMatch.trim()).length, [items]);
  const codedProductsCount = useMemo(() => items.filter((item) => item.clientProductCode.trim()).length, [items]);

  const handleDraftChange = (field: keyof ProductMatchDraft) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setDraft((prev) => ({
      ...prev,
      [field]: event.target.value,
    }));
  };

  const handleEdit = (item: ProductMatchCatalogItem) => {
    setEditingId(item.id);
    setDraft({
      category: item.category,
      product: item.product,
      clientProductCode: item.clientProductCode,
      productMatch: item.productMatch,
      hts: item.hts,
      htsMatch: item.htsMatch,
    });
    setErrorMessage(null);
    setInfoMessage(null);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!currentAgency || currentAgencyId === 'GLOBAL') {
      return;
    }

    const normalizedDraft = normalizeDraft(draft);
    if (!normalizedDraft.product) {
      setErrorMessage('El campo Descripción Product es obligatorio.');
      return;
    }

    const payload: ProductMatchCatalogItem = {
      id: editingId || generateId('PMATCH'),
      agencyId: currentAgencyId,
      ...normalizedDraft,
      category: normalizedDraft.product,
    };

    setIsSaving(true);
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      const saved = editingId
        ? await api.updateProductMatch(payload)
        : await api.createProductMatch(payload);

      setItems((prev) => {
        const nextItems = editingId
          ? sortMatches(prev.map((item) => item.id === saved.id ? saved : item))
          : sortMatches([...prev, saved]);

        productMatchCatalogCache.set(currentAgencyId, nextItems);
        return nextItems;
      });

      setInfoMessage(editingId ? 'Match actualizado correctamente.' : 'Match creado correctamente.');
      resetForm();
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : 'No fue posible guardar el match.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (item: ProductMatchCatalogItem) => {
    if (!window.confirm(`¿Eliminar el match para "${item.product}"?`)) {
      return;
    }

    setDeletingId(item.id);
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      await api.deleteProductMatch(item.id);
      setItems((prev) => {
        const nextItems = prev.filter((currentItem) => currentItem.id !== item.id);
        productMatchCatalogCache.set(currentAgencyId, nextItems);
        return nextItems;
      });
      if (editingId === item.id) {
        resetForm();
      }
      setInfoMessage('Match eliminado correctamente.');
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : 'No fue posible eliminar el match.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleBootstrapFromMaster = async () => {
    if (!currentAgency || currentAgencyId === 'GLOBAL') {
      return;
    }

    const shouldBootstrap = window.confirm(
      `Se cargará el catálogo base para ${currentAgency.name}. Las filas idénticas repetidas no se duplicarán y, si una misma Descripción Product aparece varias veces, se conservará la última equivalencia definida para esa descripción. Esta acción solo aplica cuando la grilla está vacía. ¿Deseas continuar?`,
    );

    if (!shouldBootstrap) {
      return;
    }

    setIsBootstrapping(true);
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      const result = await api.bootstrapProductMatches(currentAgencyId);
      await loadCatalog({ force: true });
      resetForm();

      const repeatedDescriptions = Math.max(result.masterRowCount - result.insertedCount, 0);
      const repeatedSuffix = repeatedDescriptions > 0
        ? ` Se consolidaron ${repeatedDescriptions} repeticiones sobre la misma Descripción Product para dejar una sola equivalencia final por descripción.`
        : '';

      setInfoMessage(`Se cargaron ${result.insertedCount} equivalencias base desde la matriz maestra. Las filas idénticas repetidas no se duplican.${repeatedSuffix}`);
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : 'No fue posible cargar el catálogo base.');
    } finally {
      setIsBootstrapping(false);
    }
  };

  if (currentAgencyId === 'GLOBAL') {
    return (
      <div className="p-8 max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="rounded-[28px] border border-dashed border-slate-300 bg-white/90 p-10 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900/70">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300">
            <AlertTriangle className="h-8 w-8" />
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Selecciona una agencia para gestionar su catálogo</h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
            El catálogo Match Productos es específico por agencia. En contexto GLOBAL solo se muestra este estado guiado para evitar cambios fuera de una agencia concreta.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8">
      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-lg shadow-slate-200/40 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
        <div className="border-b border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(99,102,241,0.18),_transparent_45%),linear-gradient(135deg,_rgba(248,250,252,0.92),_rgba(238,242,255,0.86))] px-8 py-8 dark:border-slate-800 dark:bg-[radial-gradient(circle_at_top_left,_rgba(129,140,248,0.18),_transparent_35%),linear-gradient(135deg,_rgba(15,23,42,0.96),_rgba(30,41,59,0.92))]">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.22em] text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300">
                <Package className="h-3.5 w-3.5" />
                Match Productos
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Catálogo de equivalencias por agencia</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                Gestiona la relación entre la descripción de producto que llega en la factura y los datos equivalentes dentro del sistema del cliente. La exportación seguirá derivándose del catálogo vigente sin tocar el JSON persistido.
              </p>
            </div>

            <div className="rounded-2xl border border-white/60 bg-white/80 px-4 py-3 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-950/50">
              <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Agencia activa</div>
              <div className="mt-2 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900">
                  <Building className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">{currentAgency?.name || 'Agencia sin contexto'}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">ID: {currentAgencyId}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 border-b border-slate-200 px-8 py-6 dark:border-slate-800 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-800/60">
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Registros</div>
            <div className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">{items.length}</div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Catálogo cargado para la agencia activa.</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-800/60">
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Cobertura HTS Match</div>
            <div className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">{matchedHtsCount}</div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Registros con homologación HTS capturada.</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-800/60">
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Códigos cliente</div>
            <div className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">{codedProductsCount}</div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Registros con código producto cliente capturado.</p>
          </div>
        </div>

        <div className="px-8 py-6 space-y-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="relative max-w-xl flex-1">
              <Search className="pointer-events-none absolute left-4 top-3.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por descripción product, código cliente, descripción cliente o HTS Match"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-12 text-sm text-slate-600 outline-none transition focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              />
              {query.trim().length > 0 && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Limpiar búsqueda"
                  className="absolute right-2.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-white hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:hover:bg-slate-700 dark:hover:text-slate-100"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void loadCatalog({ force: true })}
                disabled={isLoading || isSaving || isBootstrapping}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                Refrescar catálogo
              </button>
              {items.length === 0 && (
                <button
                  type="button"
                  onClick={() => void handleBootstrapFromMaster()}
                  disabled={isLoading || isSaving || isBootstrapping}
                  className="inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 shadow-sm transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200 dark:hover:bg-emerald-500/20"
                >
                  <CheckCircle className="h-4 w-4" />
                  {isBootstrapping ? 'Cargando base...' : 'Cargar catálogo base'}
                </button>
              )}
            </div>
          </div>

          {(errorMessage || infoMessage) && (
            <div className={`rounded-2xl border px-4 py-3 text-sm ${errorMessage ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200' : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200'}`}>
              <div className="flex items-start gap-2">
                {errorMessage ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" />}
                <span>{errorMessage || infoMessage}</span>
              </div>
            </div>
          )}

          <div className="grid gap-6 2xl:grid-cols-[360px,minmax(0,1fr)]">
            <form onSubmit={handleSubmit} className="rounded-[24px] border border-slate-200 bg-slate-50 p-6 shadow-sm dark:border-slate-700 dark:bg-slate-950/40 2xl:self-start">
              <div className="mb-6 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white">{editingId ? 'Editar equivalencia' : 'Nueva equivalencia'}</h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {editingId ? 'Actualiza la referencia que llega desde la factura y su homologación en el sistema del cliente.' : 'Captura cómo llega el producto en la factura y cómo vive ese mismo producto en el sistema del cliente de la agencia.'}
                  </p>
                </div>

                {editingId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:text-white"
                  >
                    <X className="h-3.5 w-3.5" />
                    Cancelar
                  </button>
                )}
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-200">
                  <p className="font-semibold">Lectura del catálogo</p>
                  <p className="mt-1 leading-6">
                    <span className="font-medium">Descripción Product</span> es la referencia exacta con la que se hace el match desde cada line item. <span className="font-medium">Código producto cliente</span> y <span className="font-medium">Descripción producto cliente</span> representan cómo ese producto existe en el sistema de la agencia.
                  </p>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Descripción Product</label>
                  <input value={draft.product} onChange={handleDraftChange('product')} className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100" placeholder="Valor exacto que llega en el campo Product" />
                  <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">Este valor se toma tal como llega en la factura y es la llave funcional del match.</p>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Código producto cliente</label>
                  <input value={draft.clientProductCode} onChange={handleDraftChange('clientProductCode')} className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100" placeholder="Ej. FLR-001" />
                  <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">Código como existe dentro del sistema del cliente para esta agencia.</p>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Descripción producto cliente</label>
                  <input value={draft.productMatch} onChange={handleDraftChange('productMatch')} className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100" placeholder="Nombre o descripción en el sistema del cliente" />
                  <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">Esta descripción es la que se exportará como referencia del producto para la agencia.</p>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">HTS Match</label>
                  <input value={draft.htsMatch} onChange={handleDraftChange('htsMatch')} className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100" placeholder="Código HTS homologado para exportación" />
                  <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">El campo HTS original se mantiene por compatibilidad, pero ya no forma parte del flujo visible de captura.</p>
                </div>
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <button
                  type="submit"
                  disabled={isSaving || isLoading}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-indigo-500 dark:hover:bg-indigo-400"
                >
                  <Save className="h-4 w-4" />
                  {isSaving ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Crear match'}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  disabled={isSaving}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <RefreshCw className="h-4 w-4" />
                  Limpiar
                </button>
              </div>
            </form>

            <div className="min-w-0 overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
              <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-700">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">Grilla de equivalencias</h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {gridSummary}
                  </p>
                </div>
              </div>

              <div className="overflow-visible">
                <table className="w-full table-fixed divide-y divide-slate-200 dark:divide-slate-700">
                  <colgroup>
                    <col className="w-[18%]" />
                    <col className="w-[17%]" />
                    <col className="w-[23%]" />
                    <col className="w-[16%]" />
                    <col className="w-[26%]" />
                  </colgroup>
                  <thead className="bg-slate-50 dark:bg-slate-800/80">
                    <tr className="text-left text-[11px] font-bold uppercase leading-5 tracking-[0.14em] text-slate-500 dark:text-slate-400">
                      <th className="px-3 py-3">Descripción Product</th>
                      <th className="px-3 py-3">Código cliente</th>
                      <th className="px-3 py-3">Descripción cliente</th>
                      <th className="px-3 py-3">HTS Match</th>
                      <th className="px-3 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {isLoading ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-16 text-center text-sm text-slate-500 dark:text-slate-400">
                          Cargando catálogo...
                        </td>
                      </tr>
                    ) : filteredItems.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-16 text-center">
                          <div className="mx-auto max-w-md text-slate-500 dark:text-slate-400">
                            <Package className="mx-auto h-10 w-10 opacity-40" />
                            <p className="mt-4 text-base font-semibold text-slate-700 dark:text-slate-200">No hay equivalencias para mostrar</p>
                            <p className="mt-2 text-sm leading-6">
                              {items.length === 0 ? 'Puedes crear el primer match manualmente o cargar una base inicial desde la tabla maestra del sistema.' : 'Ajusta la búsqueda o limpia el filtro actual para ver más resultados.'}
                            </p>
                            {items.length === 0 && (
                              <div className="mt-6 space-y-3">
                                <button
                                  type="button"
                                  onClick={() => void handleBootstrapFromMaster()}
                                  disabled={isBootstrapping || isSaving || isLoading}
                                  className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-indigo-500 dark:hover:bg-indigo-400"
                                >
                                  <CheckCircle className="h-4 w-4" />
                                  {isBootstrapping ? 'Cargando catálogo base...' : 'Cargar catálogo base'}
                                </button>
                                <p className="text-xs leading-5 text-slate-400 dark:text-slate-500">
                                  La importación inicial usa la tabla maestra ya depurada. Si una descripción aparece más de una vez, se conserva una sola equivalencia final para evitar duplicados en la agencia.
                                </p>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ) : (
                      paginatedItems.map((item) => {
                        const isEditing = editingId === item.id;

                        return (
                          <tr key={item.id} className={isEditing ? 'bg-indigo-50/70 dark:bg-indigo-500/10' : 'bg-white dark:bg-transparent'}>
                            <td className="relative px-3 py-4 align-top text-sm font-semibold text-slate-900 dark:text-white">
                              <div className="group relative min-w-0">
                                <span
                                  tabIndex={0}
                                  aria-label={`Descripción Product completa: ${item.product}`}
                                  className="block truncate cursor-help rounded-lg outline-none transition-colors hover:text-indigo-700 focus-visible:ring-2 focus-visible:ring-indigo-500/30 dark:hover:text-indigo-200"
                                >
                                  {item.product}
                                </span>
                                <div
                                  role="tooltip"
                                  className="pointer-events-none invisible absolute left-0 top-full z-50 mt-2 w-max max-w-[min(28rem,70vw)] translate-y-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-xs font-medium leading-5 text-slate-700 opacity-0 shadow-xl shadow-slate-900/10 ring-1 ring-slate-900/5 transition-all duration-150 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:ring-white/10"
                                >
                                  <div className="absolute -top-1.5 left-5 h-3 w-3 rotate-45 border-l border-t border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950" />
                                  <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">Descripción Product</p>
                                  <p className="whitespace-normal break-words text-sm font-semibold leading-5 text-slate-900 dark:text-white">{item.product}</p>
                                </div>
                              </div>
                            </td>
                            <td className="break-words px-3 py-4 align-top text-sm text-slate-600 dark:text-slate-300">{item.clientProductCode || '---'}</td>
                            <td className="break-words px-3 py-4 align-top text-sm text-slate-600 dark:text-slate-300">{item.productMatch || '---'}</td>
                            <td className="break-words px-3 py-4 align-top text-sm text-slate-600 dark:text-slate-300">{item.htsMatch || '---'}</td>
                            <td className="whitespace-nowrap px-3 py-4 align-top">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleEdit(item)}
                                  className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-slate-200 px-2.5 py-2 text-xs font-semibold text-slate-600 transition-colors hover:border-indigo-200 hover:text-indigo-700 dark:border-slate-700 dark:text-slate-200 dark:hover:border-indigo-500/30 dark:hover:text-indigo-200"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                  Editar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleDelete(item)}
                                  disabled={deletingId === item.id}
                                  className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-rose-200 px-2.5 py-2 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-500/20 dark:text-rose-300 dark:hover:bg-rose-500/10"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  {deletingId === item.id ? 'Eliminando...' : 'Eliminar'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {filteredItems.length > PAGE_SIZE && (
                <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-4 dark:border-slate-700 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Página {activePage} de {totalPages} · {PAGE_SIZE} items por página
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                      disabled={activePage === 1}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition-colors hover:border-indigo-200 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:border-indigo-500/30 dark:hover:text-indigo-200"
                      aria-label="Página anterior"
                    >
                      <ArrowRight className="h-4 w-4 rotate-180" />
                    </button>
                    {paginationPages.map((page) => (
                      <button
                        key={page}
                        type="button"
                        onClick={() => setCurrentPage(page)}
                        className={`inline-flex h-9 min-w-9 items-center justify-center rounded-xl px-3 text-sm font-semibold transition-colors ${page === activePage ? 'bg-slate-900 text-white dark:bg-indigo-500' : 'border border-slate-200 text-slate-600 hover:border-indigo-200 hover:text-indigo-700 dark:border-slate-700 dark:text-slate-200 dark:hover:border-indigo-500/30 dark:hover:text-indigo-200'}`}
                        aria-current={page === activePage ? 'page' : undefined}
                      >
                        {page}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                      disabled={activePage === totalPages}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition-colors hover:border-indigo-200 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:border-indigo-500/30 dark:hover:text-indigo-200"
                      aria-label="Página siguiente"
                    >
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default ProductMatchCatalog;