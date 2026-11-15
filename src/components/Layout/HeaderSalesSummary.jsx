import React, { useEffect, useRef, useState } from 'react';
import { readJsonInFlight } from '../../utils/inflightApiJson';
import { achievementDirection, buildHeaderSalesFrames, formatHeaderSalesAmount } from './headerSalesSummaryTotals';
import './HeaderSalesSummary.css';
import HeaderTopDivisions from './HeaderTopDivisions';

const HEADER_ROTATION_INTERVAL_MS = 5000;

export default function HeaderSalesSummary({ email }) {
    const identity = String(email || '').trim().toLowerCase();
    const [result, setResult] = useState(null);
    const rotationPaused = useRef(false);
    const [rotationStep,setRotationStep] = useState(0);
    const [previousStep,setPreviousStep] = useState(null);
    const current = result?.identity === identity ? result : null;
    const frameCount = current?.frames?.length || 0;
    const rankingCount = current?.topDivisions?.length || 0;
    const frameIndex = frameCount ? rotationStep % frameCount : 0;
    const previousIndex = previousStep == null || !frameCount ? null : previousStep % frameCount;

    useEffect(() => {
        setRotationStep(0);
        setPreviousStep(null);
        if (Math.max(frameCount,rankingCount) < 2) return;
        let step = 0;
        const timer = setInterval(() => {
            if (rotationPaused.current) return;
            setPreviousStep(step);
            step += 1;
            setRotationStep(step);
        }, HEADER_ROTATION_INTERVAL_MS);
        return () => clearInterval(timer);
    }, [identity,frameCount,rankingCount]);

    useEffect(() => {
        if (previousStep == null) return;
        const timer = setTimeout(() => setPreviousStep(null),450);
        return () => clearTimeout(timer);
    }, [rotationStep,previousStep]);

    useEffect(() => {
        if (!identity) return;
        let disposed = false;
        let loading = false;
        let lastAttempt = 0;
        const refresh = async () => {
            if (loading || document.visibilityState === 'hidden') return;
            loading = true;
            lastAttempt = Date.now();
            const year = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Riyadh', year: 'numeric' }).format(new Date());
            try {
                // No company/division/SE overrides: the API derives access from the signed-in email.
                const params = new URLSearchParams({ year, email: identity, currency: 'BHD', view: 'header' });
                const response = await readJsonInFlight(`/api/sales-report/summary?${params}`);
                if (!response.ok || response.data?.currency !== 'BHD') throw new Error('BHD sales summary unavailable');
                if (!disposed) setResult({ identity, year, frames: buildHeaderSalesFrames(response.data),
                    topDivisions: response.data.topDivisions || [], topDivisionsUnavailable: response.data.topDivisionsUnavailable });
            } catch {
                if (!disposed) setResult({ identity, unavailable: true });
            } finally { loading = false; }
        };
        const onVisible = () => {
            if (Date.now() - lastAttempt >= 60000) void refresh();
        };
        void refresh();
        const interval = setInterval(refresh, 5 * 60 * 1000);
        window.addEventListener('focus', onVisible);
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            disposed = true;
            clearInterval(interval);
            window.removeEventListener('focus', onVisible);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [identity]);

    if (!identity) return null;
    const frame = current?.frames?.[frameIndex % frameCount];
    const metric = (label, values) => (
        <span className="ems-header-sales__metric">
            <span>{label}:</span>
            {values ? <>
                <strong className="ems-header-sales__actual">{formatHeaderSalesAmount(values.actual)}</strong>
                <span>/</span>
                <strong className="ems-header-sales__target">{formatHeaderSalesAmount(values.target)}</strong>
                <strong className={values.percent == null ? '' : values.percent >= 100 ? 'ems-header-sales__met' : 'ems-header-sales__below'}>
                    {values.percent == null ? '—' : `${values.percent}% ${achievementDirection(values)}`}
                </strong>
            </> : <span>{current?.unavailable ? 'Unavailable' : '…'}</span>}
        </span>
    );
    const details = current && !current.unavailable
        ? `${current.year} · ${frame.label} · Your Sales Report access · Booking ${frame.booking.actual.toLocaleString('en-US')} / ${frame.booking.target.toLocaleString('en-US')} · GP ${frame.gp.actual.toLocaleString('en-US')} / ${frame.gp.target.toLocaleString('en-US')}`
        : 'Current-year figures for your Sales Report access';
    const renderFrame = (item, outgoing = false) => <div
        key={`${outgoing ? 'previous' : 'current'}-${item?.label || 'loading'}`}
        className={`ems-header-sales__row${outgoing ? ' ems-header-sales__row--out' : previousIndex != null ? ' ems-header-sales__row--in' : ''}`}
        aria-hidden={outgoing || undefined}
    >
        <strong className="ems-header-sales__period">{current?.year || new Intl.DateTimeFormat('en', { timeZone: 'Asia/Riyadh', year: 'numeric' }).format(new Date())} {item?.label || 'Total'} (BHD)</strong>
        {metric('Booking Achieved Vs Target', item?.booking)}
        <span className="ems-header-sales__separator" aria-hidden="true">|</span>
        {metric('GP Achieved Vs Target', item?.gp)}
    </div>;
    return <div className="ems-header-sales" onMouseEnter={() => { rotationPaused.current = true; }} onMouseLeave={() => { rotationPaused.current = false; }} title={details} aria-label="Annual booking and gross profit achievement">
        <div className="ems-header-sales__viewport">
            {/* Reserve the widest period so the ranking never shifts horizontally. */}
            {current?.frames?.map(item => <div key={'size-'+item.label} className="ems-header-sales__row ems-header-sales__sizer" aria-hidden="true">
                <strong style={{minWidth:70}}>{current.year} {item.label} (BHD)</strong>
                {metric('Booking Achieved Vs Target',item.booking)}
                <span className="ems-header-sales__separator">|</span>
                {metric('GP Achieved Vs Target',item.gp)}
            </div>)}

            {previousIndex != null && current?.frames?.[previousIndex] ? renderFrame(current.frames[previousIndex], true) : null}
            {renderFrame(frame)}
        </div>
        <span className="ems-header-sales__ranking-separator" aria-hidden="true">|</span>
        <HeaderTopDivisions step={rotationStep} previousStep={previousStep} divisions={current?.topDivisions} unavailable={current?.unavailable || current?.topDivisionsUnavailable} />
    </div>;
}
