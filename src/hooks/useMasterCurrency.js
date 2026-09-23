import { useMemo, useEffect } from 'react';
import { useData } from '../context/DataContext';
import {
    DEFAULT_CURRENCY,
    resolveCurrencyFromMasterRows,
    setRuntimeCurrency,
    getRuntimeCurrency,
    getCurrencyMeta,
    formatRuntimeCurrencyAmount,
    numberToWordsRuntimeCurrency,
    runtimeAmountColumnHeader,
    runtimeValueColumnHeader,
    runtimeCurrencyFooterNote,
} from '../utils/currency';

/**
 * Resolve Master_EnquiryFor.Currency for the active division/company and publish it
 * as the session runtime currency used by formatters across EMS modules.
 */
export function useMasterCurrency({
    division = '',
    companyName = '',
    itemName = '',
} = {}) {
    const { masters } = useData();
    const enqItems = masters?.enqItems || [];

    const currencyCode = useMemo(
        () =>
            resolveCurrencyFromMasterRows(enqItems, {
                departmentName: division,
                companyName,
                itemName,
            }),
        [enqItems, division, companyName, itemName]
    );

    useEffect(() => {
        setRuntimeCurrency(currencyCode);
    }, [currencyCode]);

    const meta = useMemo(() => getCurrencyMeta(currencyCode), [currencyCode]);

    return {
        currencyCode,
        meta,
        symbol: meta.code,
        formatAmount: formatRuntimeCurrencyAmount,
        numberToWords: numberToWordsRuntimeCurrency,
        amountHeader: runtimeAmountColumnHeader(),
        valueHeader: runtimeValueColumnHeader(),
        footerNote: runtimeCurrencyFooterNote(),
        label: `Currency: ${currencyCode}`,
        getRuntimeCurrency,
    };
}

export { DEFAULT_CURRENCY, setRuntimeCurrency, getRuntimeCurrency };
