import { useMemo, useLayoutEffect } from 'react';
import { useData } from '../context/DataContext';
import {
    DEFAULT_CURRENCY,
    resolveCurrencyFromMasterRows,
    resolveVatPercentFromMasterRows,
    setRuntimeCurrency,
    setRuntimeVatPercent,
    getRuntimeCurrency,
    getCurrencyMeta,
    getDefaultPricingVatPercent,
    getVatPercentForCurrency,
    formatRuntimeCurrencyAmount,
    numberToWordsRuntimeCurrency,
    runtimeAmountColumnHeader,
    runtimeValueColumnHeader,
    runtimeCurrencyFooterNote,
} from '../utils/currency';

/**
 * Resolve Master_EnquiryFor.Currency + VAT_Per for the active division/company
 * and publish them as session runtime values used by quote pricing formatters.
 */
export function useMasterCurrency({
    division = '',
    companyName = '',
    itemName = '',
} = {}) {
    const { masters } = useData();
    const enqItems = masters?.enqItems || [];

    const keys = useMemo(
        () => ({
            departmentName: division,
            companyName,
            itemName,
        }),
        [division, companyName, itemName]
    );

    const currencyCode = useMemo(() => {
        const code = resolveCurrencyFromMasterRows(enqItems, keys);
        setRuntimeCurrency(code);
        return code;
    }, [enqItems, keys]);

    const vatPercent = useMemo(() => {
        const fromMaster = resolveVatPercentFromMasterRows(enqItems, keys);
        const pct =
            fromMaster != null ? fromMaster : getVatPercentForCurrency(currencyCode);
        setRuntimeVatPercent(pct);
        return pct;
    }, [enqItems, keys, currencyCode]);

    useLayoutEffect(() => {
        setRuntimeCurrency(currencyCode);
        setRuntimeVatPercent(vatPercent);
    }, [currencyCode, vatPercent]);

    const meta = useMemo(() => getCurrencyMeta(currencyCode), [currencyCode]);

    return {
        currencyCode,
        vatPercent,
        meta,
        symbol: meta.code,
        formatAmount: formatRuntimeCurrencyAmount,
        numberToWords: numberToWordsRuntimeCurrency,
        amountHeader: runtimeAmountColumnHeader(),
        valueHeader: runtimeValueColumnHeader(),
        footerNote: runtimeCurrencyFooterNote(),
        label: `Currency: ${currencyCode}`,
        vatLabel: `VAT: ${vatPercent}%`,
        getRuntimeCurrency,
        getDefaultPricingVatPercent,
    };
}

export { DEFAULT_CURRENCY, setRuntimeCurrency, getRuntimeCurrency };
