import type { ProductMatchCatalogItem } from '../types';

const productMatchCatalogCache = new Map<string, ProductMatchCatalogItem[]>();
const productMatchCatalogRequests = new Map<string, Promise<ProductMatchCatalogItem[]>>();
let productMatchCatalogCacheVersion = 0;

export function getProductMatchCatalogCacheVersion(): number {
  return productMatchCatalogCacheVersion;
}

export function getCachedProductMatchCatalog(
  agencyId: string,
): ProductMatchCatalogItem[] | undefined {
  return productMatchCatalogCache.get(agencyId);
}

export function setCachedProductMatchCatalog(
  agencyId: string,
  items: ProductMatchCatalogItem[],
  expectedVersion?: number,
): void {
  if (expectedVersion !== undefined && expectedVersion !== productMatchCatalogCacheVersion) {
    return;
  }

  productMatchCatalogCache.set(agencyId, items);
}

export function invalidateProductMatchCatalogCache(agencyId?: string): void {
  productMatchCatalogCacheVersion += 1;

  if (agencyId) {
    productMatchCatalogCache.delete(agencyId);
    productMatchCatalogRequests.delete(agencyId);
    return;
  }

  productMatchCatalogCache.clear();
  productMatchCatalogRequests.clear();
}

export function getProductMatchCatalogRequest(
  agencyId: string,
): Promise<ProductMatchCatalogItem[]> | undefined {
  return productMatchCatalogRequests.get(agencyId);
}

export function setProductMatchCatalogRequest(
  agencyId: string,
  request: Promise<ProductMatchCatalogItem[]>,
): void {
  productMatchCatalogRequests.set(agencyId, request);
}

export function clearProductMatchCatalogRequest(
  agencyId: string,
  request?: Promise<ProductMatchCatalogItem[]>,
): void {
  if (!request || productMatchCatalogRequests.get(agencyId) === request) {
    productMatchCatalogRequests.delete(agencyId);
  }
}
