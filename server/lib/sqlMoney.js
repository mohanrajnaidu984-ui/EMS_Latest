'use strict';

/**
 * SQL expression helpers to parse money NVARCHAR that may include currency codes
 * (BD, BHD, AED, …) stored by EMS modules.
 */

const CURRENCY_TOKENS = ['BD', 'BHD', 'AED', 'SAR', 'USD', 'EUR', 'GBP', 'KWD', 'OMR', 'QAR', 'KD'];

/**
 * Wrap a SQL NVARCHAR expression so commas + currency tokens are stripped before TRY_CONVERT.
 * @param {string} expr e.g. `ISNULL(CAST(Price AS NVARCHAR(50)), N'0')`
 * @returns {string} nested REPLACE(...) expression
 */
function sqlStripCurrencyNoise(expr) {
    let s = `LTRIM(RTRIM(${expr}))`;
    s = `REPLACE(${s}, N',', N'')`;
    for (const token of CURRENCY_TOKENS) {
        s = `REPLACE(${s}, N'${token}', N'')`;
    }
    s = `REPLACE(${s}, N' ', N'')`;
    return s;
}

/**
 * TRY_CONVERT DECIMAL from a money NVARCHAR column/expression.
 * @param {string} expr
 * @param {string} [scale='18,2']
 */
function sqlTryMoney(expr, scale = '18,2') {
    return `TRY_CONVERT(DECIMAL(${scale}), ${sqlStripCurrencyNoise(expr)})`;
}

module.exports = {
    CURRENCY_TOKENS,
    sqlStripCurrencyNoise,
    sqlTryMoney,
};
