import { AwbReconciliationRow, BatchItem, BookedAwbRecord, InvoicedAwbRecord, OperationalQueryParams } from '../types';

const toDateKey = (dateValue?: string | Date): string => {
  const date = dateValue instanceof Date ? dateValue : dateValue ? new Date(dateValue) : new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseDateKey = (dateKey: string): Date => {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const buildHash = (value: string): number => {
  return value.split('').reduce((accumulator, char) => accumulator + char.charCodeAt(0), 0);
};

export const getOperationDateKey = (dateValue?: string): string => toDateKey(dateValue);

export const shiftOperationDateKey = (dateKey: string, offsetDays: number): string => {
  const date = parseDateKey(dateKey);
  date.setDate(date.getDate() + offsetDays);
  return toDateKey(date);
};

export const getOperationDateRange = (operationDate: string, beforeDays = 1, afterDays = 1) => ({
  startDate: shiftOperationDateKey(operationDate, -beforeDays),
  endDate: shiftOperationDateKey(operationDate, afterDays),
});

export const isOperationDateInRange = (operationDate: string, startDate: string, endDate: string): boolean => (
  operationDate >= startDate && operationDate <= endDate
);

export const getBatchItemOperationDate = (item: BatchItem): string => (
  getOperationDateKey(item.createdAt || item.processedAt)
);

export const buildInvoicedAwbRecords = (
  results: BatchItem[],
  params: OperationalQueryParams
): InvoicedAwbRecord[] => {
  const summary = new Map<string, InvoicedAwbRecord>();
  const startDate = params.operationDateStart || params.operationDate;
  const endDate = params.operationDateEnd || params.operationDate;

  results
    .filter((item) => item.status === 'SUCCESS' && item.result)
    .filter((item) => params.agencyId === 'GLOBAL' || item.agencyId === params.agencyId)
    .filter((item) => isOperationDateInRange(getBatchItemOperationDate(item), startDate, endDate))
    .forEach((item) => {
      const mawb = item.result?.mawb || 'UNKNOWN';
      const current = summary.get(mawb) || {
        mawb,
        invoicedHijas: 0,
        invoicedPieces: 0,
        invoicedFulls: 0,
        operationDate: params.operationDate,
        agencyId: params.agencyId,
      };

      current.invoicedHijas += 1;
      current.invoicedPieces += item.result?.totalPieces || 0;
      current.invoicedFulls += item.result?.totalEq || 0;
      summary.set(mawb, current);
    });

  return Array.from(summary.values());
};

export const getMockBookedAwbs = (
  params: OperationalQueryParams,
  invoicedRecords: InvoicedAwbRecord[]
): BookedAwbRecord[] => {
  const bookedRecords = invoicedRecords.map((record) => {
    const hash = buildHash(`${record.mawb}-${params.operationDate}`) % 4;

    if (hash === 0) {
      return {
        mawb: record.mawb,
        bookedHijas: record.invoicedHijas,
        bookedPieces: record.invoicedPieces,
        bookedFulls: record.invoicedFulls,
        operationDate: params.operationDate,
        agencyId: params.agencyId,
      };
    }

    if (hash === 1) {
      return {
        mawb: record.mawb,
        bookedHijas: record.invoicedHijas + 1,
        bookedPieces: record.invoicedPieces + 12,
        bookedFulls: parseFloat((record.invoicedFulls + 0.5).toFixed(2)),
        operationDate: params.operationDate,
        agencyId: params.agencyId,
      };
    }

    if (hash === 2) {
      return {
        mawb: record.mawb,
        bookedHijas: Math.max(record.invoicedHijas - 1, 0),
        bookedPieces: record.invoicedPieces,
        bookedFulls: 0,
        operationDate: params.operationDate,
        agencyId: params.agencyId,
      };
    }

    return {
      mawb: record.mawb,
      bookedHijas: record.invoicedHijas,
      bookedPieces: record.invoicedPieces,
      bookedFulls: record.invoicedFulls,
      operationDate: params.operationDate,
      agencyId: params.agencyId,
    };
  });

  const syntheticHash = buildHash(`${params.agencyId}-${params.operationDate}`);
  const syntheticMawb = `MOCK-${params.operationDate.replace(/-/g, '').slice(2)}-${String((syntheticHash % 900) + 100)}`;
  bookedRecords.push({
    mawb: syntheticMawb,
    bookedHijas: 2 + (syntheticHash % 3),
    bookedPieces: 80 + (syntheticHash % 40),
    bookedFulls: parseFloat((2 + (syntheticHash % 5) * 0.25).toFixed(2)),
    operationDate: params.operationDate,
    agencyId: params.agencyId,
  });

  return bookedRecords;
};

export const buildAwbReconciliationRows = (
  bookedRecords: BookedAwbRecord[],
  invoicedRecords: InvoicedAwbRecord[]
): AwbReconciliationRow[] => {
  const bookedMap = new Map(bookedRecords.map((record) => [record.mawb, record]));
  const invoicedMap = new Map(invoicedRecords.map((record) => [record.mawb, record]));
  const awbKeys = Array.from(new Set([...bookedMap.keys(), ...invoicedMap.keys()]));

  return awbKeys.map((mawb) => {
    const booked = bookedMap.get(mawb);
    const invoiced = invoicedMap.get(mawb);
    const bookedMissing = !booked;
    const invoicedMissing = !invoiced;
    const hasIncompleteData = Boolean(booked && booked.bookedFulls === 0) || Boolean(invoiced && invoiced.invoicedFulls === 0);
    const hasMismatch = Boolean(
      booked && invoiced && (
        booked.bookedHijas !== invoiced.invoicedHijas ||
        booked.bookedPieces !== invoiced.invoicedPieces ||
        Math.abs(booked.bookedFulls - invoiced.invoicedFulls) > 0.1
      )
    );

    let status: AwbReconciliationRow['status'] = 'MATCHED';
    if (bookedMissing || invoicedMissing) {
      status = 'PENDING_DOCUMENTS';
    } else if (hasIncompleteData) {
      status = 'PARTIAL';
    } else if (hasMismatch) {
      status = 'DISCREPANCY';
    }

    return {
      mawb,
      bookedHijas: booked?.bookedHijas || 0,
      bookedPieces: booked?.bookedPieces || 0,
      bookedFulls: booked?.bookedFulls || 0,
      invoicedHijas: invoiced?.invoicedHijas || 0,
      invoicedPieces: invoiced?.invoicedPieces || 0,
      invoicedFulls: invoiced?.invoicedFulls || 0,
      operationDate: booked?.operationDate || invoiced?.operationDate || toDateKey(),
      agencyId: booked?.agencyId || invoiced?.agencyId || 'GLOBAL',
      status,
    };
  }).sort((left, right) => left.mawb.localeCompare(right.mawb));
};