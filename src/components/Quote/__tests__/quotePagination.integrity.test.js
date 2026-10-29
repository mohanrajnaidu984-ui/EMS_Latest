import { describe, it, expect, beforeEach } from 'vitest';
import {
    assertSegmentPageGroupsIntegrity,
    assertSegmentVisibilityOnSheets,
    measureLiveContentFit,
} from '../quoteClausePagination.js';
import { EMS_QUOTE_CONT_USABLE_PX_FALLBACK, PACK_HEIGHT_SAFETY_PX } from '../quotePageGeometry.js';

describe('coverage integrity', () => {
    it('fails on missing or duplicate indices', () => {
        expect(assertSegmentPageGroupsIntegrity([[0, 1], [2]], 3).ok).toBe(true);
        expect(assertSegmentPageGroupsIntegrity([[0, 1]], 3).missing).toEqual([2]);
        expect(assertSegmentPageGroupsIntegrity([[0, 1], [1, 2]], 3).dupes).toEqual([1]);
    });
});

describe('visibility integrity', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('fails when a stamped unit extends past the content limit', () => {
        const root = document.createElement('div');
        root.id = 'quote-preview';
        root.innerHTML = `
          <div class="quote-a4-sheet quote-a4-sheet--continuation">
            <div class="content-section" style="position:relative;height:831px;overflow:hidden">
              <div class="quote-clause-block" data-ems-pack-seg="0" style="position:absolute;top:0;left:0;height:200px;width:100px">A</div>
              <div class="quote-clause-block" data-ems-pack-seg="1" style="position:absolute;top:700px;left:0;height:200px;width:100px">B</div>
            </div>
          </div>
        `;
        document.body.appendChild(root);

        /* happy-dom getBoundingClientRect is often 0 — stub layout. */
        const content = root.querySelector('.content-section');
        const units = [...root.querySelectorAll('[data-ems-pack-seg]')];
        content.getBoundingClientRect = () => ({
            top: 0,
            left: 0,
            bottom: 831,
            right: 180,
            width: 180,
            height: 831,
        });
        units[0].getBoundingClientRect = () => ({
            top: 0,
            left: 0,
            bottom: 200,
            right: 100,
            width: 100,
            height: 200,
        });
        units[1].getBoundingClientRect = () => ({
            top: 700,
            left: 0,
            bottom: 900,
            right: 100,
            width: 100,
            height: 200,
        });

        const vis = assertSegmentVisibilityOnSheets(root, [[0, 1]], 2, {
            usablePx: EMS_QUOTE_CONT_USABLE_PX_FALLBACK,
            reservePx: PACK_HEIGHT_SAFETY_PX,
            segments: [{ html: '<p>A</p>' }, { html: '<p>B</p>' }],
        });
        expect(vis.ok).toBe(false);
        expect(vis.clipped.some((c) => c.seg === 1)).toBe(true);
    });

    it('stamps alone under overflow:hidden do not make measure ok when unclipped bottom exceeds limit', () => {
        const content = document.createElement('div');
        content.className = 'content-section';
        content.style.cssText = 'position:relative;height:400px;overflow:hidden';
        const unit = document.createElement('div');
        unit.setAttribute('data-ems-pack-seg', '0');
        unit.style.cssText = 'position:absolute;top:0;left:0;height:900px;width:50px';
        content.appendChild(unit);
        document.body.appendChild(content);

        content.getBoundingClientRect = () => ({
            top: 0,
            left: 0,
            bottom: 400,
            right: 100,
            width: 100,
            height: 400,
        });
        /* True unclipped bottom (as if overflow:visible). */
        unit.getBoundingClientRect = () => ({
            top: 0,
            left: 0,
            bottom: 900,
            right: 50,
            width: 50,
            height: 900,
        });

        const fit = measureLiveContentFit(content, {
            usablePx: 400,
            reservePx: 12,
            unclippedMeasure: true,
        });
        expect(fit.ok).toBe(false);
        expect(fit.failures.length).toBeGreaterThan(0);
    });

    it('fails when expected non-blank segment is missing from DOM', () => {
        const root = document.createElement('div');
        root.innerHTML = `
          <div class="quote-a4-sheet quote-a4-sheet--continuation">
            <div class="content-section" style="position:relative;height:831px">
              <div data-ems-pack-seg="0">only first</div>
            </div>
          </div>
        `;
        document.body.appendChild(root);
        const content = root.querySelector('.content-section');
        const unit = root.querySelector('[data-ems-pack-seg]');
        content.getBoundingClientRect = () => ({
            top: 0,
            left: 0,
            bottom: 831,
            right: 180,
            width: 180,
            height: 831,
        });
        unit.getBoundingClientRect = () => ({
            top: 0,
            left: 0,
            bottom: 40,
            right: 100,
            width: 100,
            height: 40,
        });

        const vis = assertSegmentVisibilityOnSheets(root, [[0], [1]], 2, {
            usablePx: 831,
            reservePx: 12,
            segments: [{ html: '<p>A</p>' }, { html: '<p>Missing row</p>' }],
        });
        expect(vis.ok).toBe(false);
        expect(vis.missingFromDom).toContain(1);
    });
});
