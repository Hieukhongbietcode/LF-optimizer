// ==UserScript==
// @name         Combined Loan Factory Optimizer & Suite (Unified Architecture)
// @namespace    http://tampermonkey.net/
// @version      100.9.69
// @description  Update Sept 21st, 2026 — Combined Optimizer, Discard (incl. Navigation Discard Protection), Nav Customizer, Docs Shortcuts, Employment Copy, Auto-Nav, Auto-Availability, Liabilities Copier (skips $0/$0 rows) + Liabilities Column Sorting, Financials Copier, Pipeline Sorting, Phone Formatting, Absolute Scroll Suppression, and Clean Paste.
// @author       Jake Tran
// @match        *://*.loanfactory.com/*
// @match        *://loanfactory.com/*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/Hieukhongbietcode/LF-optimizer/main/loan-factory-optimizer.user.js
// @downloadURL  https://raw.githubusercontent.com/Hieukhongbietcode/LF-optimizer/main/loan-factory-optimizer.user.js
// @supportURL   https://github.com/Hieukhongbietcode/LF-optimizer/issues
// @homepageURL  https://github.com/Hieukhongbietcode/LF-optimizer
// ==/UserScript==

// RELEASE CHECKLIST - two things on every release:
//   1. bump @version                  (Tampermonkey only offers an update if this rises)
//   2. set the date in @description   (format: "Update Mon DDth, YYYY - ...")
//
// @name must NEVER change. Tampermonkey identifies a script by @name + @namespace, so
// a new name reads as a different script: the raw link then offers "Install" instead of
// "Update", and the user ends up running two copies at once. The release date lives in
// @description for exactly that reason.

(function() {
    'use strict';

    console.log('%c[LF Optimizer] v100.9.69 loaded', 'color:#f36f20;font-weight:bold;');

    // ==========================================
    // DESIGN TOKENS (v100.9.41)
    // One place for the colours, radii and type sizes this script paints with.
    // Before this there were five different greens all meaning "done" and four reds
    // all meaning "careful", which read as slightly-off rather than deliberate.
    //
    // NOT included here on purpose: the pipeline row palettes, the borrower-name
    // colour, the Resubmit chip green, the disclose-due pink, the LTV gradient and
    // the Jake preset. Those are choices that were asked for specifically, or that
    // users pick themselves - they are values, not styling.
    // ==========================================
    const LFC = {
        brand:      '#f36f20',
        brandDark:  '#d95707',
        ok:         '#16a34a',
        okDark:     '#15803d',
        okBg:       'rgba(22, 163, 74, .12)',
        danger:     '#dc2626',
        dangerDark: '#b91c1c',
        warn:       '#f59e0b',
        info:       '#2563eb',
        ink:        '#334155',
        inkSoft:    '#64748b',
        muted:      '#94a3b8',
        line:       '#e2e8f0',
        lineStrong: '#cbd5e1',
        surface:    '#ffffff',
        surfaceAlt: '#f8fafc'
    };
    const LFR = { sm: '4px', md: '6px', lg: '10px', pill: '999px' };

    // ==========================================
    // WORKING HOURS BY REGION (v100.9.45)
    // The SLA clock only advances during working hours, and those hours were fixed at
    // 9-18. Everything is stated in Pacific because that is the clock the portal's
    // timestamps are already on - picking "East Coast" therefore means 6 AM - 3 PM
    // Pacific, which is a 9-5 day on the east coast. No timezone conversion happens,
    // so nothing else in the script has to change.
    // ==========================================
    const LF_TT_SHIFTS = {
        east:     { label: 'East Coast',  start: 6,  end: 15, note: '6:00 AM \u2013 3:00 PM PST' },
        central:  { label: 'Central',     start: 7,  end: 16, note: '7:00 AM \u2013 4:00 PM PST' },
        mountain: { label: 'Mountain',    start: 8,  end: 17, note: '8:00 AM \u2013 5:00 PM PST' },
        west:     { label: 'West Coast',  start: 9,  end: 18, note: '9:00 AM \u2013 6:00 PM PST' }
    };
    const LF_TT_SHIFT_KEY = 'lf_tt_shift';

    function lfTtShift() {
        const k = localStorage.getItem(LF_TT_SHIFT_KEY);
        return LF_TT_SHIFTS[k] ? LF_TT_SHIFTS[k] : LF_TT_SHIFTS.west;   // unchanged default
    }
    function lfTtShiftKey() {
        const k = localStorage.getItem(LF_TT_SHIFT_KEY);
        return LF_TT_SHIFTS[k] ? k : 'west';
    }
    function lfTtCountedNote() {
        const sh = lfTtShift();
        return 'Counted Mon\u2013Fri, ' + sh.note + ' only (' + sh.label + ').';
    }

    // ==========================================
    // ESCALATION DESK COPY BUTTONS (v100.8.85)
    // That table has no "Borrower" header, so the pipeline's copy buttons never
    // applied here. This adds one next to the borrower name and one next to the
    // loan number in the Transaction column.
    // ==========================================
    // v100.9.6: puts rows back in their true order so the app's own click handling
    // works, then the master loop re-applies the visual sort a moment later.
    let lfOrderRestoredAt = 0;
    function lfRestoreDomOrder() {
        let touched = false;
        document.querySelectorAll('tbody[data-lf-sorted="1"]').forEach(tbody => {
            const rows = Array.from(tbody.querySelectorAll('tr')).filter(r => r.hasAttribute('data-lf-orig-index'));
            if (rows.length < 2) return;
            rows.sort((a, b) => parseInt(a.dataset.lfOrigIndex) - parseInt(b.dataset.lfOrigIndex));
            let out = false;
            for (let i = 1; i < rows.length; i++) {
                if (rows[i].previousElementSibling !== rows[i - 1]) { out = true; break; }
            }
            if (!out) return;
            const frag = document.createDocumentFragment();
            rows.forEach(r => frag.appendChild(r));
            tbody.appendChild(frag);
            touched = true;
        });
        if (touched) lfOrderRestoredAt = Date.now();
        return touched;
    }

    // v100.9.7/9.8: GWT CellTable resolves a cell's content root as the <td>'s FIRST
    // element child and then IGNORES any click whose target is not inside that root.
    // Anything we add as a direct child of the <td> can therefore silently kill every
    // click in that cell - which is exactly what happened to "View Loan" (v100.8.79,
    // which adds nothing to that cell, still works).
    // So: never sit beside the app's container - sit INSIDE it.
    const LF_OURS_SEL = '.lf-icon-btn, .lf-esc-name-btn, .lf-esc-num-btn, .lf-rd-label, .lf-dd-label, .sla-badge-container, .lf-ds-start-btn, .lf-bulk-wrap, .lf-copy-btn, .lf-emp-copy-btn, .lf-hdr-copy-btn, .lf-name-copy-btn, .lf-chip-row';
    function lfKeepCellRootNative() {
        document.querySelectorAll('td, th').forEach(cell => {
            const first = cell.firstElementChild;
            if (!first || !first.matches || !first.matches(LF_OURS_SEL)) return;

            // v100.9.14: do NOT promote a native element to the front. The previous
            // version did, and when the element it promoted was the little "+Labels"
            // span rather than the container holding "View Loan", GWT treated that span
            // as the cell's content root - so every click on "View Loan" (which sits
            // outside it) was ignored. Rows that happened to carry an app label were
            // ordered differently and escaped it, which is exactly the split reported.
            // Instead, move OUR elements inside the app's real container, leaving the
            // app's own structure and its first element exactly as they were.
            const host = Array.from(cell.children).find(k => k.matches && !k.matches(LF_OURS_SEL));
            if (!host) return;
            Array.from(cell.children).forEach(k => {
                if (k === host || !k.matches || !k.matches(LF_OURS_SEL)) return;
                if (k.parentElement !== cell) return;
                host.appendChild(k);   // the chip row is re-positioned by lfPlaceChipRow afterwards
            });
        });
    }

    // v100.9.12: the app's own labels (HELOC, resub, ...) sit on the same line as
    // "+Labels". Our chip row must go ABOVE that whole group, not just above the
    // "+Labels" chip - otherwise those labels get pushed onto their own line above ours.
    // A sibling counts as part of the group when it shares a class with "+Labels",
    // which reliably distinguishes the app's pills from the name / loan number.
    function lfLabelGroupStart(chip) {
        try {
            const chipClasses = new Set(String(chip.className || '').split(/\s+/).filter(Boolean));
            if (!chipClasses.size) return chip;
            let start = chip;
            while (start.previousElementSibling) {
                const prev = start.previousElementSibling;
                if (prev.matches && prev.matches(LF_OURS_SEL)) break;          // our own elements
                const pc = String(prev.className || '').split(/\s+/).filter(Boolean);
                if (!pc.some(c => chipClasses.has(c))) break;                   // not one of the app's pills
                start = prev;
            }
            return start;
        } catch (e) { return chip; }
    }

    // v100.9.13: ONE placement rule, so nothing fights over the row.
    // The row goes directly above the app's label group - unless that would make it the
    // first element in its container. GWT uses the first element as the cell's content
    // root and ignores clicks outside it, which is what kept killing "View Loan" on
    // tickets that had no app label of their own (nothing preceded our row there).
    // In that case it goes immediately AFTER the first element instead.
    function lfPlaceChipRow(chipRow, groupStart) {
        try {
            const parent = groupStart.parentNode;
            if (!parent) return;
            // v100.9.15: never sit directly in a <td>/<th>. GWT uses a cell's first
            // element as its content root, so anything of ours at that level can stop
            // the app's own buttons from responding. If the anchor is a direct child of
            // the cell, go INSIDE it instead of beside it.
            if (parent.tagName === 'TD' || parent.tagName === 'TH') {
                if (groupStart.firstChild) groupStart.insertBefore(chipRow, groupStart.firstChild);
                else groupStart.appendChild(chipRow);
                return;
            }
            if (chipRow.parentNode === parent && chipRow.nextElementSibling === groupStart) return;   // already right
            parent.insertBefore(chipRow, groupStart);
        } catch (e) {}
    }

    // ==========================================
    // HIDE UNWANTED ACTION MENU ITEMS (v100.9.17)
    // Removes "Loan Officer Change Request" from every Action dropdown. The item is
    // hidden rather than deleted, so the app's own menu structure and its indexes stay
    // exactly as they were - deleting nodes from a GWT menu risks the same class of
    // breakage that hit the "View Loan" button.
    // ==========================================
    const LF_HIDDEN_ACTIONS = [/loan\s*officer\s*change\s*request/i];

    function lfHideUnwantedActions() {
        document.querySelectorAll('a, li, span, div, button').forEach(el => {
            if (el.dataset.lfActionChecked === '1') return;
            const t = (el.textContent || '').trim();
            if (!t || t.length > 60) return;
            if (!LF_HIDDEN_ACTIONS.some(rx => rx.test(t))) return;
            // only the innermost element carrying that text
            if (el.querySelector && Array.from(el.querySelectorAll('*')).some(c => LF_HIDDEN_ACTIONS.some(rx => rx.test((c.textContent || '').trim())))) return;
            const item = el.closest('li') || el;
            item.dataset.lfActionChecked = '1';
            item.style.setProperty('display', 'none', 'important');
        });
    }

    // ==========================================
    // AUTO-DISMISS "WARNING NOTICE" (v100.9.19)
    // The portal throws this modal up on every refresh ("It is crucial to complete
    // these tasks before their respective due dates to avoid potential account
    // lockout") and it has to be closed by hand each time. This closes it the moment
    // it appears, using the modal's OWN close control - the same thing the user was
    // clicking - so the app tears down its backdrop and body classes normally.
    // Nothing else is touched: only a dialog whose heading is "WARNING NOTICE".
    // ==========================================
    // v100.9.21: off unless the user turns it on in the palette panel.
    function lfWarnDismissOn() { return localStorage.getItem('lf_disable_warning_notice') === 'true'; }

    function lfDismissWarningNotice() {
        try {
            if (!lfWarnDismissOn()) return;
            // Find the heading, then the dialog that contains it.
            let head = null;
            for (const el of document.querySelectorAll('h1,h2,h3,h4,h5,div,span,strong,b,p')) {
                const t = (el.textContent || '').trim();
                if (!/^warning\s*notice$/i.test(t)) continue;
                if (el.querySelector('h1,h2,h3,h4,h5,div,span,strong,b,p')) continue;   // innermost only
                if (!el.offsetParent && el.offsetWidth === 0 && el.offsetHeight === 0) continue;
                head = el;
                break;
            }
            if (!head) return;

            // Walk up to the dialog/modal box that holds the heading and its close button
            let box = head;
            for (let i = 0; i < 8 && box.parentElement; i++) {
                box = box.parentElement;
                const cls = (box.className || '') + '';
                if (/modal|dialog|popup/i.test(cls) || box.getAttribute('role') === 'dialog') break;
            }
            if (!box || box === document.body) box = head.parentElement;
            if (!box || box.dataset.lfWarnDone === '1') return;

            // The modal's own close control: data-dismiss, aria-label, or an x glyph
            let closeBtn = box.querySelector('[data-dismiss="modal"], [data-bs-dismiss="modal"], [aria-label="Close" i], .close, .btn-close');
            if (!closeBtn) {
                closeBtn = Array.from(box.querySelectorAll('button, a, span, i, div')).find(b => {
                    const t = (b.textContent || '').trim();
                    return (t === '\u00d7' || t === 'x' || t === 'X' || t === '\u2715' || t === '\u2716') &&
                           b.offsetWidth > 0 && b.offsetWidth < 60;
                });
            }

            box.dataset.lfWarnDone = '1';
            if (closeBtn) {
                closeBtn.click();
                console.log('[LF Optimizer] WARNING NOTICE dismissed');
            } else {
                // No close control found - hide it rather than leave it blocking the page
                box.style.setProperty('display', 'none', 'important');
                document.querySelectorAll('.modal-backdrop, .fade.show').forEach(bd => {
                    if (bd.classList.contains('modal-backdrop')) bd.remove();
                });
                document.body.classList.remove('modal-open');
                document.body.style.removeProperty('overflow');
                document.body.style.removeProperty('padding-right');
                console.log('[LF Optimizer] WARNING NOTICE hidden');
            }
        } catch (e) {}
    }

    function lfEscMakeCopyBtn(text, title) {
        const b = document.createElement('button');
        b.className = 'lf-icon-btn';
        b.setAttribute('data-copy-text', text);
        b.innerHTML = COPY_SVG;
        b.title = title;
        b.onclick = async (e) => {
            e.preventDefault(); e.stopPropagation();
            try {
                await navigator.clipboard.writeText(text);
                b.innerHTML = CHECK_SVG;
                showToast(`Copied: ${text}`);
                setTimeout(() => { b.innerHTML = COPY_SVG; }, 1000);
            } catch (err) {}
        };
        return b;
    }

    // v100.9.1: SELF-REPAIR. Earlier versions could insert a copy button INSIDE an
    // interactive control ("View Loan"). A <button> nested in an <a>/<button> is invalid,
    // the browser restructures the DOM to fix it, and the control stops responding -
    // including Ctrl+click to open in a new tab. This moves any such button out to be a
    // sibling, repairing rows that were already mangled in the current page.
    function lfRepairNestedButtons() {
        document.querySelectorAll('a .lf-icon-btn, button .lf-icon-btn, [role="button"] .lf-icon-btn, .btn .lf-icon-btn').forEach(btn => {
            const host = btn.closest('a, button, [role="button"], .btn');
            if (!host || host === btn || host.contains(btn) === false) return;
            if (host.parentNode) host.parentNode.insertBefore(btn, host.nextSibling);
        });
        // Same for the chips
        document.querySelectorAll('a .lf-rd-label, button .lf-rd-label, a .lf-dd-label, button .lf-dd-label').forEach(el => {
            const host = el.closest('a, button, [role="button"], .btn');
            if (host && host.parentNode && host !== el) host.parentNode.insertBefore(el, host.nextSibling);
        });
    }

    // v100.9.3: master switch for everything this script injects INTO ticket rows.
    // Turning it off is the quickest way to confirm whether those injections are what
    // breaks the app's own click handling (Ctrl+click on "View Loan").
    // v100.9.9: the row extras are always on. What made "View Loan" clickable was not
    // switching them off - it was placing them INSIDE the app's own cell container
    // (see lfKeepCellRootNative), so GWT's cell lookup is never disturbed.
    function lfEscExtrasOn() { return true; }

    function lfEscInjectCopyButtons() {
        if (!lfEscExtrasOn()) return;
        if (!/escalation_desk/i.test(location.href)) return;

        document.querySelectorAll('table').forEach(table => {
            if (table.closest('.modal, .ui-dialog')) return;
            // v100.8.86: locate the Transaction column by its HEADER. The old code
            // required the cell to contain an <a> - but the borrower name here is not
            // an anchor, so nothing was ever matched.
            const heads = Array.from(table.querySelectorAll('th, thead td'));
            const tIdx = heads.findIndex(h => /^transaction\b/i.test(getCleanText(h)));
            if (tIdx < 0) return;

            table.querySelectorAll('tr').forEach(row => {
                const cell = row.cells ? row.cells[tIdx] : null;
                if (!cell || row.querySelector('th')) return;
                // v100.8.90: process each row once - no repeated DOM work in the cell
                // the user is most likely selecting text in.
                if (row.dataset.lfEscCopyDone === '1') return;
                row.dataset.lfEscCopyDone = '1';

                // 1) Borrower name - taken from the first name-like TEXT NODE
                if (!cell.querySelector('.lf-esc-name-btn')) {
                    const nameNode = lfGetBorrowerNameNode(cell);
                    if (nameNode) {
                        const nm = (nameNode.nodeValue || '').replace(/\s+/g, ' ').trim();
                        // v100.9.0: never treat a control's own label as a borrower name
                        const isControlLabel = /^(view\s+\w+|assign to me|read more|add to-do|select)$/i.test(nm);
                        if (nm && !isControlLabel) {
                            const nb = lfEscMakeCopyBtn(nm, 'Copy borrower name');
                            nb.classList.add('lf-esc-name-btn');
                            // v100.9.0: if that text sits inside a link/button, insert AFTER
                            // the whole control. A <button> nested inside an <a> is invalid
                            // HTML - the browser restructures the DOM to fix it, which broke
                            // the control (Ctrl+click on "View Loan" stopped working).
                            const host = nameNode.parentElement ? nameNode.parentElement.closest('a, button, [role="button"], .btn') : null;
                            if (host && host.parentNode && cell.contains(host)) host.parentNode.insertBefore(nb, host.nextSibling);
                            else nameNode.parentNode.insertBefore(nb, nameNode.nextSibling);
                        }
                    }
                }

                // 2) Loan number - only when the row actually has one
                if (!cell.querySelector('.lf-esc-num-btn')) {
                    const w = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT, null, false);
                    let n;
                    while ((n = w.nextNode())) {
                        if (n.parentNode && n.parentNode.closest('.lf-icon-btn, .lf-rd-label')) continue;
                        const m = (n.nodeValue || '').match(/\b[A-Za-z]{0,5}\d{6,15}\b/);
                        if (m) {
                            const cb = lfEscMakeCopyBtn(m[0], 'Copy loan number');
                            cb.classList.add('lf-esc-num-btn');
                            const host2 = n.parentElement ? n.parentElement.closest('a, button, [role="button"], .btn') : null;
                            if (host2 && host2.parentNode && cell.contains(host2)) host2.parentNode.insertBefore(cb, host2.nextSibling);
                            else n.parentNode.insertBefore(cb, n.nextSibling);
                            break;
                        }
                    }
                }
            });
        });
    }

    // ==========================================
    // LOAN SUMMARY "POP-UP" BUTTON (v100.8.84)
    // On the Escalation desk, clicking a borrower name opens a loan summary panel.
    // This adds a green "Pop-up" button beside that panel's X, opening the summary in
    // its own window, with the page's styles applied and copy buttons working.
    // ==========================================
    // v100.8.93: in Disclosure Specialist mode, phone numbers copy as bare digits.
    // "(617) 982-4245" -> "6179824245". Applied centrally so it covers every copy
    // button that carries a phone number, not just one table.
    function lfMaybeStripPhone(text) {
        try {
            if (lfTtRole() !== 'disclosure') return text;
            const t = String(text || '').trim();
            if (!t) return text;
            const digits = t.replace(/\D+/g, '');
            if (digits.length < 7 || digits.length > 15) return text;      // not a phone
            if (!/^\+?[\d\s().\-\u2013\u2014]+$/.test(t)) return text;      // has other content
            return digits;
        } catch (e) { return text; }
    }

    // v100.8.98: reads the SELECTED status only. The Status/Owner cell holds a dropdown
    // whose option list lives in the DOM, so reading the whole cell picked up the word
    // "New" from those options on EVERY row - which made every ticket look like "New"
    // and left the disclose-due override stuck in its "cap only" branch.
    function lfRowStatusText(row) {
        try {
            const table = row.closest('table');
            if (!table || !row.cells) return '';
            const heads = Array.from(table.querySelectorAll('th, thead td'));
            const sIdx = heads.findIndex(h => /^status/i.test(getCleanText(h)));
            if (sIdx < 0 || !row.cells[sIdx]) return '';
            const cell = row.cells[sIdx];

            // A real <select>: use its selected option
            const sel = cell.querySelector('select');
            if (sel && sel.selectedIndex >= 0 && sel.options[sel.selectedIndex]) {
                return (sel.options[sel.selectedIndex].text || '').replace(/\s+/g, ' ').trim();
            }

            // Otherwise strip anything that is a list of choices, then read what is shown
            const clone = cell.cloneNode(true);
            clone.querySelectorAll('select, option, optgroup, datalist, ul, ol, .dropdown-menu, [role="menu"], [role="listbox"]').forEach(e => e.remove());
            return (clone.textContent || '').replace(/\s+/g, ' ').trim();
        } catch (e) { return ''; }
    }

    function lfOwnText(el) {
        return Array.from(el.childNodes).filter(n => n.nodeType === 3).map(n => n.nodeValue).join(' ').replace(/\s+/g, ' ').trim();
    }

    // ==========================================
    // SELECTION PROTECTION (v100.8.92)
    // Three timers run in this script. Earlier attempts guarded only two of them - the
    // third (the 1.5s dropdown enforcer) dispatches focus/input/change/blur on every
    // <select>, and a "change" on the items-per-page select makes the app re-render the
    // grid. Either of those wipes whatever the user was highlighting.
    // Now: a real drag is tracked via selectstart/mouseup, and ALL THREE timers stand
    // down while a drag is in progress or any text remains selected.
    // ==========================================
    let lfDragging = false;
    let lfDragEndedAt = 0;
    document.addEventListener('selectstart', () => { lfDragging = true; }, true);
    document.addEventListener('mousedown', () => { lfDragging = false; }, true);
    document.addEventListener('mouseup', () => { lfDragging = false; lfDragEndedAt = Date.now(); }, true);

    function lfSelectionBusy() {
        try {
            if (lfDragging) return true;
            if (Date.now() - lfDragEndedAt < 400) return true;   // brief settle after release
            const s = window.getSelection();
            return !!(s && s.rangeCount && !s.isCollapsed && String(s).trim().length > 0);
        } catch (e) { return false; }
    }

    // Finds a panel's close control: data-dismiss / .close / aria-label, an ×-like
    // glyph, or a small icon button parked in the top-right corner.
    function lfFindCloseControl(scope) {
        if (!scope) return null;
        let c = scope.querySelector('[data-dismiss="modal"], [data-dismiss], .close, [aria-label*="close" i], [title*="close" i]');
        if (c) return c;
        const CLOSE_TXT = /^(\u00D7|\u2715|\u2716|\u274C|x)$/i;
        c = Array.from(scope.querySelectorAll('button, a, span, i, div')).find(b => b.offsetParent && b.children.length <= 1 && CLOSE_TXT.test((b.textContent || '').trim()));
        if (c) return c;
        const sr = scope.getBoundingClientRect();
        return Array.from(scope.querySelectorAll('button, a, span, i, svg')).find(b => {
            if (!b.offsetParent) return false;
            const r = b.getBoundingClientRect();
            return r.width <= 44 && r.height <= 44 && (sr.right - r.right) < 70 && (r.top - sr.top) < 70;
        }) || null;
    }

    function lfPopOutHTML(html, title) {
        const winTitle = title || 'Loan Summary';
        const winW = 850, winH = Math.floor(window.screen.availHeight * 0.85);
        const sw = window.open('', 'LFPop_' + winTitle.replace(/\W+/g, ''), `width=${winW},height=${winH},resizable=yes,scrollbars=yes`);
        if (!sw) { showToast('Pop-up blocked \u2013 allow pop-ups for loanfactory.com'); return; }
        const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style')).map(el => el.outerHTML).join('\n');
        const copyScript = "\n<scr" + "ipt>\n" + `
            var LF_COPY_SVG = ${JSON.stringify(COPY_SVG)};
            var LF_CHECK_SVG = ${JSON.stringify(CHECK_SVG)};
            document.addEventListener('click', async (e) => {
                const btn = e.target.closest('.lf-modal-copy-btn, .lf-copy-btn, .lf-emp-copy-btn, .lf-hdr-copy-btn, .lf-name-copy-btn, .lf-icon-btn');
                if (!btn) return;
                e.preventDefault();
                const text = btn.getAttribute('data-copy-text');
                if (!text) return;
                try { await navigator.clipboard.writeText(text); }
                catch (err) {
                    const ta = document.createElement('textarea');
                    ta.value = text; document.body.appendChild(ta); ta.select();
                    document.execCommand('copy'); document.body.removeChild(ta);
                }
                // v100.8.93: the popped-out window had no feedback - show the tick,
                // then restore the copy icon, exactly like in the main page.
                btn.innerHTML = LF_CHECK_SVG;
                btn.style.color = '#16a34a';
                setTimeout(() => { btn.innerHTML = LF_COPY_SVG; btn.style.color = ''; }, 1000);
            });
        ` + "\n</scr" + "ipt>";
        sw.document.write(`<!DOCTYPE html><html><head><title>${winTitle}</title><base href="${window.location.origin}">${styles}<style>
            /* v100.8.85: the panel markup carries .modal / .modal-dialog classes, which
               the app's stylesheet hides by default - that is why the window came up
               blank. Force the cloned content visible and static. */
            html, body { background:#fff !important; }
            body { padding:20px; }
            .modal, .modal-dialog, .modal-content, .fade, .offcanvas, [role="dialog"] {
                display:block !important; position:static !important; opacity:1 !important;
                visibility:visible !important; transform:none !important; width:auto !important;
                max-width:none !important; margin:0 !important; border:none !important; box-shadow:none !important;
            }
            .modal-backdrop { display:none !important; }
            .modal-header .close, #lf-summary-popup-btn, .lf-rd-label { display:none !important; }
        </style></head><body>${html}${copyScript}</body></html>`);
        sw.document.close();
    }

    function lfInjectSummaryPopupBtn() {
        // v100.9.16: available on EVERY loan summary, not just the Escalation desk.
        // The panel's "Loan Summary" heading
        let head = null;
        for (const el of document.querySelectorAll('h1,h2,h3,h4,h5,div,span,td,p,strong,b')) {
            if (!el.offsetParent) continue;
            if (/^loan summary\b/i.test(lfOwnText(el))) { head = el; break; }
        }
        if (!head) {
            const old = document.getElementById('lf-summary-popup-btn'); if (old) old.remove();
            return;
        }

        // Walk up to the panel that carries a close control
        let panel = null, closeEl = null, p = head;
        for (let i = 0; i < 8 && p; i++) {
            const c = lfFindCloseControl(p);
            if (c && c !== head && !head.contains(c)) { panel = p; closeEl = c; break; }
            p = p.parentElement;
        }
        if (!panel || !closeEl) return;

        // v100.9.30: the walk above stops at the first element that owns a close
        // control, which on the Service Desks panel is only its header bar - that is
        // why the popped-out window came up almost empty. Prefer the real dialog root
        // when there is one, so the whole panel is captured.
        const root = head.closest('.modal, .ui-dialog, [role="dialog"], .modal-dialog') || panel;
        if (root && root.contains(panel)) panel = root;
        const existingBtn = document.getElementById('lf-summary-popup-btn');
        if (existingBtn) { lfPositionPopupBtn(existingBtn, closeEl); return; }

        const btn = document.createElement('button');
        btn.id = 'lf-summary-popup-btn';
        btn.type = 'button';
        btn.textContent = '\u29C9 Pop-up';
        btn.title = 'Open this loan summary in its own window';
        btn.style.cssText = 'display:inline-flex; align-items:center; gap:4px; padding:4px 12px; background:#16a34a; color:#ffffff; border:none; border-radius:6px; font-size:12px; font-weight:700; cursor:pointer; font-family:inherit; z-index:2147483000;';
        btn.onmouseenter = () => { btn.style.background = '#15803d'; };
        btn.onmouseleave = () => { btn.style.background = '#16a34a'; };
        btn.onmouseenter = () => { btn.style.background = '#15803d'; };
        btn.onmouseleave = () => { btn.style.background = '#16a34a'; };
        btn.onclick = (e) => {
            e.preventDefault(); e.stopPropagation();
            // v100.8.85: use the richest content available. `.modal-content` is what the
            // fall back to the panel, then to the summary captured into storage by the
            // LTV/summary pass.
            const source = panel.querySelector('.modal-content') || panel;
            const clone = source.cloneNode(true);
            // v100.9.30: strip the loading spinner so a half-loaded panel is obvious
            clone.querySelectorAll('.spinner, .spinner-border, .loading, .lf-spin').forEach(x => x.remove());
            clone.querySelectorAll('#lf-summary-popup-btn, [data-dismiss], .close').forEach(x => x.remove());
            let html = clone.innerHTML;
            if ((clone.textContent || '').trim().length < 40) html = localStorage.getItem('lf_saved_summary') || html;
            if (!html || !html.trim() || (clone.textContent || '').trim().length < 40) {
                showToast('Still loading \u2013 wait for the panel to fill in, then try again');
                return;
            }
            lfPopOutHTML(html, 'Loan Summary');
        };
        // v100.8.86: rather than guessing where the X sits in the markup, the button is
        // fixed-positioned to the X's measured screen position, so it always lands
        // immediately to its left. Position is refreshed on every pass.
        document.body.appendChild(btn);
        lfPositionPopupBtn(btn, closeEl);
    }

    function lfPositionPopupBtn(btn, closeEl) {
        const r = closeEl.getBoundingClientRect();
        if (!r.width && !r.height) return;
        btn.style.position = 'fixed';
        btn.style.top = Math.max(4, r.top + (r.height / 2) - 13) + 'px';
        btn.style.left = Math.max(4, r.left - btn.offsetWidth - 10) + 'px';
    }

    // ==========================================
    // "REGISTER & DISCLOSE" ROW LABEL (v100.8.82)
    // Tickets whose description reads "Register and disclose the loan" get a red,
    // non-clickable label immediately to the right of the "+Labels" chip.
    // ==========================================
    const LF_RD_TEXT = 'Resubmit';
    // v100.8.90: NO \b before "re". textContent glues cells together, so the row reads
    // "...37482137093Re-disclose the loan" - and between "3" and "R" there is no word
    // boundary, so the \b version never matched. It is also unnecessary: "Register and
    // disclose" can't match this pattern because "re" is followed by "gister".
    // The dash class covers hyphen, en/em dashes and the non-breaking hyphen.
    const LF_RD_RX = /re[-\s\u2010-\u2015\u2212]?disclose\s+the\s+loan/i;

    // v100.8.89: DISCLOSE DUE storage. Kept in localStorage, so it survives browser
    // restarts and reboots exactly like the captured assign times.
    const LF_DD_KEY = 'lf_ds_disclose_due';
    function lfDdAll() { try { return JSON.parse(localStorage.getItem(LF_DD_KEY) || '{}'); } catch (e) { return {}; } }
    function lfDdGet(k) { const a = lfDdAll(); return k ? (a[k] || null) : null; }
    function lfDdSet(k, v) { const a = lfDdAll(); if (v) a[k] = v; else delete a[k]; localStorage.setItem(LF_DD_KEY, JSON.stringify(a)); }
    const lfPad2 = (n) => String(n).padStart(2, '0');

    // The turn-time cap: 6:00 PM on the chosen disclose-due date
    function lfDdCapDate(rec) {
        if (!rec) return null;
        const now = new Date();
        let y = rec.y || now.getFullYear();
        return new Date(y, rec.m - 1, rec.d, 18, 0, 0, 0);
    }

    // v100.8.91: month-grid calendar matching the portal's own date picker -
    // "< Month Year >" header, weekday row, greyed leading/trailing days, today
    // outlined, selected day filled blue.
    const LF_CAL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                           'July', 'August', 'September', 'October', 'November', 'December'];
    const LF_CAL_DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    function lfDdBuildCalendar(view, key) {
        const y = view.y, m = view.m;                     // m is 0-based
        const startDow = new Date(y, m, 1).getDay();
        const daysThis = new Date(y, m + 1, 0).getDate();
        const daysPrev = new Date(y, m, 0).getDate();
        const today = new Date();
        const rec = lfDdGet(key);

        let cells = '';
        for (let i = 0; i < 42; i++) {
            const n = i - startDow + 1;
            let dt, muted = false;
            if (n < 1) { dt = new Date(y, m - 1, daysPrev + n); muted = true; }
            else if (n > daysThis) { dt = new Date(y, m + 1, n - daysThis); muted = true; }
            else { dt = new Date(y, m, n); }
            const isToday = dt.toDateString() === today.toDateString();
            const isSel = !!(rec && rec.y === dt.getFullYear() && rec.m === dt.getMonth() + 1 && rec.d === dt.getDate());
            cells += `<div class="lf-cal-day${muted ? ' muted' : ''}${isToday ? ' today' : ''}${isSel ? ' sel' : ''}"`
                  + ` data-y="${dt.getFullYear()}" data-m="${dt.getMonth() + 1}" data-d="${dt.getDate()}">${dt.getDate()}</div>`;
        }

        return `
            <div class="lf-cal-head">
                <button type="button" class="lf-cal-prev" title="Previous month">\u2039</button>
                <div class="lf-cal-title"><b>${LF_CAL_MONTHS[m]}</b> <span>${y}</span></div>
                <button type="button" class="lf-cal-next" title="Next month">\u203A</button>
            </div>
            <div class="lf-cal-grid lf-cal-dow">${LF_CAL_DOW.map(d => `<div>${d}</div>`).join('')}</div>
            <div class="lf-cal-grid lf-cal-days">${cells}</div>
            <div class="lf-cal-foot">
                <span class="lf-cal-note">Due at 6:00 PM</span>
                <button type="button" class="lf-dd-rm">Remove</button>
            </div>`;
    }

    function lfDdOpenPicker(anchor, key, row) {
        document.querySelectorAll('.lf-dd-popup').forEach(p => p.remove());
        const rec = lfDdGet(key);
        const now = new Date();
        const view = rec ? { y: rec.y || now.getFullYear(), m: rec.m - 1 } : { y: now.getFullYear(), m: now.getMonth() };

        const pop = document.createElement('div');
        pop.className = 'lf-dd-popup';
        document.body.appendChild(pop);

        const place = () => {
            // v100.8.92: absolute + page coordinates, so the calendar stays glued to its
            // row when the page scrolls. (Fixed positioning kept it pinned to the
            // viewport, so it drifted away from the chip.)
            const r = anchor.getBoundingClientRect();
            const top = r.bottom + window.scrollY + 6;
            const left = r.left + window.scrollX;
            const maxLeft = document.documentElement.scrollWidth - pop.offsetWidth - 8;
            pop.style.position = 'absolute';
            pop.style.top = Math.max(8, top) + 'px';
            pop.style.left = Math.max(8, Math.min(left, maxLeft)) + 'px';
        };

        const refreshRow = () => {
            if (!row) return;
            delete row.dataset.dueDate; delete row.dataset.dueDateFormatted;
            const b = row.querySelector('.sla-badge-container'); if (b) b.remove();
        };

        const render = () => {
            pop.innerHTML = lfDdBuildCalendar(view, key);
            place();
            pop.querySelector('.lf-cal-prev').onclick = (e) => {
                e.preventDefault(); e.stopPropagation();
                view.m--; if (view.m < 0) { view.m = 11; view.y--; }
                render();
            };
            pop.querySelector('.lf-cal-next').onclick = (e) => {
                e.preventDefault(); e.stopPropagation();
                view.m++; if (view.m > 11) { view.m = 0; view.y++; }
                render();
            };
            pop.querySelectorAll('.lf-cal-day').forEach(cellEl => {
                cellEl.onclick = (e) => {
                    e.preventDefault(); e.stopPropagation();
                    const yy = parseInt(cellEl.dataset.y, 10), mm = parseInt(cellEl.dataset.m, 10), dd2 = parseInt(cellEl.dataset.d, 10);
                    lfDdSet(key, { m: mm, d: dd2, y: yy });
                    pop.remove(); refreshRow();
                    showToast(`Disclose due set: ${lfPad2(mm)}/${lfPad2(dd2)} 6:00 PM`);
                };
            });
            pop.querySelector('.lf-dd-rm').onclick = (e) => {
                e.preventDefault(); e.stopPropagation();
                lfDdSet(key, null);
                pop.remove(); refreshRow();
                showToast('Disclose due removed');
            };
        };
        render();

        setTimeout(() => {
            const away = (ev) => {
                if (!pop.contains(ev.target) && ev.target !== anchor) { pop.remove(); document.removeEventListener('mousedown', away, true); }
            };
            document.addEventListener('mousedown', away, true);
        }, 0);
    }

    // Finds the OUTERMOST element whose text is exactly "+Labels". v100.8.89: matching
    // text nodes failed when the chip splits its text across nodes, and inserting INSIDE
    // the chip got clipped by its fixed width + overflow:hidden.
    function lfFindLabelsChip(row) {
        const matches = [];
        row.querySelectorAll('*').forEach(el => {
            if (/^\+\s*labels?$/i.test((el.textContent || '').trim())) matches.push(el);
        });
        if (!matches.length) return null;
        // v100.9.15: take the INNERMOST match - the chip itself, never a wrapper around it.
        // With the outermost, a ticket that has no app label of its own matched the whole
        // labels WRAPPER (its text is just "+Labels"), so our row was inserted outside it
        // as a direct child of the cell. The cell-root guard then tucked it back in and
        // the placement pushed it out again, twice a second - and while it sat first, GWT
        // treated it as the cell's content root and ignored every click on "View Loan".
        // Tickets that carried an app label matched the chip instead and were unaffected,
        // which is exactly the split that was reported.
        return matches.find(el => !matches.some(o => o !== el && el.contains(o))) || matches[matches.length - 1];
    }

    function lfMakeStaticChip(cls, text, bg) {
        const t = document.createElement('span');
        t.className = cls;
        t.textContent = text;
        // v100.8.90: no user-select:none here. A drag-selection that crosses an
        // unselectable element gets cut short, which is one way the highlight was
        // being lost while selecting a loan number next to these chips.
        t.style.cssText = `display:inline-block; margin-left:5px; padding:2px 8px; border-radius:10px; background:${bg}; color:#ffffff; font-size:11px; font-weight:700; line-height:1.5; white-space:nowrap; vertical-align:middle; overflow:visible; max-width:none; flex:none;`;
        return t;
    }

    // Injects the row chips: red non-interactive "Resubmit", and the pink clickable
    // "Due: mm/dd" disclose-due chip, both just right of "+Labels".
    // ==========================================
    // KEY CANDIDATES + MIGRATION (v100.8.97)
    // The per-ticket key has changed as bugs were fixed (glued date/time digits, then
    // ticket-number-first). Anything saved under an older scheme would otherwise be
    // orphaned - the chip would still show a date while the SLA lookup found nothing.
    // Every read now tries the current key first, then the legacy forms, and copies
    // what it finds onto the current key. Legacy entries are left in place, so two rows
    // that previously shared a key both inherit the value instead of one losing it.
    // ==========================================
    function lfRowKeyCandidates(row) {
        const out = [];
        const push = (k) => { if (k && out.indexOf(k) < 0) out.push(k); };
        push(lfDsRowKey(row));                                        // current
        try { push('n:' + lfArDigitsKeyFromText(row.textContent)); } catch (e) {}   // legacy: raw row text
        try {
            const c = row.cloneNode(true);
            c.querySelectorAll('.sla-badge-container, .lf-dd-label, .lf-rd-label, .lf-icon-btn, .lf-ds-start-btn').forEach(e => e.remove());
            push('n:' + lfArDigitsKeyFromText(c.textContent));        // legacy: row minus our elements
        } catch (e) {}
        try {
            const table = row.closest('table');
            if (table && row.cells) {
                const heads = Array.from(table.querySelectorAll('th, thead td'));
                const trIdx = heads.findIndex(h => /^transaction\b/i.test(getCleanText(h)));
                if (trIdx > -1 && row.cells[trIdx]) push('n:' + lfArDigitsKeyFromText(getCleanText(row.cells[trIdx])));
            }
        } catch (e) {}
        return out.filter(k => k && k !== 'n:null');
    }

    // Disclose due, resolved across candidate keys
    function lfDdGetRow(row) {
        const cands = lfRowKeyCandidates(row);
        if (!cands.length) return null;
        const all = lfDdAll();
        for (const k of cands) {
            if (all[k]) {
                if (k !== cands[0]) lfDdSet(cands[0], all[k]);   // copy forward, keep the original
                return all[k];
            }
        }
        return null;
    }

    // Assign time, resolved the same way
    function lfDsAssignGetRow(row) {
        const cands = lfRowKeyCandidates(row);
        if (!cands.length) return null;
        const all = lfDsAssignAll();
        for (const k of cands) {
            if (all[k]) {
                if (k !== cands[0]) lfDsAssignSet(cands[0], all[k]);
                return all[k];
            }
        }
        return null;
    }

    function lfInjectRowChips() {
        if (!lfEscExtrasOn()) return;   // v100.9.3
        const onEsc = /escalation_desk/i.test(location.href);
        document.querySelectorAll('table tr').forEach(row => {
            if (row.closest('.modal, .ui-dialog')) return;
            if (!row.cells || !row.cells.length) return;

            // v100.8.90: once a row has been processed, only the Due text is refreshed.
            // The heavy scan (and any DOM insertion) never runs on it again, so nothing
            // in that cell is mutated while the user is selecting text there.
            if (row.dataset.lfChipsDone === '1') {
                const ddFast = row.querySelector('.lf-dd-label');
                if (ddFast && lfTtRole() !== 'disclosure') {   // v100.9.18: DS only
                    ddFast.remove();
                } else if (ddFast) {
                    const recF = lfDdGetRow(row);   // v100.8.97
                    const txtF = recF ? `Due: ${lfPad2(recF.m)}/${lfPad2(recF.d)}` : 'Due: --/--';
                    if (ddFast.textContent !== txtF) ddFast.textContent = txtF;
                }
                // v100.9.50: a Bypass button can render after the box was placed - move
                // the box back under whichever control is now last.
                try {
                    document.querySelectorAll('td .lf-drop-box').forEach(box => {
                        const cell = box.closest('td');
                        if (!cell) return;
                        const last = lfTodoLastControl(cell);
                        if (last && box.previousElementSibling !== last) {
                            last.parentNode.insertBefore(box, last.nextSibling);
                        }
                    });
                } catch (err) {}

                // v100.9.11: keep the chip row sitting directly above "+Labels"
                const cr = row.querySelector('.lf-chip-row');
                if (cr) {
                    const plusNow = lfFindLabelsChip(row);
                    if (plusNow && plusNow.parentNode) lfPlaceChipRow(cr, lfLabelGroupStart(plusNow));   // v100.9.13
                }
                return;
            }

            const chip = lfFindLabelsChip(row);
            if (!chip || !chip.parentNode) return;

            // v100.9.11: the chip row goes directly ABOVE the "+Labels" chip, so it lands
            // under the loan number when the ticket has one and under the borrower name
            // when it does not. It is inserted as a sibling of "+Labels" - never moved
            // into another container, which is what displaced it last time.
            const groupStart = lfLabelGroupStart(chip);   // v100.9.12
            let chipRow = row.querySelector('.lf-chip-row');
            if (!chipRow) {
                chipRow = document.createElement('div');
                chipRow.className = 'lf-chip-row';
            }
            lfPlaceChipRow(chipRow, groupStart);   // v100.9.13

            // Row text minus our own chips, so they can never re-trigger themselves
            let hay = row.textContent || '';
            row.querySelectorAll('.lf-rd-label, .lf-dd-label').forEach(el => { hay = hay.replace(el.textContent || '', ''); });

            // --- 1) "Resubmit" (dark green, non-interactive) ---
            let rd = row.querySelector('.lf-rd-label');
            const wantRd = LF_RD_RX.test(hay);
            if (wantRd && !rd) {
                rd = lfMakeStaticChip('lf-rd-label', LF_RD_TEXT, '#146c43');
                rd.style.cursor = 'default';
                rd.style.userSelect = 'none';
                ['click', 'mousedown', 'mouseup', 'dblclick', 'pointerdown', 'pointerup', 'touchstart', 'contextmenu'].forEach(ev => {
                    rd.addEventListener(ev, (e) => { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); return false; }, true);
                });
                chipRow.appendChild(rd);
            } else if (!wantRd && rd) { rd.remove(); rd = null; }
            else if (rd && rd.parentNode !== chipRow) { chipRow.appendChild(rd); }

            // --- 2) "Due: mm/dd" (pink, clickable) - Escalation desk only ---
            // --- 2) "Due: mm/dd" (pink, clickable) ---
            // v100.9.18: Disclosure Specialist only. Under Underwriter the chip is not
            // shown and any existing one is removed.
            if (!onEsc || lfTtRole() !== 'disclosure') {
                const strayDd = row.querySelector('.lf-dd-label');
                if (strayDd) strayDd.remove();
                row.dataset.lfChipsDone = '1';
                return;
            }
            const key = lfDsRowKey(row);
            if (!key) return;
            row.dataset.lfRowKey = key;
            const rec = lfDdGetRow(row);   // v100.8.97
            const text = rec ? `Due: ${lfPad2(rec.m)}/${lfPad2(rec.d)}` : 'Due: --/--';

            let dd = row.querySelector('.lf-dd-label');
            if (!dd) {
                dd = lfMakeStaticChip('lf-dd-label', text, '#d6336c');
                dd.style.cursor = 'pointer';
                dd.title = 'Set the disclose due date for this ticket';
                dd.onclick = (e) => { e.preventDefault(); e.stopPropagation(); lfDdOpenPicker(dd, key, row); };
                chipRow.appendChild(dd);
            } else {
                if (dd.textContent !== text) dd.textContent = text;
                if (dd.parentNode !== chipRow) chipRow.appendChild(dd);   // Resubmit first, Due after
            }
            row.dataset.lfChipsDone = '1';
        });
    }

    // ==========================================
    // BULK ASSIGN-TIME UPDATE (v100.8.81)
    // Walks every remaining "open Audit log to start" pill: scrolls to it, opens the
    // log, saves the assign time, closes the log, then moves to the next one.
    // Click the button again to stop. Tickets whose log has no assignment entry are
    // remembered as skipped so the run can never loop on them.
    // ==========================================
    let lfDsBulkRunning = false;
    const lfDsBulkSkip = new Set();

    function lfDsBulkLabel(running, n) {
        const b = document.getElementById('lf-ds-bulk-btn');
        if (!b) return;
        b.textContent = running ? `\u23F9 Stop updating (${n})` : '\u21bb Update assigned time for all tickets';
        b.style.background = running ? '#dc2626' : '#f36f20';
    }

    function lfDsBulkUpdate() {
        if (lfDsBulkRunning) { lfDsBulkRunning = false; return; }   // second click = stop
        lfDsBulkRunning = true;
        lfDsBulkSkip.clear();
        let done = 0, guard = 0;

        const step = () => {
            if (!lfDsBulkRunning) { lfDsBulkLabel(false); showToast(`Stopped \u2013 ${done} updated`); return; }
            if (++guard > 200) { lfDsBulkRunning = false; lfDsBulkLabel(false); showToast('Stopped \u2013 too many rows'); return; }

            // Next pill whose ticket hasn't already failed in this run
            const pill = Array.from(document.querySelectorAll('.lf-ds-start-btn')).find(p => {
                const r = p.closest('tr');
                return r && !lfDsBulkSkip.has(lfDsRowKey(r) || '');
            });
            if (!pill) {
                lfDsBulkRunning = false; lfDsBulkLabel(false);
                showToast(`Finished \u2013 ${done} ticket(s) updated${lfDsBulkSkip.size ? `, ${lfDsBulkSkip.size} skipped` : ''}`);
                return;
            }

            const row = pill.closest('tr');
            const key = lfDsRowKey(row) || '';
            // scrollIntoView is disabled globally by this script, so scroll the window
            const r = row.getBoundingClientRect();
            window.scrollTo({ top: Math.max(0, window.scrollY + r.top - 220), behavior: 'smooth' });

            setTimeout(() => {
                lfDsAutoOpenAudit(row, (ok) => {
                    if (ok) { done++; } else { lfDsBulkSkip.add(key); }
                    lfDsBulkLabel(true, done);
                    setTimeout(step, 500);
                });
            }, 400);
        };

        lfDsBulkLabel(true, 0);
        showToast('Updating assign times\u2026 click the button again to stop');
        step();
    }

    // The button lives above the "Created" column header, and only in assign-time mode
    function lfDsInjectBulkButton() {
        const wanted = lfTtActive() && lfTtRule().startFrom === 'assign';
        const existing = document.getElementById('lf-ds-bulk-btn');
        if (!wanted) { if (existing) existing.remove(); return; }
        if (existing) return;

        const th = Array.from(document.querySelectorAll('th, thead td'))
            .find(h => /^created\b/i.test(getCleanText(h)) && h.offsetParent);
        if (!th) return;

        const btn = document.createElement('button');
        btn.id = 'lf-ds-bulk-btn';
        btn.type = 'button';
        btn.textContent = '\u21bb Update assigned time for all tickets';
        btn.title = 'Opens each remaining ticket\u2019s Audit log, saves its assign time and closes it again';
        btn.style.cssText = 'display:block; width:100%; margin:0 0 6px; padding:5px 8px; background:#f36f20; color:#fff; border:none; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer; font-family:inherit; line-height:1.3; white-space:normal;';
        btn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); lfDsBulkUpdate(); };
        // v100.9.4: do NOT become the header cell's first child. GWT CellTable treats a
        // cell's first child element as its content root, so injecting there can break
        // the table's own click routing. The button now lives in its own wrapper appended
        // at the end of the cell, leaving GWT's structure exactly as it found it.
        let wrap = th.querySelector('.lf-bulk-wrap');
        if (!wrap) {
            wrap = document.createElement('div');
            wrap.className = 'lf-bulk-wrap';
            wrap.style.cssText = 'display:block; margin-top:6px;';
            th.appendChild(wrap);
        }
        wrap.appendChild(btn);
    }

    // ==========================================
    // TICKETS TURN-TIME (v100.8.74)
    // The turn-time SLA feature (Due date + countdown pill + "Turn time" sorting) can
    // be switched off, and its rules follow the selected ROLE. Underwriter rules are
    // the ones that have always been in use. Disclosure Specialist rules are not known
    // yet - to add them later, fill in `hours` below and set `ready: true`; nothing
    // else in the script needs to change.
    // ==========================================
    const LF_TT_ENABLED_KEY = 'lf_tt_enabled';
    const LF_TT_ROLE_KEY = 'lf_tt_role';

    const LF_TT_RULES = {
        underwriter: {
            label: 'Underwriter',
            ready: true,
            startFrom: 'created',   // clock starts at the ticket's created time
            // Three tiers, one line each
            summary: '<div><b>Standard:</b> 8 hours</div>'
                   + '<div><b>Rush:</b> 5 hours</div>'
                   + '<div><b>Income review:</b> 3 hours</div>'
                   + '<div class="lf-tt-note lf-tt-counted"></div>',
            hours: (rowText) => {
                // Income review is 3 hours regardless of Rush
                const isRush = /Rush/i.test(rowText), isInc = /Income Review/i.test(rowText);
                return isRush ? (isInc ? 3 : 5) : (isInc ? 3 : 8);
            }
        },
        disclosure: {
            label: 'Disclosure Specialist',
            ready: true,
            startFrom: 'assign',    // clock starts when the ticket was assigned
            summary: '<div><b>Standard:</b> 4 hours</div>'
                   + '<div><b>Resubmit (re-disclose):</b> 6 hours</div>'
                   + '<div class="lf-tt-note">Counted from the <b>assign time</b> \u2013 the oldest "Ticket\'s owner" entry in Action \u2192 Audit log.</div>'
                   + '<div class="lf-tt-note lf-tt-counted"></div>',
            // v100.9.30: a re-disclosure gets 6 business hours; everything else 4.
            // Detected with the same pattern that draws the green "Resubmit" chip, so
            // the two can never disagree.
            hours: (text) => (LF_RD_RX.test(text || '') ? 6 : 4)
        }
    };

    // ==========================================
    // ASSIGN-TIME CAPTURE (v100.8.77)
    // Disclosure Specialist turn-time starts at the assign time, which only exists
    // inside a ticket's History (Action -> Audit log). Rather than open every ticket's
    // log automatically, the script reads it whenever YOU open one and caches the
    // result, so each ticket needs a single visit and is then permanent.
    // The assign time = the NEWEST "Ticket's owner (X-->Y)" entry (top of the list).
    // ==========================================
    const LF_DS_ASSIGN_KEY = 'lf_ds_assign_times';
    // v100.8.79: own row tracker - the previous code borrowed the auto-review module's,
    // which only armed on rows containing an "Action" control. This one remembers the
    // last pipeline row touched, whatever was clicked inside it.
    let lfDsLastRow = null;
    const LF_TS_RX = /(\d{1,2}\/\d{1,2}\/\d{4})[,]?\s*(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM))/i;
    const LF_OWNER_RX = /ticket'?s\s+owner\s*\(([^)]*)\)/i;

    function lfDsAssignAll() {
        try { return JSON.parse(localStorage.getItem(LF_DS_ASSIGN_KEY) || '{}'); } catch (e) { return {}; }
    }
    function lfDsAssignSave(o) { localStorage.setItem(LF_DS_ASSIGN_KEY, JSON.stringify(o)); }
    function lfDsAssignGet(key) { const a = lfDsAssignAll(); return key ? a[key] : null; }
    function lfDsAssignSet(key, rec) { const a = lfDsAssignAll(); a[key] = rec; lfDsAssignSave(a); }

    // Stable identifier for a ticket row: its number when present, otherwise the
    // borrower name paired with the row's created timestamp.
    // v100.8.96: strips dates and clock times before hunting for an id. Without this,
    // "8/17/2026" + "11:58 AM" glue into "8/17/202611:58" and yield the 6-digit run
    // "202611" - which every row created in the same hour shares, so two different
    // tickets ended up writing to the same stored key.
    function lfStripDatesTimes(t) {
        return String(t || '')
            .replace(/\d{1,2}\/\d{1,2}\/\d{2,4}/g, ' ')
            .replace(/\d{1,2}:\d{2}(:\d{2})?\s*(AM|PM)?/gi, ' ');
    }

    function lfDsRowKey(row) {
        if (!row) return null;
        if (row.dataset.lfKeyCache) return row.dataset.lfKeyCache;

        let key = null;
        const table = row.closest('table');

        // 1) The Ticket number column - the most reliable id on this grid
        if (table && row.cells) {
            const heads = Array.from(table.querySelectorAll('th, thead td'));
            const tkIdx = heads.findIndex(h => /ticket\s*number/i.test(getCleanText(h)));
            if (tkIdx > -1 && row.cells[tkIdx]) {
                const k = lfArDigitsKeyFromText(lfStripDatesTimes(getCleanText(row.cells[tkIdx])));
                if (k) key = 'n:' + k;
            }
        }

        // 2) Whole row, with this script's own elements and all dates/times removed
        if (!key) {
            try {
                const clone = row.cloneNode(true);
                clone.querySelectorAll('.sla-badge-container, .lf-dd-label, .lf-rd-label, .lf-icon-btn, .lf-ds-start-btn').forEach(e => e.remove());
                const k = lfArDigitsKeyFromText(lfStripDatesTimes(clone.textContent));
                if (k) key = 'n:' + k;
            } catch (e) {}
        }

        // 3) Last resort: borrower name + the row's first timestamp
        if (!key) {
            const a = row.querySelector('a');
            const nm = a ? getCleanText(a) : '';
            const m = (row.textContent || '').match(LF_TS_RX);
            if (nm && m) key = 'c:' + nm + '|' + m[0];
        }

        if (key) row.dataset.lfKeyCache = key;
        return key;
    }

    // v100.8.79: the History dialog is GWT markup that matches none of the usual
    // modal selectors, which is why nothing was ever captured. Everything below now
    // works off CONTENT that is visible on screen, not off class names.
    function lfDsScanOwnerEntries() {
        const out = [];
        const els = document.querySelectorAll('li, p, td, div, span');
        for (const el of els) {
            const t = (el.textContent || '').trim();
            if (!t || t.length > 220 || !LF_OWNER_RX.test(t)) continue;
            if (el.querySelector('li, p, td, div, span')) continue;   // innermost only
            if (!el.offsetParent) continue;                            // must be on screen
            // Nearest ancestor that carries this entry's timestamp
            let host = el, stamp = null;
            for (let i = 0; i < 8 && host; i++) {
                const m = (host.textContent || '').match(LF_TS_RX);
                if (m) { stamp = m; break; }
                host = host.parentElement;
            }
            if (!stamp) continue;
            const when = new Date(stamp[1] + ' ' + stamp[2]);
            if (isNaN(when.getTime())) continue;
            const parts = (t.match(LF_OWNER_RX) || [])[1] || '';
            out.push({ t: when.getTime(), label: stamp[2], owner: parts.split('-->').pop().trim() });
        }
        return out;
    }

    function lfDsHistoryOpen() { return lfDsScanOwnerEntries().length > 0; }

    // Saves the assign time for a row. v100.8.79: uses the OLDEST "Ticket's owner"
    // entry (the first time the ticket was ever assigned), chosen by timestamp rather
    // than by position in the list.
    function lfDsCaptureAssignTime(explicitRow, quiet) {
        const entries = lfDsScanOwnerEntries();
        if (!entries.length) { if (!quiet) console.warn('[LF Optimizer] Assign time: no "Ticket\'s owner" entry visible'); return false; }

        const oldest = entries.reduce((a, b) => (b.t < a.t ? b : a));
        const row = explicitRow || lfDsLastRow || lfArLastActionRow;
        if (!row) { if (!quiet) { console.warn('[LF Optimizer] Assign time: could not tell which ticket row this log belongs to'); showToast('Click the ticket\u2019s row first, then re-open the log'); } return false; }

        const key = lfDsRowKey(row);
        if (!key) { if (!quiet) { console.warn('[LF Optimizer] Assign time: no stable id for this row'); showToast('Could not identify this ticket'); } return false; }

        const existing = lfDsAssignGet(key);
        if (existing && existing.t === oldest.t) return true;   // already stored

        lfDsAssignSet(key, { t: oldest.t, owner: oldest.owner, at: Date.now() });
        delete row.dataset.dueDate; delete row.dataset.dueDateFormatted;
        const b = row.querySelector('.sla-badge-container'); if (b) b.remove();
        showToast(`Assign time saved: ${oldest.label}${oldest.owner ? ' \u2192 ' + oldest.owner : ''}`);
        return true;
    }

    // Clicking the pill runs the whole trip: Action -> Audit log -> read -> close.
    let lfDsBusy = false;
    function lfDsAutoOpenAudit(row, onDone) {
        if (lfDsBusy || !row) { if (onDone) onDone(false); return; }
        const toggle = Array.from(row.querySelectorAll('a, button, .btn'))
            .find(el => (el.textContent || '').trim().replace(/\s+/g, ' ').startsWith('Action'));
        if (!toggle) { showToast('No Action menu on this ticket'); if (onDone) onDone(false); return; }

        lfDsBusy = true;
        lfDsLastRow = row;
        let finished = false;
        const finish = (ok) => { if (finished) return; finished = true; lfDsBusy = false; if (onDone) onDone(ok); };
        hardClick(toggle);

        lfArWaitFor(() => Array.from(document.querySelectorAll('a, li, span, div'))
            .find(el => el.offsetParent && /^audit\s*log$/i.test((el.textContent || '').trim())), 6000, (item) => {
            if (!item) { showToast('Could not find "Audit log" in the Action menu'); finish(false); return; }
            hardClick(item);

            lfArWaitFor(() => (lfDsHistoryOpen() ? true : null), 9000, (ok) => {
                if (!ok) { showToast('Audit log did not open in time'); finish(false); return; }
                setTimeout(() => {
                    const saved = lfDsCaptureAssignTime(row);
                    lfDsCloseHistory();
                    // v100.8.81: make sure it really closed before moving on
                    let tries = 0;
                    const shut = setInterval(() => {
                        tries++;
                        if (!lfDsHistoryOpen()) { clearInterval(shut); finish(saved); return; }
                        if (tries === 3 || tries === 6) lfDsCloseHistory();
                        if (tries > 10) { clearInterval(shut); finish(saved); }
                    }, 300);
                }, 400);
            });
        });
    }

    // Closes the History dialog again, whatever markup it uses.
    // v100.8.81: locate the dialog from its "HISTORY" heading, then try every close
    // affordance in turn - the previous version only matched a literal "\u00D7".
    function lfDsCloseHistory() {
        // 1) the element whose own text is exactly HISTORY
        let title = null;
        for (const el of document.querySelectorAll('h1,h2,h3,h4,h5,div,span,p,td')) {
            if (!el.offsetParent) continue;
            const own = Array.from(el.childNodes).filter(n => n.nodeType === 3).map(n => n.nodeValue).join(' ').trim();
            if (/^HISTORY$/i.test(own)) { title = el; break; }
        }

        // 2) walk up to the container that also holds the log entries
        let dlg = null, p = title;
        for (let i = 0; i < 8 && p; i++) {
            if (LF_OWNER_RX.test(p.textContent || '') || /Ticket change log/i.test(p.textContent || '')) { dlg = p; break; }
            p = p.parentElement;
        }
        const scope = dlg || document;

        // 3) any recognisable close control inside it
        const CLOSE_TXT = /^(\u00D7|\u2715|\u2716|\u274C|x)$/i;
        let closer = scope.querySelector('[data-dismiss="modal"], [data-dismiss], .close, [aria-label*="close" i], [title*="close" i]');
        if (!closer) {
            closer = Array.from(scope.querySelectorAll('button, a, span, i, div')).find(b => {
                if (!b.offsetParent || b.children.length > 1) return false;
                return CLOSE_TXT.test((b.textContent || '').trim());
            });
        }
        // 4) an icon button sitting in the dialog's top-right corner
        if (!closer && dlg) {
            const dr = dlg.getBoundingClientRect();
            closer = Array.from(dlg.querySelectorAll('button, a, span, i, svg')).find(b => {
                if (!b.offsetParent) return false;
                const r = b.getBoundingClientRect();
                return r.width <= 44 && r.height <= 44 && (dr.right - r.right) < 60 && (r.top - dr.top) < 60;
            });
        }

        if (closer) { hardClick(closer); return true; }
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
        return false;
    }

    function lfTtEnabled() { return localStorage.getItem(LF_TT_ENABLED_KEY) !== 'false'; } // default ON
    function lfTtRole() { return LF_TT_RULES[localStorage.getItem(LF_TT_ROLE_KEY)] ? localStorage.getItem(LF_TT_ROLE_KEY) : 'underwriter'; }
    function lfTtRule() { return LF_TT_RULES[lfTtRole()]; }
    // Active only when switched on AND the selected role actually has rules defined
    function lfTtActive() { const r = lfTtRule(); return lfTtEnabled() && !!r && r.ready === true && typeof r.hours === 'function'; }

    // Clears anything the feature previously injected (used when it is switched off
    // or the role has no rules yet)
    function lfTtClear() {
        document.querySelectorAll('.sla-badge-container').forEach(el => el.remove());
        document.querySelectorAll('tr[data-due-date]').forEach(r => {
            delete r.dataset.dueDate; delete r.dataset.dueDateFormatted;
            delete r.dataset.slaDueRaw;          // v100.9.18: force a full recalculation
        });
        // v100.9.18: the disclose-due chips belong to Disclosure Specialist. On a role
        // change, drop them and let the row chips be rebuilt for the new role.
        document.querySelectorAll('.lf-dd-label').forEach(el => el.remove());
        document.querySelectorAll('tr[data-lf-chips-done]').forEach(r => { delete r.dataset.lfChipsDone; });
    }


    // ==========================================
    // v100.8.49: live borrower-name recolor state (read fresh each row-loop pass so
    // toggling in the panel + Save applies without a page reload)
    let lfNameColorEnabled = localStorage.getItem('lf_name_color_enabled') === 'true';
    let lfNameColorValue = localStorage.getItem('lf_name_color_value') || '#e74c3c';
    function lfRefreshNameColorState() {
        lfNameColorEnabled = localStorage.getItem('lf_name_color_enabled') === 'true';
        lfNameColorValue = localStorage.getItem('lf_name_color_value') || '#e74c3c';
    }

    // Forcefully disable the browser's ability to scroll elements into view
    Element.prototype.scrollIntoView = function() {};
    if (Element.prototype.scrollIntoViewIfNeeded) {
        Element.prototype.scrollIntoViewIfNeeded = function() {};
    }

    // Stop events that are explicitly trying to scroll the window
    window.addEventListener('scroll', (e) => {
        if (e.target === document || e.target === window) {
            // This is a safety catch for any remaining rogue scroll events
        }
    }, true);

    // ==========================================
    // GLOBAL SHARED UTILITIES & CONSTANTS
    // ==========================================
    const COPY_SVG = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
    const CHECK_SVG = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="#16a34a" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    const SAVE_SVG = `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>`;
    // v100.8.35: crisp SVG sort arrows (same stroke style as the copy icon)
    const SORT_NEUTRAL_SVG = `<svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="8 9 12 5 16 9"></polyline><polyline points="8 15 12 19 16 15"></polyline></svg>`;
    const SORT_ASC_SVG = `<svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 15 12 9 18 15"></polyline></svg>`;
    const SORT_DESC_SVG = `<svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;

    let isSavingOrEmailing = false;
    let mousedownTarget = null;
    let lastProcessedFileId = null;
    let isActionPending = false;
    let currentCustomSort = localStorage.getItem('lf_custom_sort_pref') || '';

    function hardClick(el) {
        if (!el) return;
        const clickable = el.closest('a') || el.closest('li') || el.closest('button') || el;
        clickable.focus();
        ['mousedown', 'mouseup', 'click'].forEach(eventType => {
            clickable.dispatchEvent(new MouseEvent(eventType, {
                view: window, bubbles: true, cancelable: true, buttons: 1
            }));
        });
    }

    // v100.8.35: upgraded toast - bottom-right, stacks up to 4, check icon,
    // orange accent, site font, truncates long copied text.
    // v100.9.41: repeating the same message now bumps a counter on the toast that is
    // already showing, instead of stacking four near-identical cards. Copying three
    // fields in a row reads as "Copied: 1234  x3" rather than a wall of toasts.
    function showToast(message) {
        let stack = document.getElementById('lf-toast-stack');
        if (!stack) {
            stack = document.createElement('div');
            stack.id = 'lf-toast-stack';
            document.body.appendChild(stack);
        }
        const MAX = 60;
        let msg = String(message);
        if (msg.length > MAX) msg = msg.slice(0, MAX - 1) + '\u2026';

        // same message still on screen? just count it
        const last = stack.lastElementChild;
        if (last && last.dataset.lfMsg === msg && last.classList.contains('show')) {
            const n = (+last.dataset.lfCount || 1) + 1;
            last.dataset.lfCount = String(n);
            let badge = last.querySelector('.lf-toast2-count');
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'lf-toast2-count';
                last.appendChild(badge);
            }
            badge.textContent = '\u00d7' + n;
            clearTimeout(+last.dataset.lfTimer);
            last.dataset.lfTimer = String(setTimeout(() => {
                last.classList.remove('show');
                setTimeout(() => { if (last.parentNode) last.remove(); }, 300);
            }, 2200));
            return;
        }

        const toast = document.createElement('div');
        toast.className = 'lf-toast2';
        toast.dataset.lfMsg = msg;
        toast.dataset.lfCount = '1';
        toast.innerHTML = `<span class="lf-toast2-icon">${CHECK_SVG}</span><span class="lf-toast2-msg"></span>`;
        toast.querySelector('.lf-toast2-msg').textContent = msg;
        stack.appendChild(toast);

        // Keep at most 3 stacked toasts
        while (stack.children.length > 3) stack.removeChild(stack.firstChild);

        requestAnimationFrame(() => toast.classList.add('show'));
        toast.dataset.lfTimer = String(setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => { if (toast.parentNode) toast.remove(); }, 300);
        }, 2200));
    }

    function getCleanText(el) {
        const clone = el.cloneNode(true);
        clone.querySelectorAll('svg, i, img, button, [class*="copy"]').forEach(e => e.remove());
        return (clone.textContent || '').replace(/\s+/g, ' ').trim();
    }

    // v100.8.50: The borrower's NAME is not reliably an <a> - in the pipeline the
    // only anchor in that cell can be the "open in new tab" icon (icon-only, so it
    // has no text). Locate the actual name TEXT NODE instead, then wrap it in our
    // own span. That span is what we color and what we anchor the copy button to,
    // so the new-tab icon is never affected.
    function lfGetBorrowerNameNode(cell) {
        if (!cell) return null;
        const BAD = /^(total|checked|not checked|labels|select|action|add to-do|important dates)\b/i;
        const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT, null, false);
        let n;
        while ((n = walker.nextNode())) {
            const t = (n.nodeValue || '').replace(/\s+/g, ' ').trim();
            if (!t || t.length < 3 || t.length > 60) continue;
            if (!/[A-Za-z]/.test(t)) continue;                 // must contain letters
            if (/^\d/.test(t)) continue;                       // dates / numbers
            if (/^[A-Za-z]{1,5}\d{4,}$/.test(t)) continue;      // loan numbers like LU250490
            if (/_/.test(t)) continue;                          // labels: on_hold, review_request_not_sent
            if (/^\+/.test(t)) continue;                        // "+Labels"
            if (BAD.test(t)) continue;
            if (n.parentNode && n.parentNode.closest && n.parentNode.closest('.lf-name-copy-btn, .lf-copy-btn, .lf-bname')) continue;
            return n;
        }
        return null;
    }

    // Ensures the borrower name is wrapped in <span class="lf-bname"> and returns it
    function lfEnsureBorrowerNameSpan(cell) {
        if (!cell) return null;
        const existing = cell.querySelector('.lf-bname');
        if (existing && (existing.textContent || '').trim()) return existing;
        const node = lfGetBorrowerNameNode(cell);
        if (!node) return null;
        const span = document.createElement('span');
        span.className = 'lf-bname';
        span.textContent = (node.nodeValue || '').replace(/\s+/g, ' ').trim();
        node.parentNode.replaceChild(span, node);
        return span;
    }

    // v100.8.48: For the Employment tab copy button, copy ONLY the business name -
    // NOT the "Missing: Verifiable phone number" (and similar) sub-text that the
    // app renders inside the same cell. Strategy: prefer the cell's link text (the
    // blue business-name link); otherwise take the text before a "Missing" marker.
    function getEmployerName(el) {
        if (!el) return '';
        // 1) The business name is rendered as a link - use it if present
        const link = el.querySelector('a');
        if (link) {
            const linkTxt = getCleanText(link);
            if (linkTxt) return linkTxt;
        }
        // 2) Fallback: strip any "Missing..." block, then take the first line
        const clone = el.cloneNode(true);
        clone.querySelectorAll('svg, i, img, button, [class*="copy"]').forEach(e => e.remove());
        let raw = (clone.textContent || '');
        raw = raw.split(/Missing\s*:?/i)[0];              // drop everything from "Missing" onward
        const firstLine = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean)[0] || '';
        return firstLine.replace(/\s+/g, ' ').trim();
    }

    // ==========================================
    // v100.8.38: CLEAN PASTE SUSPENSION (state machine)
    // Problem with v100.8.37: the paste actually happens in the FOLLOW-UP email
    // compose window ("Share Your Experience with Us?"), which REPLACES the
    // "REQUEST FOR 5-STAR REVIEWS" popup - so a visibility check on the popup
    // alone re-enabled Clean Paste too early.
    // Fix: seeing the review popup ARMS the suspension. It stays armed while the
    // follow-up compose modal is open (with a 2s grace period for the transition
    // between the two modals). Once everything is closed, it disarms and Clean
    // Paste is active again. Compose/note modals opened WITHOUT the review popup
    // first are unaffected - Clean Paste works normally there.
    // ==========================================
    let reviewSuspendArmed = false;
    let reviewSuspendLastSeen = 0;

    function isReviewRequestPopupOpen() {
        const dialogs = document.querySelectorAll('.modal.show, .modal[style*="display: block"], .ui-dialog[style*="display: block"], div[role="dialog"]');
        for (const d of dialogs) {
            if (d.offsetWidth > 0 && d.offsetHeight > 0 && (d.textContent || '').toUpperCase().includes('REQUEST FOR 5-STAR REVIEWS')) {
                return true;
            }
        }
        return false;
    }

    // The follow-up email compose modal (Title / From / To / "Content (optional)")
    function isReviewComposeModalOpen() {
        const dialogs = document.querySelectorAll('.modal.show, .modal[style*="display: block"], .ui-dialog[style*="display: block"], div[role="dialog"]');
        for (const d of dialogs) {
            if (d.offsetWidth > 0 && d.offsetHeight > 0 && (d.textContent || '').toUpperCase().includes('CONTENT (OPTIONAL)')) {
                return true;
            }
        }
        return false;
    }

    function isCleanPasteSuspended() {
        // The review popup itself is showing -> arm and suspend
        if (isReviewRequestPopupOpen()) {
            reviewSuspendArmed = true;
            reviewSuspendLastSeen = Date.now();
            return true;
        }
        if (reviewSuspendArmed) {
            // The follow-up compose window is showing -> stay suspended
            if (isReviewComposeModalOpen()) {
                reviewSuspendLastSeen = Date.now();
                return true;
            }
            // Grace period so the popup->compose transition doesn't disarm us
            if (Date.now() - reviewSuspendLastSeen < 2000) return true;
            // Everything closed long enough -> disarm, Clean Paste active again
            reviewSuspendArmed = false;
        }
        return false;
    }

    // NEW: Parse a money string like "$1,234.56" into a number. Blank/unparseable -> 0.
    function parseMoney(str) {
        const cleaned = (str || '').replace(/[^0-9.\-]/g, '');
        const num = parseFloat(cleaned);
        return isNaN(num) ? 0 : num;
    }

    // ==========================================
    // LIABILITIES TABLE COLUMN SORTING (v100.8.31 - hardened)
    // ==========================================
    // The columns we attach sorters to (matched by header text, case-insensitive)
    const LIABILITY_SORT_LABELS = [
        'creditor name',
        'responsible by',
        'liability/expense type',
        'unpaid balance',
        'monthly payment',
        'paid off/omitted',
        'reo address'
    ];

    // Finds the actual header row by looking for the row that contains "Creditor name".
    // (Do NOT assume it's the first <tr> - GWT rendering often nests tables / adds extra rows.)
    function findLiabilityHeaderRow(table) {
        const allRows = Array.from(table.querySelectorAll('tr'));
        return allRows.find(r => {
            const t = (r.textContent || '').toLowerCase();
            return t.includes('creditor name') && t.includes('liability/expense type');
        }) || null;
    }

    // v100.8.35: shared helpers so the copy handler and the live button count use
    // IDENTICAL logic for which liability rows are "real" (i.e. not $0/$0).
    function getLiabilityColIdx(table) {
        let unpaidIdx = 4, monthlyIdx = 5; // fallback to the known layout
        const headerRow = findLiabilityHeaderRow(table) || table.querySelector('tr');
        if (headerRow) {
            const headTexts = Array.from(headerRow.children).map(c => (c.textContent || '').toLowerCase().trim());
            const uIdx = headTexts.findIndex(h => h.includes('unpaid balance'));
            const mIdx = headTexts.findIndex(h => h.includes('monthly payment'));
            if (uIdx > -1) unpaidIdx = uIdx;
            if (mIdx > -1) monthlyIdx = mIdx;
        }
        return { unpaidIdx, monthlyIdx };
    }

    function getCopyableLiabilityRows(table) {
        const { unpaidIdx, monthlyIdx } = getLiabilityColIdx(table);
        const allRows = Array.from(table.querySelectorAll('tr'));
        const headerRow = findLiabilityHeaderRow(table);
        const startIdx = headerRow ? allRows.indexOf(headerRow) + 1 : 1;
        const rows = []; let skipped = 0;
        for (let i = startIdx; i < allRows.length; i++) {
            const cells = allRows[i].querySelectorAll('td');
            if (cells.length < 8 || (cells[1] && cells[1].textContent.trim() === 'Total')) continue;
            // Skip rows where BOTH Unpaid balance and Monthly payment are $0 (or blank)
            const unpaidVal = parseMoney(cells[unpaidIdx] ? cells[unpaidIdx].textContent : '');
            const monthlyVal = parseMoney(cells[monthlyIdx] ? cells[monthlyIdx].textContent : '');
            if (unpaidVal === 0 && monthlyVal === 0) { skipped++; continue; }
            rows.push(allRows[i]);
        }
        return { rows, skipped };
    }

    // Sorts the liabilities table by a given column index.
    // Money columns are compared numerically; everything else alphabetically (numeric-aware).
    // The "Total" row (and any malformed rows) are kept pinned at the bottom.
    function sortLiabilityTable(table, colIdx, asc, isMoney) {
        const allRows = Array.from(table.querySelectorAll('tr'));
        const headerRow = findLiabilityHeaderRow(table);
        if (!headerRow) return;
        const headerIdx = allRows.indexOf(headerRow);
        if (headerIdx === -1) return;

        const dataRows = [], tailRows = [];
        for (let i = headerIdx + 1; i < allRows.length; i++) {
            const cells = allRows[i].querySelectorAll('td');
            if (cells.length < 2 || (cells[1] && cells[1].textContent.trim() === 'Total')) {
                tailRows.push(allRows[i]);
                continue;
            }
            dataRows.push(allRows[i]);
        }
        if (dataRows.length < 2) return;

        dataRows.sort((a, b) => {
            const aC = a.cells ? a.cells[colIdx] : null, bC = b.cells ? b.cells[colIdx] : null;
            const aT = aC ? getCleanText(aC) : '', bT = bC ? getCleanText(bC) : '';
            let cmp;
            if (isMoney) {
                cmp = parseMoney(aT) - parseMoney(bT);
            } else {
                cmp = aT.localeCompare(bT, undefined, { numeric: true, sensitivity: 'base' });
            }
            return asc ? cmp : -cmp;
        });

        const body = dataRows[0].parentNode;
        dataRows.forEach(r => body.appendChild(r));
        // Keep "Total" / malformed rows pinned at the very bottom
        tailRows.forEach(r => { if (r.parentNode) r.parentNode.appendChild(r); });
    }

    // Injects a minimal sort arrow into each liabilities header cell whose label matches
    // one of LIABILITY_SORT_LABELS (Creditor name, Responsible by, Liability/Expense type,
    // Unpaid balance, Monthly payment, Paid off/Omitted, REO address).
    // Neutral state: "⇅". Ascending: "▲". Descending: "▼". Click toggles direction.
    function injectLiabilitySorters(table) {
        const headerRow = findLiabilityHeaderRow(table);
        if (!headerRow) return;

        Array.from(headerRow.children).forEach(cell => {
            if (cell.querySelector('.lf-sort-btn')) return; // Already injected

            // Strip any arrow characters we may have added before reading the label
            const label = getCleanText(cell).replace(/[\u21C5\u25B2\u25BC]/g, '').trim();
            const lower = label.toLowerCase();
            const matched = LIABILITY_SORT_LABELS.find(l => lower === l || lower.includes(l));
            if (!matched) return; // Not one of our sortable columns (e.g. the "Add" cell)

            const idx = cell.cellIndex; // Real column index within the row
            const isMoney = matched === 'unpaid balance' || matched === 'monthly payment';

            const btn = document.createElement('span');
            btn.className = 'lf-sort-btn';
            btn.innerHTML = SORT_NEUTRAL_SVG;
            btn.title = `Sort by ${label}`;
            btn.onclick = (e) => {
                e.preventDefault(); e.stopPropagation();

                // Toggle direction if clicking the same column, otherwise start ascending
                let asc = true;
                if (table.dataset.lfSortCol === String(idx)) {
                    asc = table.dataset.lfSortDir !== 'asc';
                }
                table.dataset.lfSortCol = String(idx);
                table.dataset.lfSortDir = asc ? 'asc' : 'desc';

                // Reset every arrow to neutral, clear column highlights, then mark the active one
                table.querySelectorAll('.lf-sort-btn').forEach(b => {
                    b.innerHTML = SORT_NEUTRAL_SVG;
                    b.classList.remove('active');
                });
                const hr = findLiabilityHeaderRow(table);
                if (hr) Array.from(hr.children).forEach(c => c.classList.remove('lf-sorted-col'));

                btn.innerHTML = asc ? SORT_ASC_SVG : SORT_DESC_SVG;
                btn.classList.add('active');
                cell.classList.add('lf-sorted-col'); // v100.8.35: faint orange tint on the sorted column header

                sortLiabilityTable(table, idx, asc, isMoney);
            };
            cell.appendChild(btn);
        });

        if (!table.dataset.lfSortersLogged && headerRow.querySelector('.lf-sort-btn')) {
            table.dataset.lfSortersLogged = '1';
            console.log('[LF Optimizer] Sort arrows injected into liabilities table header.');
        }
    }

    // ==========================================
    // PICTURE PASTING (v100.8.64)
    // Removed from this script entirely. Pastes involving a picture are left to the
    // native Loan Factory portal - Clean Paste bails out before preventDefault so the
    // app handles images exactly as if this script were not installed.
    // ==========================================


    // ==========================================
    // DEFAULT TEXT STYLE (v100.8.59)
    // Adds a button to the note editor toolbar (right after Redo). It opens a small
    // popup where the default typing style is customised - bold / italic / underline,
    // size, text colour, highlight - with a live preview and an on/off toggle inside
    // the popup. When enabled, the style is applied the moment you start typing in an
    // empty note, so the text is saved WITH that formatting.
    // ==========================================
    const LF_DT_STORE = 'lf_default_text_style';
    const LF_DT_DEFAULT = { enabled: false, bold: false, italic: false, underline: false, size: 16, color: '#000000', highlight: '', font: '' };

    // v100.8.69: only fonts that ship with Ubuntu 24.04 desktop, so every option
    // actually renders (and previews) on this machine. Each chain then falls back to
    // the closest Windows/Mac font, so colleagues and borrowers still see the intended
    // face - the Liberation family is metrically identical to Arial / Times New Roman /
    // Courier New, so those three look the same on every platform.
    // "- not VNese-safe" marks fonts with incomplete Vietnamese diacritic coverage.
    const LF_DT_FONTS = [
        { label: 'Default (editor font)', css: '' },
        // --- Metric-compatible with the classic Windows fonts ---
        { label: 'Liberation Sans (\u2248 Arial)',        css: "'Liberation Sans', Arial, Helvetica, sans-serif" },
        { label: 'Liberation Serif (\u2248 Times)',       css: "'Liberation Serif', 'Times New Roman', Times, serif" },
        { label: 'Liberation Mono (\u2248 Courier)',      css: "'Liberation Mono', 'Courier New', Courier, monospace" },
        // --- DejaVu (always present on Ubuntu) ---
        { label: 'DejaVu Sans',      css: "'DejaVu Sans', Verdana, sans-serif" },
        { label: 'DejaVu Serif',     css: "'DejaVu Serif', Georgia, serif" },
        { label: 'DejaVu Sans Mono', css: "'DejaVu Sans Mono', Consolas, monospace" },
        // --- Noto ---
        { label: 'Noto Sans',        css: "'Noto Sans', Arial, sans-serif" },
        { label: 'Noto Serif',       css: "'Noto Serif', Georgia, serif" },
        // --- Ubuntu / GNOME faces ---
        { label: 'Ubuntu',           css: "Ubuntu, 'Segoe UI', sans-serif", vn: false },
        { label: 'Ubuntu Condensed', css: "'Ubuntu Condensed', 'Arial Narrow', sans-serif", vn: false },
        { label: 'Ubuntu Mono',      css: "'Ubuntu Mono', Consolas, monospace", vn: false },
        { label: 'Cantarell',        css: "Cantarell, 'Segoe UI', sans-serif", vn: false }
    ];

    // v100.9.20: one-click presets for the Default Text Style. Living inside the
    // "Use this style when typing" container means they only appear once that switch
    // is on, alongside the controls they set.
    const LF_DT_PRESETS = [
        {
            name: 'Jake',
            style: {
                font: "'Noto Sans', Arial, sans-serif",
                bold: true,
                italic: false,
                underline: false,
                size: 16,
                color: '#ff51b2',
                highlight: ''
            }
        }
    ];

    function lfDtFontLabel(css) {
        const f = LF_DT_FONTS.find(x => x.css === (css || ''));
        return f ? f.label : 'Default (editor font)';
    }

    // Font picker that opens BESIDE the settings panel, so it neither covers the
    // controls/preview underneath it nor pushes them down the card.
    function lfDtOpenFontList(anchorBtn, current, onPick) {
        document.querySelectorAll('.lf-dt-fontlist').forEach(p => p.remove());
        const list = document.createElement('div');
        list.className = 'lf-dt-fontlist';
        list.innerHTML = LF_DT_FONTS.map(f => `
            <div class="lf-dt-fontitem${(current || '') === f.css ? ' sel' : ''}" data-css="${f.css.replace(/"/g, '&quot;')}" style="font-family:${f.css || 'inherit'};">
                ${f.label}${f.vn === false ? '<small> - not VNese-safe</small>' : ''}
            </div>`).join('');

        const host = document.getElementById('lf-color-panel') || document.body;
        host.appendChild(list);

        // Prefer opening to the LEFT of the panel (over the page, not over the card)
        const panel = document.getElementById('lf-color-panel');
        const ar = anchorBtn.getBoundingClientRect();
        const w = list.offsetWidth || 240, hgt = list.offsetHeight || 320;
        let left;
        if (panel) {
            const pr = panel.getBoundingClientRect();
            left = pr.left - w - 10;
            if (left < 8) left = Math.min(ar.left, window.innerWidth - w - 8); // no room: fall back
        } else {
            left = Math.min(ar.left, window.innerWidth - w - 8);
        }
        list.style.left = Math.max(8, left) + 'px';
        list.style.top = Math.max(8, Math.min(ar.top, window.innerHeight - hgt - 8)) + 'px';

        list.querySelectorAll('.lf-dt-fontitem').forEach(it => {
            it.onclick = (e) => {
                e.preventDefault(); e.stopPropagation();
                // v100.8.70: the list STAYS OPEN so fonts can be auditioned one after
                // another against the live preview. It closes on Save Settings, on a
                // second click of the font button, or when the panel itself closes.
                onPick(it.dataset.css || '');
                list.querySelectorAll('.lf-dt-fontitem').forEach(o => o.classList.remove('sel'));
                it.classList.add('sel');
            };
        });

        setTimeout(() => {
            const away = (ev) => {
                // Only dismiss when the click is outside the list AND outside the panel
                const panelEl = document.getElementById('lf-color-panel');
                const inPanel = panelEl && panelEl.contains(ev.target);
                if (!list.contains(ev.target) && !inPanel) {
                    list.remove();
                    document.removeEventListener('mousedown', away, true);
                }
            };
            document.addEventListener('mousedown', away, true);
        }, 0);
    }

    function lfDtCloseFontList() {
        document.querySelectorAll('.lf-dt-fontlist').forEach(p => p.remove());
    }

    function lfDtLoad() {
        try { return Object.assign({}, LF_DT_DEFAULT, JSON.parse(localStorage.getItem(LF_DT_STORE) || '{}')); }
        catch (e) { return Object.assign({}, LF_DT_DEFAULT); }
    }
    function lfDtSave(s) { localStorage.setItem(LF_DT_STORE, JSON.stringify(s)); }

    // v100.8.60: the editor applies its own font-size/colour rules to typed content,
    // which silently beat a plain inline style (this is why the size control appeared
    // to do nothing). Marking each property !important makes the chosen style stick.
    function lfDtStyleString(s, important) {
        const bang = important ? ' !important' : '';
        const p = [];
        if (s.font) p.push(`font-family:${s.font}${bang}`);
        if (s.bold) p.push('font-weight:bold' + bang);
        if (s.italic) p.push('font-style:italic' + bang);
        if (s.underline) p.push('text-decoration:underline' + bang);
        if (s.size) p.push(`font-size:${s.size}px${bang}`);
        if (s.color) p.push(`color:${s.color}${bang}`);
        if (s.highlight) p.push(`background-color:${s.highlight}${bang}`);
        return p.join(';');
    }

    // v100.8.61: the app's own colour palette (same set the editor uses), shown in a
    // popup titled "Background Color" / "Foreground Color" just like the portal's.
    const LF_DT_PALETTE = [
        '#000000','#424242','#636363','#9C9C94','#CEC6CE','#EFEFEF','#F7F7F7','#FFFFFF',
        '#FF0000','#FF9C00','#FFFF00','#00FF00','#00FFFF','#0000FF','#9C00FF','#FF00FF',
        '#F7C6CE','#FFE7CE','#FFEFC6','#D6EFD6','#CEDEE7','#CEE7F7','#D6D6E7','#E7D6DE',
        '#E79C9C','#FFC69C','#FFE79C','#B5D6A5','#A5C6CE','#9CC6EF','#B5A5D6','#D6A5BD',
        '#E76363','#F7AD6B','#FFD663','#94BD7B','#73A5AD','#6BADDE','#8C7BC6','#C67BA5',
        '#CE0000','#E79439','#EFC631','#6BA54A','#4A7B8C','#3984C6','#634AA5','#A54A7B',
        '#9C0000','#B56308','#BD9400','#397B21','#104A5A','#085294','#311873','#731842',
        '#630000','#7B3900','#846300','#295218','#083139','#003163','#21104A','#4A1031'
    ];

    function lfDtOpenPalette(anchorBtn, kind, current, onPick, hostEl) {
        document.querySelectorAll('.lf-dt-palette').forEach(p => p.remove());
        const isBg = (kind === 'bg');
        const pal = document.createElement('div');
        pal.className = 'lf-dt-palette';
        pal.innerHTML = `
            <div class="lf-dt-pal-head">${isBg ? 'Background Color' : 'Foreground Color'}</div>
            <button type="button" class="lf-dt-pal-clear">${isBg ? 'Transparent' : 'Reset to default'}</button>
            <div class="lf-dt-pal-grid">${LF_DT_PALETTE.map(c =>
                `<span class="lf-dt-pal-sw${(current || '').toLowerCase() === c.toLowerCase() ? ' sel' : ''}" data-c="${c}" style="background:${c};" title="${c}"></span>`).join('')}</div>
            <label class="lf-dt-pal-custom">Custom<input type="color" value="${current || '#000000'}"></label>`;
        // v100.8.62: mount INSIDE the settings panel. Previously this was appended to
        // document.body, so the panel's own outside-click handler treated a colour
        // click as "outside" and collapsed the whole panel mid-customisation.
        // (The panel slides via `right`, not `transform`, so position:fixed still
        // resolves against the viewport and the popup lands where expected.)
        // v100.9.58: the host can be passed in, so the template editor can mount the
        // same picker inside its own dialog.
        const host = hostEl || document.getElementById('lf-color-panel') || document.body;
        host.appendChild(pal);

        const r = anchorBtn.getBoundingClientRect();
        pal.style.top = Math.max(8, Math.min(r.bottom + 6, window.innerHeight - pal.offsetHeight - 8)) + 'px';
        pal.style.left = Math.max(8, Math.min(r.left, window.innerWidth - pal.offsetWidth - 8)) + 'px';

        const done = (val) => { onPick(val); pal.remove(); };
        pal.querySelector('.lf-dt-pal-clear').onclick = (e) => { e.preventDefault(); e.stopPropagation(); done(isBg ? '' : '#000000'); };
        pal.querySelectorAll('.lf-dt-pal-sw').forEach(sw => {
            sw.onclick = (e) => { e.preventDefault(); e.stopPropagation(); done(sw.dataset.c); };
        });
        pal.querySelector('.lf-dt-pal-custom input').oninput = (e) => { onPick(e.target.value); };

        setTimeout(() => {
            const away = (ev) => {
                if (!pal.contains(ev.target) && ev.target !== anchorBtn && !anchorBtn.contains(ev.target)) {
                    pal.remove();
                    document.removeEventListener('mousedown', away, true);
                }
            };
            document.addEventListener('mousedown', away, true);
        }, 0);
    }

    // (The style is configured in the palette panel - see the "Default Text Style"
    // settings card. v100.8.60 removed the toolbar button and its popup.)

    // v100.8.62: the style is now seeded when you FOCUS an empty editor, not on the
    // first keydown. The old keydown hook required e.key.length === 1, which never
    // matches IME input (Vietnamese Telex reports "Process"/"Unidentified"), so typed
    // text never picked up the style. Seeding on focus also means the caret sits
    // inside the styled span before the very first character.
    function lfDtIsEmptyEditor(el) {
        if (!el) return false;
        if (el.querySelector('img, table')) return false;
        return (el.textContent || '').replace(/\u200B/g, '').trim().length === 0;
    }

    function lfDtSeedEditor(el) {
        try {
            const s = lfDtLoad();
            if (!s.enabled || !el || !el.isContentEditable) return;
            if (!lfDtIsEmptyEditor(el)) return;

            const css = lfDtStyleString(s, true);
            if (!css) return;

            // Already seeded with these exact settings? leave the caret alone
            const cur = el.querySelector('.lf-dt-seed');
            if (cur && cur.getAttribute('style') === css) return;

            const doc = el.ownerDocument;
            el.innerHTML = `<span class="lf-dt-seed" style="${css}">\u200B</span>`;
            const span = el.querySelector('.lf-dt-seed');
            const range = doc.createRange();
            range.setStart(span.firstChild, 1);
            range.collapse(true);
            const sel = doc.defaultView.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        } catch (err) {}
    }

    function lfDtInitTyping() {
        // Seed when an empty editor gains focus (works with IME, paste, everything)
        document.addEventListener('focusin', (e) => {
            const el = e.target;
            if (el && el.isContentEditable) setTimeout(() => lfDtSeedEditor(el), 30);
        }, true);

        // Backup: if the editor was emptied again (select-all + delete), re-seed
        // before the next character goes in.
        document.addEventListener('beforeinput', (e) => {
            try {
                if (!e.inputType || e.inputType.indexOf('insert') !== 0) return;
                const el = document.activeElement;
                if (el && el.isContentEditable && lfDtIsEmptyEditor(el)) lfDtSeedEditor(el);
            } catch (err) {}
        }, true);
    }

    // ==========================================
    // BONUS DETAILS MODAL (v100.8.65)
    // The "BONUS DETAILS - ... " modal grid is inside a modal, which the main table
    // loop deliberately skips, so it gets its own handling:
    //   - a copy button on every value in the "Loan #" column
    //   - a sort arrow on "Funded Date" (same look/behaviour as the liabilities and
    //     employment sorters)
    // Nothing else in the modal is touched.
    // ==========================================
    function lfFindBonusTable() {
        const dialogs = document.querySelectorAll('.modal.show, .modal[style*="display: block"], .ui-dialog[style*="display: block"], div[role="dialog"]');
        for (const d of dialogs) {
            if (!d.offsetWidth || !d.offsetHeight) continue;
            if (!(d.textContent || '').toUpperCase().includes('BONUS DETAILS')) continue;
            for (const t of d.querySelectorAll('table')) {
                const txt = (t.textContent || '').toLowerCase();
                if (txt.includes('funded date') && txt.includes('borrower')) return t;
            }
        }
        return null;
    }

    function lfFindBonusHeaderRow(table) {
        return Array.from(table.querySelectorAll('tr')).find(r => {
            const t = (r.textContent || '').toLowerCase();
            return t.includes('funded date') && (t.includes('loan #') || t.includes('borrower'));
        }) || null;
    }

    function lfBonusRows(table) {
        const allRows = Array.from(table.querySelectorAll('tr'));
        const hr = lfFindBonusHeaderRow(table);
        const startIdx = hr ? allRows.indexOf(hr) + 1 : 0;
        const dataRows = [], tailRows = [];
        for (let i = startIdx; i < allRows.length; i++) {
            const cells = allRows[i].querySelectorAll('td');
            const t = (allRows[i].textContent || '').toLowerCase();
            if (cells.length < 3 || t.includes('total')) { tailRows.push(allRows[i]); continue; }
            dataRows.push(allRows[i]);
        }
        return { dataRows, tailRows };
    }

    function lfBonusColIdx(table, label) {
        const hr = lfFindBonusHeaderRow(table);
        if (!hr) return -1;
        return Array.from(hr.children).findIndex(c => getCleanText(c).toLowerCase().includes(label));
    }

    // Copy button for every "Loan #" cell
    function lfBonusInjectLoanCopy(table) {
        const idx = lfBonusColIdx(table, 'loan #');
        if (idx < 0) return;
        lfBonusRows(table).dataRows.forEach(row => {
            const cell = row.cells ? row.cells[idx] : null;
            if (!cell || cell.querySelector('.lf-copy-btn')) return;
            const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT, null, false);
            let node;
            while ((node = walker.nextNode())) {
                const m = (node.nodeValue || '').match(/\b[A-Za-z]{0,5}\d{6,15}\b/);
                if (m) { injectInlineCopyBtn(node, m[0], false); break; }
            }
        });
    }

    function lfBonusSort(table, colIdx, asc) {
        const { dataRows, tailRows } = lfBonusRows(table);
        if (dataRows.length < 2) return;
        dataRows.sort((a, b) => {
            const aC = a.cells ? a.cells[colIdx] : null, bC = b.cells ? b.cells[colIdx] : null;
            const cmp = lfParseEmpDate(aC ? getCleanText(aC) : '') - lfParseEmpDate(bC ? getCleanText(bC) : '');
            return asc ? cmp : -cmp;
        });
        const body = dataRows[0].parentNode;
        dataRows.forEach(r => body.appendChild(r));
        tailRows.forEach(r => { if (r.parentNode) r.parentNode.appendChild(r); });
    }

    // Sort arrow on "Funded Date"
    function lfBonusInjectSorter(table) {
        const hr = lfFindBonusHeaderRow(table);
        if (!hr) return;
        const cell = Array.from(hr.children).find(c => getCleanText(c).toLowerCase().includes('funded date'));
        if (!cell || cell.querySelector('.lf-sort-btn')) return;

        const idx = cell.cellIndex;
        const btn = document.createElement('span');
        btn.className = 'lf-sort-btn';
        btn.innerHTML = SORT_NEUTRAL_SVG;
        btn.title = 'Sort by Funded Date';
        btn.onclick = (e) => {
            e.preventDefault(); e.stopPropagation();
            let asc = true;
            if (table.dataset.lfBonusSortCol === String(idx)) asc = table.dataset.lfBonusSortDir !== 'asc';
            table.dataset.lfBonusSortCol = String(idx);
            table.dataset.lfBonusSortDir = asc ? 'asc' : 'desc';

            hr.querySelectorAll('.lf-sort-btn').forEach(b => { b.innerHTML = SORT_NEUTRAL_SVG; b.classList.remove('active'); });
            Array.from(hr.children).forEach(c => c.classList.remove('lf-sorted-col'));
            btn.innerHTML = asc ? SORT_ASC_SVG : SORT_DESC_SVG;
            btn.classList.add('active');
            cell.classList.add('lf-sorted-col');

            lfBonusSort(table, idx, asc);
        };
        cell.appendChild(btn);
    }

    function lfBonusDetailsEnhance() {
        const table = lfFindBonusTable();
        if (!table) return;
        lfBonusInjectLoanCopy(table);
        lfBonusInjectSorter(table);
    }

    // ==========================================
    // EMPLOYMENT TABLE COLUMN SORTING (v100.8.51)
    // Mirrors the liabilities sorters: same SVG arrows, same click-to-toggle
    // behaviour, same orange sorted-column tint. Sortable columns:
    // Employer or Business Name, Monthly income, Start date, End date.
    // The default sort is Start date DESCENDING (newest job first), applied once.
    // The "Total employment income" row is always pinned at the bottom.
    // ==========================================
    const EMPLOYMENT_SORT_LABELS = ['employer or business name', 'monthly income', 'start date', 'end date'];
    const LF_EMP_DATE_BLANK = -8.64e15;   // finite sentinel: blank sorts oldest
    const LF_EMP_DATE_PRESENT = 8.64e15;  // finite sentinel: "Until present day" sorts newest

    function findEmploymentHeaderRow(table) {
        const allRows = Array.from(table.querySelectorAll('tr'));
        return allRows.find(r => {
            const t = (r.textContent || '').toLowerCase();
            return t.includes('employer or business name') && (t.includes('employment position') || t.includes('monthly income'));
        }) || null;
    }

    // Parses MM/DD/YYYY. "Until present day" / "Current" counts as ongoing (newest).
    function lfParseEmpDate(str) {
        const t = (str || '').replace(/\s+/g, ' ').trim();
        if (!t) return LF_EMP_DATE_BLANK;
        if (/present|current|ongoing/i.test(t)) return LF_EMP_DATE_PRESENT;
        const m = t.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (m) return new Date(parseInt(m[3], 10), parseInt(m[1], 10) - 1, parseInt(m[2], 10)).getTime();
        const p = Date.parse(t);
        return isNaN(p) ? LF_EMP_DATE_BLANK : p;
    }

    // Real employment rows (excludes the header and the "Total employment income" row)
    function getEmpDataRows(table) {
        const allRows = Array.from(table.querySelectorAll('tr'));
        const headerRow = findEmploymentHeaderRow(table);
        if (!headerRow) return { dataRows: [], tailRows: [] };
        const headerIdx = allRows.indexOf(headerRow);
        if (headerIdx === -1) return { dataRows: [], tailRows: [] };

        const dataRows = [], tailRows = [];
        for (let i = headerIdx + 1; i < allRows.length; i++) {
            const r = allRows[i];
            const cells = r.querySelectorAll('td');
            const txt = (r.textContent || '').toLowerCase();
            if (cells.length < 3 || txt.includes('total employment income') || /^\s*total\b/.test(txt)) {
                tailRows.push(r);
                continue;
            }
            dataRows.push(r);
        }
        return { dataRows, tailRows };
    }

    function sortEmploymentTable(table, colIdx, asc, kind) {
        const { dataRows, tailRows } = getEmpDataRows(table);
        if (dataRows.length < 2) return;

        dataRows.sort((a, b) => {
            const aC = a.cells ? a.cells[colIdx] : null, bC = b.cells ? b.cells[colIdx] : null;
            let cmp;
            if (kind === 'money') {
                cmp = parseMoney(aC ? getCleanText(aC) : '') - parseMoney(bC ? getCleanText(bC) : '');
            } else if (kind === 'date') {
                cmp = lfParseEmpDate(aC ? getCleanText(aC) : '') - lfParseEmpDate(bC ? getCleanText(bC) : '');
            } else {
                // Business name: use the name only, ignoring any "Missing: ..." sub-text
                const aT = aC ? (getEmployerName(aC) || getCleanText(aC)) : '';
                const bT = bC ? (getEmployerName(bC) || getCleanText(bC)) : '';
                cmp = aT.localeCompare(bT, undefined, { numeric: true, sensitivity: 'base' });
            }
            return asc ? cmp : -cmp;
        });

        const body = dataRows[0].parentNode;
        dataRows.forEach(r => body.appendChild(r));
        // Keep the "Total employment income" row pinned at the very bottom
        tailRows.forEach(r => { if (r.parentNode) r.parentNode.appendChild(r); });
    }

    function lfApplyEmpSort(table, idx, asc, kind, btn, cell) {
        table.dataset.lfEmpSortCol = String(idx);
        table.dataset.lfEmpSortDir = asc ? 'asc' : 'desc';

        const hr = findEmploymentHeaderRow(table);
        if (hr) {
            hr.querySelectorAll('.lf-sort-btn').forEach(b => {
                b.innerHTML = SORT_NEUTRAL_SVG;
                b.classList.remove('active');
            });
            Array.from(hr.children).forEach(c => c.classList.remove('lf-sorted-col'));
        }
        if (btn) {
            btn.innerHTML = asc ? SORT_ASC_SVG : SORT_DESC_SVG;
            btn.classList.add('active');
        }
        if (cell) cell.classList.add('lf-sorted-col');

        sortEmploymentTable(table, idx, asc, kind);
    }

    function injectEmploymentSorters(table) {
        const headerRow = findEmploymentHeaderRow(table);
        if (!headerRow) return; // Not the employment table - leave everything else alone

        Array.from(headerRow.children).forEach(cell => {
            if (cell.querySelector('.lf-sort-btn')) return; // Already injected

            const label = getCleanText(cell).replace(/[\u21C5\u25B2\u25BC]/g, '').trim();
            const lower = label.toLowerCase();
            const matched = EMPLOYMENT_SORT_LABELS.find(l => lower === l || lower.includes(l));
            if (!matched) return; // e.g. the "Add" cell, Employment position, Qualified amount, Verified

            const idx = cell.cellIndex;
            const kind = (matched === 'monthly income') ? 'money'
                       : ((matched === 'start date' || matched === 'end date') ? 'date' : 'text');

            const btn = document.createElement('span');
            btn.className = 'lf-sort-btn';
            btn.innerHTML = SORT_NEUTRAL_SVG;
            btn.title = `Sort by ${label}`;
            btn.onclick = (e) => {
                e.preventDefault(); e.stopPropagation();
                // Toggle direction when re-clicking the same column, else start ascending
                let asc = true;
                if (table.dataset.lfEmpSortCol === String(idx)) asc = table.dataset.lfEmpSortDir !== 'asc';
                lfApplyEmpSort(table, idx, asc, kind, btn, cell);
            };
            cell.appendChild(btn);
        });

        // Default sort: Start date DESCENDING - applied once, as soon as there are
        // at least two employment rows to order.
        if (!table.dataset.lfEmpDefaultSorted) {
            const startCell = Array.from(headerRow.children).find(c => getCleanText(c).toLowerCase().includes('start date'));
            if (startCell) {
                const sBtn = startCell.querySelector('.lf-sort-btn');
                if (sBtn && getEmpDataRows(table).dataRows.length >= 2) {
                    table.dataset.lfEmpDefaultSorted = '1';
                    lfApplyEmpSort(table, startCell.cellIndex, false, 'date', sBtn, startCell);
                }
            }
        }
    }

    function updateMainBtn(text) {
        const allBtns = Array.from(document.querySelectorAll('button, .btn, a.btn'));
        const sortBtn = allBtns.find(el => el.textContent && el.textContent.trim().startsWith('Sort:'));
        if (sortBtn && !sortBtn.textContent.includes(text)) {
            sortBtn.innerHTML = `Sort: ${text} <span class="caret"></span>`;
        }
    }

    function sortTableByTurnTime(asc) {
        // v100.9.6: give the app a moment to process a click before re-sorting
        if (Date.now() - lfOrderRestoredAt < 1200) return;
        const tbody = document.querySelector('table tbody');
        const thead = document.querySelector('table thead');
        if (!tbody || !thead) return;

        const headers = Array.from(thead.querySelectorAll('th, td')).map(h => (h.textContent || '').toLowerCase().trim());
        const statusIdx = headers.findIndex(h => h.includes('status'));

        // v100.9.6: This is a GWT CellTable. GWT resolves a click by locating the row's
        // position in the table, so physically reordering rows breaks its row-to-record
        // mapping and its handlers silently do nothing - which is why "View Loan" stopped
        // responding to any click. We still sort visually, but every row is stamped with
        // its true position first, and lfRestoreDomOrder() puts them back the moment the
        // user presses the mouse, so the app always sees its own layout.
        try {
            Array.from(tbody.querySelectorAll('tr')).forEach((r, i) => {
                if (!r.hasAttribute('data-lf-orig-index')) r.setAttribute('data-lf-orig-index', String(i));
            });
            tbody.dataset.lfSorted = '1';
        } catch (e) {}

        const rows = Array.from(tbody.querySelectorAll('tr'));
        if (rows.length === 0 || !rows.some(r => r.dataset.dueDate)) return;

        const dataRows = rows.filter(r => !r.querySelector('th') && !r.classList.contains('header'));
        const byDue = (a, b) => {
            const aTime = parseInt(a.dataset.dueDate) || (asc ? Infinity : -Infinity);
            const bTime = parseInt(b.dataset.dueDate) || (asc ? Infinity : -Infinity);
            return asc ? aTime - bTime : bTime - aTime;
        };

        // v100.8.99: Disclosure Specialist sorts EVERY ticket by turn time, whatever its
        // status. Underwriter keeps the original behaviour - only "New" tickets are
        // ordered, and they sit above the rest.
        if (lfTtRole() === 'disclosure') {
            const sorted = dataRows.slice().sort(byDue);
            const frag = document.createDocumentFragment();
            sorted.forEach(row => frag.appendChild(row));
            tbody.appendChild(frag);
            return;
        }

        const newRows = [];
        const otherRows = [];

        dataRows.forEach(row => {
            // Read the selected status only (the cell also contains the dropdown's options)
            const st = lfRowStatusText(row) || ((statusIdx > -1 && row.cells.length > statusIdx) ? row.cells[statusIdx].textContent.trim() : '');
            if (/^new\b/i.test(st)) newRows.push(row);
            else otherRows.push(row);
        });

        newRows.sort(byDue);

        const fragment = document.createDocumentFragment();
        newRows.forEach(row => fragment.appendChild(row));
        otherRows.forEach(row => fragment.appendChild(row));
        tbody.appendChild(fragment);
    }

    // ==========================================
    // CSS INJECTION
    // ==========================================
    function injectMasterCSS() {
        const style = document.createElement('style');
        style.innerHTML = `
            /* SVG Icon Buttons */
            .lf-icon-btn, .lf-emp-copy-btn { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 6px; cursor: pointer; opacity: 0.6; transition: all 0.2s ease; color: #5e6278; margin-left: 6px; vertical-align: middle; z-index: 10; background: transparent; border: none; outline: none; }
            .lf-icon-btn:hover, .lf-emp-copy-btn:hover { opacity: 1; background-color: rgba(0,0,0,0.06); color: #181c32; }
            .lf-emp-copy-btn { margin-left: 8px; flex-shrink: 0; }

            /* Toast stack (v100.8.35) */
            #lf-toast-stack { position: fixed; bottom: 24px; right: 24px; z-index: 100001; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; pointer-events: none; }
            .lf-toast2 { display: flex; align-items: center; gap: 9px; background: #ffffff; color: #333; border: 1px solid #e5e7eb; border-left: 4px solid #f36f20; border-radius: 10px; padding: 10px 16px; box-shadow: 0 6px 20px rgba(0,0,0,0.15); font-family: inherit; font-size: 13px; font-weight: 600; max-width: 380px; opacity: 0; transform: translateY(10px); transition: opacity 0.25s ease, transform 0.25s ease; pointer-events: auto; }
            .lf-toast2.show { opacity: 1; transform: translateY(0); }
            .lf-toast2 .lf-toast2-icon { flex-shrink: 0; display: inline-flex; align-items: center; }
            .lf-toast2 .lf-toast2-msg { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            /* legacy toast styles kept for safety */
            .lf-toast { position: fixed; top: 20px; right: 20px; background: #333; color: white; padding: 12px 24px; border-radius: 6px; z-index: 100000; box-shadow: 0 4px 15px rgba(0,0,0,0.25); font-family: sans-serif; font-weight: bold; opacity: 0; transform: translateY(-20px); transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
            .lf-toast.show { opacity: 1; transform: translateY(0); }

            /* Colorizer */
            .table-hover tbody tr td:first-child, table tr td:first-child { border-left: none !important; }
            table tbody tr.lf-row-purple td, table tr.lf-row-purple td { background: linear-gradient(var(--lf-purple-bg), var(--lf-purple-bg)), #ffffff !important; }
            table tbody tr.lf-row-green td, table tr.lf-row-green td { background: linear-gradient(var(--lf-green-bg), var(--lf-green-bg)), #ffffff !important; }
            table tbody tr.lf-row-red td, table tr.lf-row-red td { background: linear-gradient(var(--lf-red-bg), var(--lf-red-bg)), #ffffff !important; }
            table tbody tr.lf-row-blue td, table tr.lf-row-blue td { background: linear-gradient(var(--lf-blue-bg), var(--lf-blue-bg)), #ffffff !important; }
            table tbody tr.lf-row-yellow td, table tr.lf-row-yellow td { background: linear-gradient(var(--lf-yellow-bg), var(--lf-yellow-bg)), #ffffff !important; }
            table tbody tr.lf-row-new td, table tr.lf-row-new td { background: linear-gradient(var(--lf-new-bg), var(--lf-new-bg)), #ffffff !important; }

            table tbody tr.lf-row-purple:hover td, table tr.lf-row-purple:hover td { background: linear-gradient(var(--lf-purple-hover), var(--lf-purple-hover)), #ffffff !important; }
            table tbody tr.lf-row-green:hover td, table tr.lf-row-green:hover td { background: linear-gradient(var(--lf-green-hover), var(--lf-green-hover)), #ffffff !important; }
            table tbody tr.lf-row-red:hover td, table tr.lf-row-red:hover td { background: linear-gradient(var(--lf-red-hover), var(--lf-red-hover)), #ffffff !important; }
            table tbody tr.lf-row-blue:hover td, table tr.lf-row-blue:hover td { background: linear-gradient(var(--lf-blue-hover), var(--lf-blue-hover)), #ffffff !important; }
            table tbody tr.lf-row-yellow:hover td, table tr.lf-row-yellow:hover td { background: linear-gradient(var(--lf-yellow-hover), var(--lf-yellow-hover)), #ffffff !important; }
            table tbody tr.lf-row-new:hover td, table tr.lf-row-new:hover td { background: linear-gradient(var(--lf-new-hover), var(--lf-new-hover)), #ffffff !important; }
            .table-hover tbody tr td, table tr td { transition: background-color 0.15s ease !important; }

            /* Slide-Out Panel Styles */
            .lf-side-panel { position: fixed; top: 0; right: -400px; width: 360px; height: 100vh; background: #fff; box-shadow: -4px 0 25px rgba(0,0,0,0.15); z-index: 100000; transition: right 0.3s cubic-bezier(0.4, 0, 0.2, 1); display: flex; flex-direction: column; font-family: sans-serif; }
            .lf-side-panel.open { right: 0; }
            .lf-panel-header { padding: 20px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; background: #fcfcfd; }
            .lf-panel-title { font-size: 16px; font-weight: bold; color: #333; margin: 0; }
            .lf-close-btn { cursor: pointer; background: none; border: none; outline: none; font-size: 28px; line-height: 1; color: #aaa; transition: color 0.2s; padding: 0; }
            .lf-close-btn:hover { color: #333; }
            .lf-panel-content { padding: 20px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 15px; }
            .lf-themes-bar { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding-bottom: 15px; border-bottom: 1px dashed #e4e6ef; margin-bottom: 5px; }
            .lf-theme-btn { background: #fff; border: 1px solid #d1d5db; color: #4b5563; border-radius: 6px; padding: 4px 10px; font-size: 11px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
            .lf-theme-btn:hover { background: #f3f4f6; border-color: #9ca3af; color: #1f2937; }
            .lf-grid-row { display: flex; align-items: center; justify-content: space-between; background: #fff; padding: 10px 12px; border-radius: 6px; border: 1px solid #f1f1f4; }
            .lf-label-wrapper { display: inline-flex; align-items: center; gap: 8px; }
            .lf-row-label { font-size: 13px; font-weight: 700; color: #4b5563; }
            .lf-indicator-dot { width: 14px; height: 14px; border-radius: 50%; display: inline-block; box-shadow: 0 1px 3px rgba(0,0,0,0.15); border: 1px solid #cbd5e1; transition: background-color 0.2s ease; }
            .lf-swatch-list { display: flex; align-items: center; gap: 8px; }
            .lf-swatch { width: 20px; height: 20px; border-radius: 50%; cursor: pointer; border: 2px solid transparent; box-shadow: 0 1px 3px rgba(0,0,0,0.12); transition: transform 0.15s, box-shadow 0.15s; }
            .lf-swatch:hover { transform: scale(1.15); }
            .lf-swatch.active { transform: scale(1.25); box-shadow: 0 0 0 2px #ffffff, 0 0 0 4px #3f4254, 0 2px 6px rgba(0,0,0,0.25) !important; border-color: transparent !important; }
            .lf-swatch[data-color="#ffffff"] { border: 1px solid #cbd5e1; }
            .lf-swatch-picker { position: relative; background: linear-gradient(135deg, #ff0000 0%, #00ff00 50%, #0000ff 100%); display: inline-flex; align-items: center; justify-content: center; }
            .lf-swatch-picker input[type="color"] { position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; }
            .lf-swatch-picker::before { content: "🎨"; font-size: 9px; color: white; pointer-events: none; }

            /* Modern Settings UI */
            .lf-settings-card { margin-top: 15px; padding: 16px; background: #ffffff; border-radius: 10px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
            .lf-settings-title { font-size: 14px; font-weight: 700; color: #1e293b; margin: 0 0 12px 0; display: flex; align-items: center; gap: 6px; }
            .lf-switch-wrapper { display: flex; align-items: center; justify-content: space-between; cursor: pointer; padding: 4px 0; margin-bottom: 0; }
            .lf-switch-label { font-size: 13px; font-weight: 600; color: #4b5563; }
            .lf-switch { position: relative; display: inline-block; width: 36px; height: 20px; }
            .lf-switch input { opacity: 0; width: 0; height: 0; }
            .lf-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #cbd5e1; transition: .3s; border-radius: 20px; }
            .lf-slider:before { position: absolute; content: ""; height: 16px; width: 16px; left: 2px; bottom: 2px; background-color: white; transition: .3s; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.2); }
            .lf-switch input:checked + .lf-slider { background-color: #2ecc71; }
            .lf-switch input:checked + .lf-slider:before { transform: translateX(16px); }
            .lf-hours-container { overflow: hidden; transition: max-height 0.3s ease, opacity 0.3s ease, margin-top 0.3s ease; }
            .lf-hours-container.hidden { max-height: 0; opacity: 0; margin-top: 0; pointer-events: none; }
            .lf-hours-container.visible { max-height: 250px; opacity: 1; margin-top: 12px; }
            /* v100.8.67: the Default Text Style card holds more rows (Font, Format,
               Colours, Preview) than the shared 250px ceiling allows, which clipped the
               preview out of view. Only this card's container is raised. */
            #lf-dt-container.visible { max-height: 460px; }
            /* v100.8.75: the multi-line rule summary needs more room than the shared ceiling */
            #lf-tt-container.visible { max-height: 420px; }
            .lf-hours-inner { background: #f8fafc; padding: 12px; border-radius: 6px; border: 1px solid #e2e8f0; display: flex; flex-direction: column; gap: 8px; }
            /* v100.8.49: borrower name-color swatches */
            .lf-name-color-swatches { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
            .lf-name-swatch { width: 24px; height: 24px; border-radius: 50%; cursor: pointer; border: 2px solid #fff; box-shadow: 0 0 0 1px #cbd5e1; padding: 0; transition: transform 0.12s ease; }
            .lf-name-swatch:hover { transform: scale(1.15); }
            .lf-name-swatch.active { box-shadow: 0 0 0 2px #f36f20; }
            .lf-name-swatch-picker { -webkit-appearance: none; appearance: none; background: none; }
            .lf-name-swatch-picker::-webkit-color-swatch-wrapper { padding: 0; }
            .lf-name-swatch-picker::-webkit-color-swatch { border: none; border-radius: 50%; }
            .lf-hours-label { font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px;}
            .lf-hours-row { display: flex; align-items: center; gap: 10px; }
            .lf-time-input { flex: 1; padding: 6px 10px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px; color: #334155; font-family: inherit; outline: none; transition: border-color 0.2s, box-shadow 0.2s; background: #fff; }
            .lf-time-input:focus { border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2); }
            .lf-time-separator { font-size: 13px; font-weight: 500; color: #94a3b8; }

            #lf-auto-save-btn {
                margin-top: 16px;
                width: 100%;
                background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
                color: #ffffff;
                border: none;
                padding: 10px 16px;
                border-radius: 6px;
                font-size: 13px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s ease;
                box-shadow: 0 2px 4px rgba(59, 130, 246, 0.3);
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
            }
            #lf-auto-save-btn:hover { background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); box-shadow: 0 4px 8px rgba(59, 130, 246, 0.4); transform: translateY(-1px); }
            #lf-auto-save-btn:active { transform: translateY(1px); box-shadow: 0 1px 2px rgba(59, 130, 246, 0.3); }

            /* Liabilities Sort Arrows (v100.8.35: SVG icons) */
            .lf-sort-btn { cursor: pointer; margin-left: 6px; color: #9ca3af; user-select: none; display: inline-flex; align-items: center; justify-content: center; line-height: 1; vertical-align: middle; transition: color 0.15s ease, transform 0.1s ease; }
            .lf-sort-btn:hover { color: #181c32; transform: scale(1.2); }
            .lf-sort-btn.active { color: #f36f20; }
            /* Sorted-column highlight (v100.8.35) */
            .lf-sorted-col { background-color: rgba(243, 111, 32, 0.12) !important; border-radius: 4px; }

            /* v100.9.21: red caution text on the system-notice option */
            .lf-warn-caution { color: #dc2626; font-weight: 700; }

            /* v100.9.43: neon ring that travels clockwise around the marked result.
               The colours move around the border rather than the whole badge changing
               colour at once - the angle of a conic gradient is animated, so the ring
               itself stays still while the light runs around it. */
            @property --lf-gs-angle {
                syntax: '<angle>';
                initial-value: 0deg;
                inherits: false;
            }
            @keyframes lf-gs-spin { to { --lf-gs-angle: 360deg; } }
            /* fallback for engines without @property: rotate the layer instead */
            @keyframes lf-gs-spin-fallback { to { transform: rotate(360deg); } }
            @keyframes lf-gs-pulse { 50% { opacity: .75; } }

            .lf-gs-active {
                position: relative !important;
                border-radius: 6px;
                z-index: 0;
                scroll-margin: 12px;
            }
            /* the crisp ring */
            .lf-gs-active::before {
                content: '';
                position: absolute;
                inset: -3px;
                border-radius: 9px;
                padding: 2px;
                background: conic-gradient(from var(--lf-gs-angle),
                    #ff0066, #ff8c00, #ffe600, #00e676, #00b0ff, #7c4dff, #ff0066);
                -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
                -webkit-mask-composite: xor;
                mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
                mask-composite: exclude;
                animation: lf-gs-spin 1.8s linear infinite;
                pointer-events: none;
                z-index: -1;
            }
            /* The soft neon bleed. It is masked into a ring as well, with the hole
               lined up on the badge's own edge, so the glow stays outside and the
               LOAN / LEAD / APPLICATION text keeps its normal background. */
            .lf-gs-active::after {
                content: '';
                position: absolute;
                inset: -6px;
                border-radius: 12px;
                padding: 6px;
                background: conic-gradient(from var(--lf-gs-angle),
                    #ff0066, #ff8c00, #ffe600, #00e676, #00b0ff, #7c4dff, #ff0066);
                -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
                -webkit-mask-composite: xor;
                mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
                mask-composite: exclude;
                filter: blur(4px);
                opacity: .6;
                animation: lf-gs-spin 1.8s linear infinite, lf-gs-pulse 1.8s ease-in-out infinite;
                pointer-events: none;
                z-index: -2;
            }

            /* v100.9.63: the template editor, restyled.
               System typography, hairline separators, generous spacing and a single
               accent colour - the chrome recedes so the email being written is the
               only thing with weight on screen. */
            .lf-et-modal {
                position: fixed; inset: 0; z-index: 2147483600;
                background: rgba(0, 0, 0, .12);
                -webkit-backdrop-filter: saturate(140%) blur(6px);
                backdrop-filter: saturate(140%) blur(6px);
                display: flex; align-items: center; justify-content: center;
                font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Inter, system-ui, sans-serif;
                animation: lfEtFade .18s ease;
            }
            @keyframes lfEtFade { from { opacity: 0 } to { opacity: 1 } }
            @keyframes lfEtRise { from { opacity: 0; transform: translateY(12px) scale(.985) } to { opacity: 1; transform: none } }

            /* v100.9.65: closing runs the opening in reverse - the blur lifts off the
               page as the card settles back down, rather than both vanishing at once. */
            @keyframes lfEtFadeOut {
                from { opacity: 1; background: rgba(0,0,0,.12); -webkit-backdrop-filter: saturate(140%) blur(6px); backdrop-filter: saturate(140%) blur(6px); }
                to   { opacity: 0; background: rgba(0,0,0,0);   -webkit-backdrop-filter: saturate(100%) blur(0px); backdrop-filter: saturate(100%) blur(0px); }
            }
            @keyframes lfEtSink {
                from { opacity: 1; transform: none }
                to   { opacity: 0; transform: translateY(12px) scale(.985) }
            }
            .lf-et-modal.lf-et-closing {
                animation: lfEtFadeOut .2s cubic-bezier(.4,0,1,1) forwards;
                pointer-events: none;
            }
            .lf-et-modal.lf-et-closing .lf-et-box {
                animation: lfEtSink .2s cubic-bezier(.4,0,1,1) forwards;
            }

            .lf-et-box {
                background: #fff; border-radius: 18px;
                width: 720px; max-width: 94vw; max-height: 88vh;
                display: flex; flex-direction: column;
                box-shadow: 0 32px 64px rgba(0,0,0,.24), 0 0 0 .5px rgba(0,0,0,.06);
                overflow: hidden;
                animation: lfEtRise .22s cubic-bezier(.32,.72,0,1);
            }

            .lf-et-head {
                display: flex; align-items: center; gap: 12px;
                padding: 18px 22px 14px;
            }
            .lf-et-head h4 {
                margin: 0; font-size: 17px; font-weight: 600;
                letter-spacing: -.02em; color: #1d1d1f;
            }
            .lf-et-reset {
                margin: 0; padding: 5px 12px;
                background: rgba(0,0,0,.05); border: none; border-radius: 980px;
                font: 500 12px/1 inherit; color: #1d1d1f; cursor: pointer;
                transition: background .15s ease;
            }
            .lf-et-reset:hover { background: rgba(0,0,0,.09); }
            .lf-et-x {
                width: 28px; height: 28px; padding: 0;
                background: rgba(0,0,0,.05); border: none; border-radius: 50%;
                font-size: 17px; line-height: 1; color: #6e6e73; cursor: pointer;
                transition: background .15s ease, color .15s ease;
            }
            .lf-et-x:hover { background: rgba(0,0,0,.09); color: #1d1d1f; }

            .lf-et-note {
                padding: 0 22px 16px;
                font-size: 12px; line-height: 1.5; color: #6e6e73;
                letter-spacing: -.01em;
            }

            .lf-et-title-row {
                display: flex; align-items: center; gap: 12px;
                margin: 0 22px 14px; padding: 0;
            }
            .lf-et-title-row label {
                flex: none; font-size: 11px; font-weight: 600; color: #86868b;
                text-transform: uppercase; letter-spacing: .06em;
            }
            .lf-et-title {
                flex: 1; height: 36px; padding: 0 13px;
                border: none; border-radius: 10px;
                background: rgba(0,0,0,.04);
                font-size: 13px; color: #1d1d1f; font-family: inherit;
                letter-spacing: -.01em;
                transition: background .15s ease, box-shadow .15s ease;
            }
            .lf-et-title:focus {
                outline: none; background: #fff;
                box-shadow: 0 0 0 3.5px rgba(0,122,255,.25), inset 0 0 0 1px rgba(0,122,255,.6);
            }

            .lf-et-tools {
                display: flex; flex-wrap: wrap; align-items: center; gap: 2px;
                margin: 0 22px; padding: 6px;
                background: rgba(0,0,0,.04); border: none; border-radius: 12px;
            }
            .lf-et-tool {
                display: inline-flex; align-items: center; justify-content: center;
                min-width: 30px; height: 28px; padding: 0 7px;
                background: transparent; border: none; border-radius: 8px;
                font: 500 13px/1 inherit; color: #1d1d1f; cursor: pointer;
                transition: background .12s ease, color .12s ease;
            }
            .lf-et-tool:hover { background: rgba(0,0,0,.06); }
            .lf-et-tool.on { background: #fff; color: #007aff; box-shadow: 0 1px 3px rgba(0,0,0,.12); }
            .lf-et-sep { width: 1px; height: 18px; background: rgba(0,0,0,.1); margin: 0 5px; }

            .lf-et-size {
                height: 28px; min-width: 58px; padding: 0 6px;
                border: none; border-radius: 8px;
                background: transparent; color: #1d1d1f;
                font: 500 12px inherit; cursor: pointer;
                transition: background .12s ease;
            }
            .lf-et-size:hover { background: rgba(0,0,0,.06); }
            .lf-et-size:focus { outline: none; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.12); }

            .lf-et-swatch {
                display: inline-flex; flex-direction: column; align-items: center; justify-content: center;
                width: 32px; height: 28px; padding: 3px 0; gap: 2px;
                background: transparent; border: none; border-radius: 8px; cursor: pointer;
                transition: background .12s ease;
            }
            .lf-et-swatch:hover { background: rgba(0,0,0,.06); }
            .lf-et-sw-a { font: 600 11px/1 inherit; color: #1d1d1f; }
            .lf-et-sw-bar { width: 17px; height: 3px; border-radius: 2px; }
            .lf-et-sw-fill { width: 17px; height: 13px; border-radius: 3px; box-shadow: inset 0 0 0 .5px rgba(0,0,0,.15); }

            .lf-et-body {
                flex: 1; margin: 12px 22px 0; padding: 18px 20px;
                border: none; border-radius: 12px;
                background: rgba(0,0,0,.025);
                min-height: 280px; max-height: 44vh; overflow-y: auto;
                font-size: 13.5px; line-height: 1.65; color: #1d1d1f;
                letter-spacing: -.01em; outline: none;
                transition: background .15s ease, box-shadow .15s ease;
            }
            .lf-et-body:focus {
                background: #fff;
                box-shadow: 0 0 0 3.5px rgba(0,122,255,.2), inset 0 0 0 1px rgba(0,122,255,.5);
            }
            .lf-et-body::-webkit-scrollbar { width: 9px; }
            .lf-et-body::-webkit-scrollbar-thumb { background: rgba(0,0,0,.18); border-radius: 980px; border: 2px solid transparent; background-clip: content-box; }
            .lf-et-body .lf-et-ph { color: #007aff; font-weight: 600; }

            .lf-et-foot {
                display: flex; align-items: center; gap: 10px;
                padding: 18px 22px;
            }
            .lf-btn-sm {
                padding: 9px 20px; border-radius: 980px; border: none;
                background: rgba(0,0,0,.06); color: #1d1d1f;
                font: 500 13px inherit; cursor: pointer; letter-spacing: -.01em;
                transition: background .15s ease, transform .1s ease;
            }
            .lf-btn-sm:hover { background: rgba(0,0,0,.1); }
            .lf-btn-sm:active { transform: scale(.97); }
            .lf-btn-primary-sm { background: #007aff; color: #fff; font-weight: 600; }
            .lf-btn-primary-sm:hover { background: #0071eb; }


            /* v100.9.63: the shared colour picker, when it opens inside the template
               editor. Scoped to .lf-et-box so the settings panel is untouched. */
            .lf-et-box .lf-dt-palette {
                border: none; border-radius: 14px; width: 188px; padding: 0 0 10px;
                box-shadow: 0 16px 40px rgba(0,0,0,.2), 0 0 0 .5px rgba(0,0,0,.06);
                font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Inter, system-ui, sans-serif;
            }
            .lf-et-box .lf-dt-pal-head {
                background: transparent; border-bottom: .5px solid rgba(0,0,0,.08);
                font-size: 12px; font-weight: 600; color: #1d1d1f; padding: 11px 6px;
                letter-spacing: -.01em;
            }
            .lf-et-box .lf-dt-pal-clear {
                width: calc(100% - 20px); margin: 10px; padding: 7px;
                background: rgba(0,0,0,.05); border: none; border-radius: 980px;
                font-size: 12px; font-weight: 500; color: #1d1d1f;
            }
            .lf-et-box .lf-dt-pal-clear:hover { background: rgba(0,0,0,.09); }
            .lf-et-box .lf-dt-pal-grid { gap: 3px; padding: 0 10px; }
            .lf-et-box .lf-dt-pal-sw { border-radius: 5px; box-shadow: inset 0 0 0 .5px rgba(0,0,0,.14); }
            .lf-et-box .lf-dt-pal-sw:hover,
            .lf-et-box .lf-dt-pal-sw.sel { outline: 2px solid #007aff; outline-offset: 1px; }
            .lf-et-box .lf-dt-pal-custom { margin: 10px 10px 0; font-size: 11px; color: #86868b; font-weight: 500; }
            .lf-et-box .lf-dt-pal-custom input { border: none; border-radius: 6px; box-shadow: inset 0 0 0 .5px rgba(0,0,0,.15); }

            /* v100.9.47: mortgage insurance, highlighted so it stands out from LTV */
            .lf-mi-appended {
                margin-left: 8px;
                padding: 1px 6px;
                border-radius: 4px;
                background: #fff3bf;
                color: #663c00;
                font-weight: 700;
                white-space: nowrap;
            }
            .lf-mi-appended .lf-icon-btn { color: #663c00; }

            /* v100.9.41: repeat counter on a coalesced toast */
            .lf-toast2-count {
                margin-left: 8px; padding: 1px 7px;
                background: rgba(255,255,255,.22); border-radius: 999px;
                font-size: 11px; font-weight: 800; letter-spacing: .2px;
            }

            /* v100.9.36: to-do list drag & drop upload */
            /* v100.9.53: a fixed, compact box in normal flow. It used to be absolutely
               positioned to fill whatever space the row had left, which meant rows
               with an Upload AND a Bypass button squeezed it down to a sliver or hid
               it completely. Now it always takes the same small amount of room and the
               row grows by that much - and the whole cell accepts a drop anyway, so
               the target is much bigger than the box looks. */
            td.lf-drop-cell { position: relative; }
            td.lf-drop-cell.lf-drop-over-cell { background: rgba(99, 102, 241, .10) !important; }

            .lf-drop-box {
                display: flex; align-items: center; justify-content: center; gap: 4px;
                width: 100%; box-sizing: border-box;
                margin-top: 5px; padding: 4px 6px;
                min-height: 26px;
                border: 1px dashed rgba(100, 116, 139, .5);
                border-radius: 6px;
                background: transparent;
                color: rgba(71, 85, 105, .8);
                font-size: 10px; font-weight: 600; line-height: 1.2;
                text-align: center; cursor: pointer; user-select: none;
                white-space: nowrap;
                transition: border-color .15s ease, background .15s ease, color .15s ease;
            }
            .lf-drop-box svg { opacity: .6; flex: none; transition: opacity .15s ease; }
            .lf-drop-box .lf-drop-text { pointer-events: none; overflow: hidden; text-overflow: ellipsis; }

            .lf-drop-box:hover { border-color: #6366f1; background: rgba(99,102,241,.07); color: #4f46e5; }
            .lf-drop-box:hover svg { opacity: 1; }

            .lf-drop-box.lf-drop-over {
                border: 1.5px solid #4f46e5; background: rgba(99,102,241,.16); color: #3730a3;
            }
            .lf-drop-box.lf-drop-over svg { opacity: 1; }
            .lf-drop-box.lf-drop-busy { opacity: .55; cursor: progress; }
            .lf-drop-box.lf-drop-ok {
                border: 1.5px solid #16a34a; background: rgba(22,163,74,.14); color: #15803d;
            }
            .lf-drop-box.lf-drop-ok svg { opacity: 1; }

            /* v100.9.41: repeat counter on a coalesced toast */
            .lf-toast2-count {
                margin-left: 8px; padding: 1px 7px;
                background: rgba(255,255,255,.22); border-radius: 999px;
                font-size: 11px; font-weight: 800; letter-spacing: .2px;
            }

            /* v100.9.66: a duplicate .lf-drop-box rule used to sit here, left over
               from when the box was absolutely positioned. Being later in the
               stylesheet it overrode the working rule above, and it depended on a
               top value from a JS sizer that no longer exists - so the box had no
               height and vanished from the page. Removed. */
            /* v100.9.20: Default Text Style presets */
            .lf-dt-preset {
                display: inline-flex; align-items: center; gap: 5px;
                height: 28px; padding: 0 12px;
                background: #fff; border: 1px solid #cbd5e1; border-radius: 6px;
                font-size: 12px; font-weight: 700; color: #334155;
                cursor: pointer; font-family: inherit;
                transition: background .15s, border-color .15s, color .15s;
            }
            .lf-dt-preset:hover { background: #f8fafc; border-color: #7c3aed; color: #7c3aed; }
            .lf-dt-preset.applied { background: #7c3aed; border-color: #7c3aed; color: #fff; }

            /* v100.8.60: Default Text Style controls */
            .lf-dt-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
            .lf-dt-tbtn { width: 30px; height: 30px; border: 1px solid #cbd5e1; background: #fff; border-radius: 6px; cursor: pointer; font-size: 13px; color: #334155; display: inline-flex; align-items: center; justify-content: center; transition: all .15s ease; font-family: inherit; padding: 0; }
            .lf-dt-tbtn:hover { border-color: #f36f20; color: #f36f20; }
            .lf-dt-tbtn.on { background: #f36f20; border-color: #f36f20; color: #fff; }
            .lf-dt-select { height: 30px; border: 1px solid #cbd5e1; border-radius: 6px; padding: 0 6px; font-size: 12px; font-family: inherit; color: #334155; background: #fff; cursor: pointer; }
            .lf-dt-select:focus { border-color: #f36f20; outline: none; }
            /* v100.8.68: font picker button + side-opening list */
            .lf-dt-fontbtn { display: flex; align-items: center; justify-content: space-between; gap: 6px; flex: 1; min-width: 150px; height: 30px; padding: 0 8px; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff; color: #334155; font-size: 12px; cursor: pointer; text-align: left; }
            .lf-dt-fontbtn:hover { border-color: #f36f20; }
            .lf-dt-fontbtn span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .lf-dt-fontlist { position: fixed; z-index: 100005; width: 240px; max-height: 340px; overflow-y: auto; background: #fff; border: 1px solid #d5d8dc; border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,.22); padding: 4px; font-family: inherit; }
            .lf-dt-fontitem { padding: 7px 9px; font-size: 13px; color: #1e293b; border-radius: 6px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .lf-dt-fontitem:hover { background: #fff3ea; }
            .lf-dt-fontitem.sel { background: #f36f20; color: #fff; }
            .lf-dt-fontitem small { font-size: 10px; color: #94a3b8; font-family: inherit; }
            .lf-dt-fontitem.sel small { color: #ffe3d1; }
            .lf-dt-swatch-btn { display: inline-flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; width: 34px; height: 30px; border: 1px solid #cbd5e1; background: #fff; border-radius: 6px; cursor: pointer; font-family: inherit; padding: 2px 0; transition: all .15s ease; }
            .lf-dt-swatch-btn:hover { border-color: #f36f20; }
            .lf-dt-swatch-a { font-size: 11px; font-weight: 800; line-height: 1; color: #334155; }
            .lf-dt-swatch-bar { width: 20px; height: 5px; border-radius: 4px; border: 1px solid rgba(0,0,0,.15); }
            .lf-dt-swatch-bar.none { background: linear-gradient(to bottom right, transparent 44%, #dc2626 44%, #dc2626 56%, transparent 56%) !important; }
            /* Colour palette popup (mirrors the portal's own picker) */
            .lf-dt-palette { position: fixed; z-index: 100005; background: #fff; border: 1px solid #d5d8dc; border-radius: 6px; box-shadow: 0 6px 22px rgba(0,0,0,.2); padding: 0 0 8px; width: 172px; font-family: inherit; }
            .lf-dt-pal-head { text-align: center; font-size: 12px; color: #4b5563; padding: 7px 6px; border-bottom: 1px solid #e5e7eb; background: #f8fafc; border-radius: 6px 6px 0 0; }
            .lf-dt-pal-clear { display: block; width: calc(100% - 16px); margin: 8px; padding: 6px; font-size: 12px; font-weight: 700; color: #111827; background: #fff; border: 1px solid #d5d8dc; border-radius: 4px; cursor: pointer; font-family: inherit; }
            .lf-dt-pal-clear:hover { background: #f3f4f6; }
            .lf-dt-pal-grid { display: grid; grid-template-columns: repeat(8, 1fr); gap: 2px; padding: 0 8px; }
            .lf-dt-pal-sw { width: 100%; padding-top: 100%; border-radius: 4px; cursor: pointer; box-shadow: inset 0 0 0 1px rgba(0,0,0,.12); }
            .lf-dt-pal-sw:hover { outline: 2px solid #f36f20; outline-offset: 1px; }
            .lf-dt-pal-sw.sel { outline: 2px solid #f36f20; outline-offset: 1px; }
            .lf-dt-pal-custom { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin: 8px 8px 0; font-size: 11px; color: #64748b; font-weight: 600; }
            .lf-dt-pal-custom input { width: 34px; height: 24px; padding: 0; border: 1px solid #cbd5e1; border-radius: 4px; background: none; cursor: pointer; }
            .lf-dt-mini { height: 30px; padding: 0 10px; border: 1px solid #cbd5e1; background: #fff; border-radius: 6px; font-size: 11px; font-weight: 600; color: #64748b; cursor: pointer; font-family: inherit; transition: all .15s ease; }
            .lf-dt-mini:hover { border-color: #f36f20; color: #f36f20; }
            #lf-dt-preview { border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px; background: #fff; min-height: 40px; word-break: break-word; line-height: 1.45; }

            /* v100.9.10: the row that carries the Resubmit / disclose-due chips */
            .lf-chip-row { display: block; margin: 3px 0 2px; line-height: 1.6; }
            .lf-chip-row > *:first-child { margin-left: 0 !important; }

            /* v100.8.91: disclose-due calendar, styled after the portal's own picker */
            .lf-dd-popup { position: absolute; z-index: 2147483000; background: #fff; border: 1px solid #d5d8dc; border-radius: 4px; box-shadow: 0 6px 24px rgba(0,0,0,.18); padding: 10px 12px 8px; width: 292px; font-family: inherit; }
            .lf-cal-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
            .lf-cal-title { font-size: 17px; color: #212529; }
            .lf-cal-title b { font-weight: 700; }
            .lf-cal-title span { font-weight: 400; color: #495057; margin-left: 4px; }
            .lf-cal-head button { background: none; border: none; font-size: 20px; line-height: 1; color: #495057; cursor: pointer; padding: 0 8px; border-radius: 4px; font-family: inherit; }
            .lf-cal-head button:hover { background: #f1f3f5; }
            .lf-cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); }
            .lf-cal-dow div { text-align: center; font-size: 11px; font-weight: 700; color: #495057; padding: 4px 0 6px; }
            .lf-cal-day { display: flex; align-items: center; justify-content: center; height: 32px; font-size: 13px; color: #212529; cursor: pointer; border-radius: 50%; margin: 1px auto; width: 32px; }
            .lf-cal-day:hover { background: #e9ecef; }
            .lf-cal-day.muted { color: #ced4da; }
            .lf-cal-day.today { box-shadow: inset 0 0 0 1px #adb5bd; }
            .lf-cal-day.sel { background: #1c9dea !important; color: #fff !important; box-shadow: none; }
            .lf-cal-foot { display: flex; align-items: center; justify-content: space-between; border-top: 1px solid #f1f3f5; margin-top: 6px; padding-top: 7px; }
            .lf-cal-note { font-size: 11px; color: #868e96; }
            .lf-dd-rm { background: #dc2626; color: #fff; border: none; border-radius: 4px; padding: 5px 12px; font-size: 11px; font-weight: 700; cursor: pointer; font-family: inherit; }
            .lf-dd-rm:hover { background: #c82333; }

            /* v100.8.76: Tickets Turn-time rule summary (one line per tier) */
            .lf-tt-summary { background: #fff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 9px 11px; font-size: 12px; line-height: 1.7; color: #334155; }
            .lf-tt-summary b { color: #1e293b; font-weight: 800; }
            .lf-tt-summary .lf-tt-note { margin-top: 6px; padding-top: 6px; border-top: 1px dashed #e2e8f0; color: #64748b; font-size: 11px; }
            .lf-tt-summary.tbd { color: #b45309; background: #fff7ed; border-color: #f3ceb6; font-weight: 700; text-align: center; padding: 12px; }

            /* Liabilities Button */
            #custom-lf-copy-btn { margin-bottom: 12px; padding: 10px 20px; background-color: rgba(0, 0, 0, 0.04); color: #5e6278; border: 1px solid rgba(0, 0, 0, 0.08); border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 15px; display: inline-flex; align-items: center; gap: 8px; transition: all 0.2s ease; font-family: inherit; outline: none; }
            #custom-lf-copy-btn:hover { background-color: rgba(0, 0, 0, 0.08); color: #181c32; }
            #custom-lf-copy-btn:active { transform: scale(0.98); }
            .lf-svg-container { display: inline-flex; align-items: center; justify-content: center; }
        `;
        document.head.appendChild(style);
    }

    // ==========================================
    // COLOR PIPELINE UTILS
    // ==========================================
    const COLOR_DEFAULTS = {
        purple: { hex: '#28a745', alpha: 0.25 },
        green:  { hex: '#28a745', alpha: 0.25 },
        yellow: { hex: '#ffc107', alpha: 0.35 },
        blue:   { hex: '#17a2b8', alpha: 0.20 },
        red:    { hex: '#dc3545', alpha: 0.22 },
        new:    { hex: '#ffffff', alpha: 0.25 }
    };
    const COLOR_PRESETS = [
        { hex: '#9370db', name: 'Indigo' }, { hex: '#28a745', name: 'Emerald' },
        { hex: '#ffc107', name: 'Amber' }, { hex: '#17a2b8', name: 'Cyan' },
        { hex: '#dc3545', name: 'Rose' }, { hex: '#ffffff', name: 'White' }
    ];
    const THEMES = {
        classic: { purple: '#28a745', green: '#28a745', yellow: '#ffc107', blue: '#17a2b8', red: '#dc3545', new: '#ffffff' },
        pastel: { purple: '#86efac', green: '#a7f3d0', yellow: '#fef08a', blue: '#bfdbfe', red: '#fecaca', new: '#ffffff' },
        ocean: { purple: '#0d9488', green: '#059669', yellow: '#fbbf24', blue: '#2563eb', red: '#e11d48', new: '#ffffff' },
        white: { purple: '#ffffff', green: '#ffffff', yellow: '#ffffff', blue: '#ffffff', red: '#ffffff', new: '#ffffff' }
    };
    const STATUS_MAP = {
        purple: ['clear to close', 'loan documents at title', 'underwriting clear to close'],
        green: ['funded', 'closed', 'docs signed'],
        red: ['suspended', 'denied', 'withdrawn', 'cancelled', 'rejected'],
        blue: ['pending approval', 'pending lender', 'submitted', 'processing', 'new', 'docs out'],
        yellow: ['approved']
    };

    function hexToRgba(hex, alpha) {
        if (hex.toLowerCase() === '#ffffff') return 'transparent';
        const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
        const fullHex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(fullHex);
        return result ? `rgba(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}, ${alpha})` : '';
    }

    function applyColor(colorKey, hex) {
        const alpha = COLOR_DEFAULTS[colorKey].alpha;
        document.documentElement.style.setProperty(`--lf-${colorKey}`, hex);
        document.documentElement.style.setProperty(`--lf-${colorKey}-bg`, hexToRgba(hex, alpha));
        document.documentElement.style.setProperty(`--lf-${colorKey}-hover`, hexToRgba(hex, hex.toLowerCase() === '#ffffff' ? 0 : alpha + 0.1));
    }

    function initColors() {
        for (const colorKey of Object.keys(COLOR_DEFAULTS)) {
            const savedHex = localStorage.getItem(`lf_color_${colorKey}`) || COLOR_DEFAULTS[colorKey].hex;
            applyColor(colorKey, savedHex);
        }
    }

    function updateActiveSwatch(statusKey) {
        const rowEl = document.querySelector(`[data-row-status="${statusKey}"]`);
        if (!rowEl) return;
        const currentHex = (localStorage.getItem(`lf_color_${statusKey}`) || COLOR_DEFAULTS[statusKey].hex).toLowerCase();

        const dot = rowEl.querySelector(`[data-indicator-status="${statusKey}"]`);
        if (dot) dot.style.backgroundColor = currentHex;

        const allSwatches = rowEl.querySelectorAll('.lf-swatch');
        allSwatches.forEach(s => s.classList.remove('active'));

        let matchedPreset = false;
        const swatches = rowEl.querySelectorAll('.lf-swatch:not(.lf-swatch-picker)');
        swatches.forEach(sw => {
            if (sw.dataset.color.toLowerCase() === currentHex) {
                sw.classList.add('active');
                matchedPreset = true;
            }
        });

        const customPickerSwatch = rowEl.querySelector('.lf-swatch-picker');
        const customPickerInput = customPickerSwatch.querySelector('input[type="color"]');
        if (customPickerInput) customPickerInput.value = currentHex;

        if (!matchedPreset && customPickerSwatch) customPickerSwatch.classList.add('active');
    }

    // ==========================================
    // INLINE COMPONENT INJECTORS
    // ==========================================
    function injectInlineCopyBtn(element, textToCopy, isEmp = false) {
        const targetElement = element.nodeType === 3 ? element.parentNode : element;

        if (!targetElement || targetElement.querySelector(isEmp ? '.lf-emp-copy-btn' : '.lf-copy-btn') || !textToCopy.trim()) return;

        if (isEmp) {
            let linkNode = targetElement.querySelector('a') || targetElement;
            targetElement.style.display = 'flex';
            targetElement.style.alignItems = 'center';
            targetElement.style.flexWrap = 'nowrap';

            const btn = document.createElement('button');
            btn.className = 'lf-emp-copy-btn';
            btn.setAttribute('data-copy-text', textToCopy);
            btn.innerHTML = COPY_SVG;
            btn.title = 'Copy Company Name';
            btn.onclick = async (e) => {
                e.preventDefault(); e.stopPropagation();
                try {
                    await navigator.clipboard.writeText(textToCopy);
                    btn.innerHTML = CHECK_SVG;
                    showToast(`Copied: ${textToCopy}`);
                    setTimeout(() => btn.innerHTML = COPY_SVG, 1000);
                } catch(err) {}
            };
            linkNode.parentNode.insertBefore(btn, linkNode.nextSibling);
        } else {
            const btn = document.createElement('button');
            btn.className = 'lf-copy-btn lf-icon-btn';
            btn.setAttribute('data-copy-text', textToCopy);
            btn.innerHTML = COPY_SVG;
            btn.title = 'Copy';
            btn.onclick = (e) => {
                e.preventDefault(); e.stopPropagation();
                navigator.clipboard.writeText(textToCopy);
                btn.innerHTML = CHECK_SVG;
                showToast(`Copied: ${textToCopy}`);
                setTimeout(() => { if (btn) btn.innerHTML = COPY_SVG; }, 1000);
            };
            element.parentNode.insertBefore(btn, element.nextSibling);
        }
    }

    function injectModalInlineCopy(parent, textToCopy) {
        if (!parent || parent.querySelector('.lf-modal-copy-btn') || !textToCopy.trim()) return;
        textToCopy = lfMaybeStripPhone(textToCopy);   // v100.8.93
        const btn = document.createElement('button');
        btn.className = 'lf-modal-copy-btn lf-icon-btn';
        btn.setAttribute('data-copy-text', textToCopy.trim());
        btn.innerHTML = COPY_SVG;
        btn.onclick = (e) => {
            e.preventDefault(); e.stopPropagation();
            navigator.clipboard.writeText(textToCopy.trim());
            btn.innerHTML = CHECK_SVG;
            showToast(`Copied: ${textToCopy.trim()}`);
            setTimeout(() => { if (btn) btn.innerHTML = COPY_SVG; }, 1000);
        };

        const ltvSpan = parent.querySelector('.lf-ltv-appended');
        if (ltvSpan) {
            parent.insertBefore(btn, ltvSpan);
        } else {
            parent.appendChild(btn);
        }
    }

    function injectModalUnderCopy(parent, textToCopy) {
        if (!parent || parent.querySelector('.lf-modal-copy-btn') || !textToCopy.trim()) return;
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'display: block; margin-top: 4px;';
        injectModalInlineCopy(wrapper, textToCopy);
        parent.appendChild(wrapper);
    }

    // ==========================================
    // HEADER COPY BUTTONS (v100.8.34)
    // 1) "Borrower name + Loan number" button, placed right after the Loan number.
    //    Copies e.g. "PAULITA RANA 6692406892" - the Loan ID is intentionally SKIPPED.
    //    If there is no "Loan number" field, NO button is added (never next to Loan ID).
    // 2) "Property address" button, placed right after the subject property address line.
    // Buttons match the style of the existing inline copy buttons.
    // ==========================================
    function makeHeaderCopyBtn(textToCopy, title) {
        const btn = document.createElement('button');
        btn.className = 'lf-hdr-copy-btn lf-icon-btn';
        btn.setAttribute('data-copy-text', textToCopy);
        btn.innerHTML = COPY_SVG;
        btn.title = title || 'Copy';
        btn.onclick = (e) => {
            e.preventDefault(); e.stopPropagation();
            navigator.clipboard.writeText(textToCopy);
            btn.innerHTML = CHECK_SVG;
            showToast(`Copied: ${textToCopy}`);
            setTimeout(() => { if (btn) btn.innerHTML = COPY_SVG; }, 1000);
        };
        return btn;
    }

    // Adds (or refreshes) a header copy button inside hostEl. If the loan file changes
    // and the text is different, the stale button is replaced with a fresh one.
    function upsertHeaderCopyBtn(hostEl, textToCopy, title) {
        if (!hostEl || !textToCopy || !textToCopy.trim()) return;
        let btn = hostEl.querySelector(':scope > .lf-hdr-copy-btn');
        if (btn && btn.getAttribute('data-copy-text') !== textToCopy) { btn.remove(); btn = null; }
        if (!btn) hostEl.appendChild(makeHeaderCopyBtn(textToCopy, title));
    }

    function injectHeaderCopyButtons() {
        const idRegex = /Loan\s*ID:\s*[A-Za-z0-9-]+/i;

        // Find the innermost element in the page header containing "Loan ID: ..."
        const candidates = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, span, div, small, p')).filter(el => {
            if (el.closest('.modal, .ui-dialog, table, #lf-color-panel, #lf-confirm-dialog')) return false;
            const t = (el.textContent || '');
            return idRegex.test(t) && t.length <= 160;
        });
        if (!candidates.length) return;
        const idEl = candidates.find(el => !candidates.some(other => other !== el && el.contains(other))) || candidates[candidates.length - 1];
        if (!idEl) return;

        const fullTxt = getCleanText(idEl);

        // ----- 1) Borrower name + Loan number (Loan ID intentionally skipped) -----
        const numMatch = fullTxt.match(/Loan\s*number:\s*([A-Za-z0-9-]+)/i);
        if (numMatch) { // No "Loan number" field -> no button at all
            // The borrower name is either inside the same element (text before "Loan ID:")
            // or in a sibling element that appears BEFORE the Loan ID element.
            let nameText = fullTxt.split(/Loan\s*ID:/i)[0].replace(/[|]/g, ' ').replace(/\s+/g, ' ').trim();
            if (!nameText) {
                let p = idEl;
                for (let d = 0; d < 3 && !nameText; d++) {
                    p = p.parentElement; if (!p) break;
                    for (const child of Array.from(p.children)) {
                        if (child === idEl || child.contains(idEl)) break; // name must come before the Loan ID element
                        if (child.classList && child.classList.contains('lf-hdr-copy-btn')) continue;
                        const t = getCleanText(child);
                        if (t && t.length >= 2 && t.length <= 80 && !/loan\s*(id|number)|dti|%/i.test(t)) { nameText = t; break; }
                    }
                }
            }
            if (nameText) {
                upsertHeaderCopyBtn(idEl, `${nameText} ${numMatch[1]}`, 'Copy borrower name + loan number');
            }
        }

        // ----- 2) Subject property address (the line under the borrower name) -----
        // e.g. "5246 Pacific Terrace, Hawthorne, CA 90250"
        const addrRegex = /^\d{1,6}[A-Za-z]?\s+.{2,60},\s*.{2,40},\s*[A-Z]{2}\s*\d{5}(?:-\d{4})?$/;
        let addrEl = null, anc = idEl;
        for (let d = 0; d < 5 && !addrEl; d++) {
            anc = anc.parentElement; if (!anc) break;
            const leafs = Array.from(anc.querySelectorAll('div, span, p, h4, h5, h6, small')).filter(e => {
                if (e.closest('table, .modal, .ui-dialog')) return false;
                // Treat as leaf if it has no child elements, or its only children are our own copy buttons
                return Array.from(e.children).every(c => c.classList && c.classList.contains('lf-hdr-copy-btn'));
            });
            addrEl = leafs.find(e => addrRegex.test(getCleanText(e))) || null;
        }
        if (addrEl) {
            upsertHeaderCopyBtn(addrEl, getCleanText(addrEl), 'Copy property address');
        }
    }

    // ==========================================
    // LOAN SUMMARY COPY BUTTONS (v100.9.28)
    // This is the exact code that used to sit inline in Master Loop 1. It was moved
    // out for one reason: that loop runs once a second and skips everything while
    // text is selected, so the buttons arrived late and stayed missing for up to a
    // second after the panel re-rendered. It only inserts a button where one is
    // missing, so calling it repeatedly costs nothing.
    // ==========================================
    function lfInjectModalCopyButtons() {
        // 3. Modal Texts (Borrower Info, Loan Number, Vesting, Financials)
        try {
            document.querySelectorAll('.modal.show, .modal[style*="display: block"], .ui-dialog[style*="display: block"]').forEach(modal => {
                const textUpper = (modal.textContent || '').toUpperCase();

                if (textUpper.includes('BORROWER INFORMATION')) {
                    modal.querySelectorAll('table').forEach(tbl => {
                        const firstRow = tbl.querySelector('tr');
                        if (!firstRow) return;
                        const thText = Array.from(firstRow.children).map(h => (h.textContent||'').toLowerCase().trim());
                        const nIdx = thText.findIndex(h => h.includes('full name') || h === 'name');
                        const pIdx = thText.findIndex(h => h.includes('phone'));
                        const eIdx = thText.findIndex(h => h.includes('email'));

                        tbl.querySelectorAll('tbody tr, tr').forEach(row => {
                            if (row === firstRow) return;
                            const tds = row.children;
                            if (nIdx > -1 && tds[nIdx]) injectModalUnderCopy(tds[nIdx], getCleanText(tds[nIdx]));
                            if (pIdx > -1 && tds[pIdx]) injectModalUnderCopy(tds[pIdx], getCleanText(tds[pIdx]).replace(/-\s+/g, '-'));
                            if (eIdx > -1 && tds[eIdx]) injectModalUnderCopy(tds[eIdx], getCleanText(tds[eIdx]));
                        });
                    });
                }

                // v100.8.94: 'compensation' copies the whole value line, e.g.
                // "Lender Paid = 2.5% * $196,733 = $4,918" (the label itself excluded).
                const targetLabels = ['subject property address', 'loan number', 'new vesting', 'total loan amount', 'loan amount', 'property value', 'appraised value', 'compensation'];

                Array.from(modal.querySelectorAll('td, th, dt, dd, span, div, strong, b, label')).forEach(el => {
                    if (el.children.length > 1 && el.tagName !== 'TD') return;

                    // v100.8.65: never treat a TABLE COLUMN HEADER as a label/value pair.
                    // "Loan Amount" is in targetLabels, so in the Bonus Details grid it
                    // matched the column header and put a copy button on the cell to its
                    // right - "Funded Date". Header rows are now skipped entirely.
                    if (el.tagName === 'TH' || el.tagName === 'TD') {
                        if (el.closest('thead')) return;
                        const hr = el.closest('tr');
                        if (hr && hr.cells && hr.cells.length >= 3) {
                            const cells = Array.from(hr.cells);
                            const allTh = cells.every(c => c.tagName === 'TH');
                            const noValues = cells.every(c => !/\d/.test(getCleanText(c)));
                            if (allTh || noValues) return; // looks like a column-header row
                        }
                    }

                    const text = (el.textContent || '').toLowerCase().trim();

                    if (targetLabels.some(l => text === l || text === l + ':')) {
                        let vEl = el.nextElementSibling;
                        if (!vEl) {
                            if (el.tagName === 'TD' || el.tagName === 'TH') {
                                const tr = el.closest('tr');
                                if (tr && tr.cells.length > el.cellIndex+1) vEl = tr.cells[el.cellIndex+1];
                            } else {
                                const parent = el.parentElement;
                                if (parent && parent.children.length > 1) {
                                    const index = Array.from(parent.children).indexOf(el);
                                    if (index > -1 && index + 1 < parent.children.length) vEl = parent.children[index + 1];
                                }
                            }
                        }
                        if (vEl) {
                            let cText = getCleanText(vEl);

                            // Extract just the dollar amount for financial fields.
                            // v100.8.94: 'compensation' is deliberately NOT in this list -
                            // its value is a formula and must be copied whole, otherwise
                            // it would be reduced to the first dollar figure.
                            if (text !== 'compensation' && text !== 'compensation:' &&
                                ['total loan amount', 'loan amount', 'property value', 'appraised value'].some(l => text.includes(l))) {
                                const match = cText.match(/\$[\d,]+(\.\d{2})?/);
                                if (match) cText = match[0];
                                else cText = cText.split('-')[0].trim(); // Fallback if no $ symbol
                            }

                            injectModalInlineCopy(vEl, cText);
                        }
                    }
                });
            });
        } catch (e) { console.error("[LF Optimizer] Modal copy button error:", e); }

        // 4. Agent Contact Modal
        try {
            document.querySelectorAll('.modal.show, .modal[style*="display: block"], .ui-dialog[style*="display: block"]').forEach(modal => {
                const textUpper = (modal.textContent || '').toUpperCase();
                if (textUpper.includes('LANGUAGE(S)') || textUpper.includes('REALTOR OWNER')) {
                    let titleText = '';
                    const titleEl = modal.querySelector('.modal-title, .ui-dialog-title');
                    if (titleEl) {
                        titleText = getCleanText(titleEl).toLowerCase();
                    } else {
                        const header = modal.querySelector('.modal-header');
                        if (header) titleText = getCleanText(header).toLowerCase();
                    }

                    const body = modal.querySelector('.modal-body, .ui-dialog-content') || modal;
                    Array.from(body.querySelectorAll('div, span, p, label, td, th')).forEach(el => {
                        if (el.children.length > 1 && el.tagName !== 'TD') return;
                        const t = getCleanText(el);
                        if (!t || t.length < 3) return;
                        const tLow = t.toLowerCase();

                        let isMatch = false;

                        if (tLow.includes('@') && tLow.includes('.') && !t.includes(' ')) {
                            isMatch = true;
                        } else if (/^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/.test(t)) {
                            isMatch = true;
                        } else if (titleText && tLow === titleText) {
                            isMatch = true;
                        }

                        if (isMatch) {
                            injectModalInlineCopy(el, t);
                        }
                    });
                }
            });
        } catch (e) { console.error("[LF Optimizer] Agent modal copy button error:", e); }
    }

    // ==========================================
    // LTV / DOWNPAYMENT (v100.9.29)
    // LTV used to be copied from whatever the portal put in its own "LTV" field.
    // It is now calculated, so both money rows can carry one:
    //     Total loan amount  ->  total loan amount / appraised value
    //     Loan amount        ->  loan amount       / appraised value
    // and the Total row also shows Downpayment = appraised value - total loan amount.
    // ==========================================
    function lfParseMoney(text) {
        if (!text) return NaN;
        const m = String(text).replace(/[\u200B\s]/g, '').match(/-?\$?([\d,]+(?:\.\d+)?)/);
        if (!m) return NaN;
        const n = parseFloat(m[1].replace(/,/g, ''));
        return isFinite(n) ? n : NaN;
    }

    function lfFmtMoney(n) {
        return '$' + Math.round(n).toLocaleString('en-US');
    }

    function lfFmtPct(n) {
        // 95 -> "95%", 96.6624 -> "96.66%"
        const r = Math.round(n * 100) / 100;
        return (Number.isInteger(r) ? String(r) : r.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')) + '%';
    }

    // 0% green -> 50% yellow -> 100% red, interpolated channel by channel.
    function lfLtvColor(pct) {
        const p = Math.max(0, Math.min(100, pct));
        const GREEN = [22, 163, 74], YELLOW = [234, 179, 8], RED = [220, 38, 38];
        const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
        const rgb = p <= 50 ? mix(GREEN, YELLOW, p / 50) : mix(YELLOW, RED, (p - 50) / 50);
        return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
    }

    // Finds the value cell that sits opposite a label in the summary table.
    function lfSummaryValueCell(scope, labelRx) {
        for (const el of scope.querySelectorAll('td, th, dt, dd, span, div, strong, b, label')) {
            if (el.children.length > 1) continue;
            const t = (el.textContent || '').replace(/\s+/g, ' ').toLowerCase().trim().replace(/:$/, '');
            if (!labelRx.test(t)) continue;
            let v = el.nextElementSibling;
            if (!v && el.tagName === 'TD') {
                const tr = el.closest('tr');
                if (tr && tr.cells.length > el.cellIndex + 1) v = tr.cells[el.cellIndex + 1];
            }
            if (v) return v;
        }
        return null;
    }

    function lfMakeLtvSpan(cls, pct) {
        const wrap = document.createElement('span');
        wrap.className = cls;
        wrap.appendChild(document.createTextNode(' - LTV: '));
        const num = document.createElement('span');
        num.className = 'lf-ltv-num';
        num.textContent = lfFmtPct(pct);
        num.style.fontWeight = '700';
        num.style.color = lfLtvColor(pct);
        wrap.appendChild(num);
        return wrap;
    }

    // ==========================================
    // MORTGAGE INSURANCE (v100.9.47)
    //
    // FHA figures come straight from HUD Mortgagee Letter 2023-05, as published on
    // FHA.com. Checked against the worked example in the JVM article: a $386,000 base
    // loan at 96.5% LTV over 30 years gives 55 bps, $2,123 a year, $177 a month.
    //
    // Conventional PMI is different in kind - the rate depends on credit score, LTV,
    // property type and term, and every MI company publishes its own grid. The source
    // provided only gives a range ("0.2% - 2%, varies by credit/LTV"), so the tiers
    // below are a starting point, not a quote. They live in one place on purpose:
    // change LF_PMI_TIERS and every figure follows.
    // ==========================================
    const LF_FHA_THRESHOLD = 726200;

    // annual rate in basis points
    function lfFhaMipBps(baseLoan, ltv, termYears) {
        const big = baseLoan > LF_FHA_THRESHOLD;
        if (termYears > 15) {
            if (!big) return ltv <= 90 ? 50 : (ltv <= 95 ? 50 : 55);
            return ltv <= 90 ? 70 : (ltv <= 95 ? 70 : 75);
        }
        // 15 years or less
        if (!big) return ltv <= 90 ? 15 : 40;
        return ltv <= 78 ? 15 : (ltv <= 90 ? 40 : 65);
    }

    // ---- Fannie Mae, Selling Guide B7-1-02: MI COVERAGE required on a conventional
    // loan above 80% LTV. This is the share of the loan that must be insured - it is
    // not a price. Fannie Mae does not set premiums; the MI companies do, from their
    // own rate cards. Coverage is shown so the requirement is visible and correct.
    function lfFnmaMiCoverage(ltv, termYears, isArm) {
        const shortTerm = !isArm && termYears <= 20;   // ARMs always use the longer-term column
        if (ltv <= 85) return shortTerm ? 6  : 12;
        if (ltv <= 90) return shortTerm ? 12 : 25;
        if (ltv <= 95) return shortTerm ? 25 : 30;
        return 35;                                     // 95.01 - 97%
    }

    // ---- The PREMIUM. These are the rates the dollar figure is built from, and they
    // are the one thing here that does not come from a published rule - a real quote
    // depends on the borrower's credit score and the MI company's card. Replace this
    // table with your own and every figure follows.
    const LF_PMI_TIERS = [
        { upTo: 85,       pct: 0.32 },
        { upTo: 90,       pct: 0.52 },
        { upTo: 95,       pct: 0.78 },
        { upTo: Infinity, pct: 0.98 }
    ];
    function lfConvPmiPct(ltv) {
        for (const t of LF_PMI_TIERS) if (ltv <= t.upTo) return t.pct;
        return LF_PMI_TIERS[LF_PMI_TIERS.length - 1].pct;
    }

    // Loan type / term as written in the summary
    function lfSummaryLoanType(scope) {
        const c = lfSummaryValueCell(scope, /^loan type$/);
        return c ? (c.textContent || '').replace(/\s+/g, ' ').trim() : '';
    }
    function lfSummaryLoanProgram(scope) {
        for (const rx of [/^loan program$/, /^amortization type$/, /^rate type$/, /^product$/]) {
            const c = lfSummaryValueCell(scope, rx);
            if (c) return (c.textContent || '').replace(/\s+/g, ' ').trim();
        }
        return '';
    }

    function lfSummaryTermYears(scope) {
        for (const rx of [/^loan term$/, /^term$/, /^amortization$/, /^amortization type$/]) {
            const c = lfSummaryValueCell(scope, rx);
            if (!c) continue;
            const m = (c.textContent || '').match(/(\d{1,2})\s*(?:-|\s)?\s*(?:yr|year)/i);
            if (m) return parseInt(m[1], 10);
        }
        return 30;   // 30-year is the default when the summary does not state a term
    }

    // Returns { monthly, label } or null when no MI applies.
    function lfComputeMi(scope, baseLoan, ltv) {
        if (!isFinite(baseLoan) || baseLoan <= 0 || !isFinite(ltv) || ltv <= 0) return null;
        const type = lfSummaryLoanType(scope).toLowerCase();
        const term = lfSummaryTermYears(scope);

        if (/\bfha\b/.test(type)) {
            const bps = lfFhaMipBps(baseLoan, ltv, term);
            return { monthly: baseLoan * (bps / 10000) / 12, label: (bps / 100).toFixed(2).replace(/0$/, '') + '%' };
        }
        if (/conventional/.test(type)) {
            if (ltv <= 80) return null;               // Fannie Mae requires MI only above 80% LTV
            const pct = lfConvPmiPct(ltv);
            const isArm = /\barm\b|adjustable/i.test(lfSummaryLoanProgram(scope) + ' ' + type);
            const cov = lfFnmaMiCoverage(ltv, term, isArm);
            return {
                monthly: baseLoan * (pct / 100) / 12,
                label: pct + '%',
                coverage: cov
            };
        }
        return null;                                   // VA, USDA, Non-QM, Jumbo - nothing shown
    }

    function lfApplyLtvAndDownpayment(scope) {
        const totalCell = lfSummaryValueCell(scope, /^total loan amount$/);
        const loanCell  = lfSummaryValueCell(scope, /^loan amount$/);
        const apprCell  = lfSummaryValueCell(scope, /^appraised value$/);
        const propCell  = lfSummaryValueCell(scope, /^property value$/);

        // Appraised value is the basis; property value is used only when the
        // appraised figure has not been filled in yet.
        let basis = apprCell ? lfParseMoney(apprCell.textContent) : NaN;
        if (!isFinite(basis) || basis <= 0) basis = propCell ? lfParseMoney(propCell.textContent) : NaN;
        if (!isFinite(basis) || basis <= 0) return;

        // ---- Total loan amount: LTV + Downpayment ----
        if (totalCell) {
            const total = lfParseMoney(totalCell.cloneNode(true).textContent.replace(/ - LTV:.*$/i, ''));
            if (isFinite(total) && total > 0) {
                const pct = (total / basis) * 100;
                let span = totalCell.querySelector('.lf-ltv-appended');
                if (!span) { span = lfMakeLtvSpan('lf-ltv-appended', pct); totalCell.appendChild(span); }
                else {
                    const num = span.querySelector('.lf-ltv-num');
                    if (num) { num.textContent = lfFmtPct(pct); num.style.color = lfLtvColor(pct); num.style.fontWeight = '700'; }
                }

                // v100.9.51: downpayment is the lesser of property value and appraised
                // value, minus the BASE loan amount - not the total, which already has
                // the financed premium rolled into it.
                const apprVal = apprCell ? lfParseMoney(apprCell.textContent) : NaN;
                const propVal = propCell ? lfParseMoney(propCell.textContent) : NaN;
                const vals = [apprVal, propVal].filter(v => isFinite(v) && v > 0);
                const dpBasis = vals.length ? Math.min.apply(null, vals) : basis;
                const baseLoan = loanCell
                    ? lfParseMoney(loanCell.cloneNode(true).textContent.replace(/ - LTV:.*$/i, '').replace(/MI:.*$/i, ''))
                    : NaN;
                const down = dpBasis - ((isFinite(baseLoan) && baseLoan > 0) ? baseLoan : total);
                let dp = totalCell.querySelector('.lf-dp-appended');
                if (!dp) {
                    dp = document.createElement('span');
                    dp.className = 'lf-dp-appended';
                    dp.style.cssText = 'margin-left:8px; font-weight:700; white-space:nowrap;';
                    totalCell.appendChild(dp);
                }
                const dpText = lfFmtMoney(down);
                if (dp.dataset.lfVal !== dpText) {
                    dp.dataset.lfVal = dpText;
                    dp.textContent = 'Downpayment: ' + dpText;
                    const b = document.createElement('button');
                    b.className = 'lf-icon-btn lf-dp-copy';
                    b.type = 'button';
                    b.title = 'Copy the downpayment';
                    b.innerHTML = COPY_SVG;
                    b.onclick = async (e) => {
                        e.preventDefault(); e.stopPropagation();
                        try {
                            await navigator.clipboard.writeText(dpText);
                            b.innerHTML = CHECK_SVG; b.style.color = '#16a34a';
                            showToast('Copied: ' + dpText);
                            setTimeout(() => { b.innerHTML = COPY_SVG; b.style.color = ''; }, 1000);
                        } catch (err) { showToast('Copy failed'); }
                    };
                    dp.appendChild(b);
                }
            }
        }

        // ---- Loan amount: LTV, then MI where it applies ----
        if (loanCell) {
            const amt = lfParseMoney(loanCell.cloneNode(true).textContent.replace(/ - LTV:.*$/i, '').replace(/MI:.*$/i, ''));
            if (isFinite(amt) && amt > 0) {
                const pct = (amt / basis) * 100;
                let span = loanCell.querySelector('.lf-ltv2-appended');
                if (!span) { span = lfMakeLtvSpan('lf-ltv2-appended', pct); loanCell.appendChild(span); }
                else {
                    const num = span.querySelector('.lf-ltv-num');
                    if (num) { num.textContent = lfFmtPct(pct); num.style.color = lfLtvColor(pct); num.style.fontWeight = '700'; }
                }

                // v100.9.47: FHA always carries MIP; conventional only above 80% LTV.
                const mi = lfComputeMi(scope, amt, pct);
                let miEl = loanCell.querySelector('.lf-mi-appended');
                if (!mi) {
                    if (miEl) miEl.remove();          // no MI applies - the copy button goes too
                } else {
                    if (!miEl) {
                        miEl = document.createElement('span');
                        miEl.className = 'lf-mi-appended';
                        loanCell.appendChild(miEl);
                    }
                    const miText = lfFmtMoney(mi.monthly) + '/mo';
                    if (miEl.dataset.lfVal !== miText) {
                        miEl.dataset.lfVal = miText;
                        miEl.textContent = 'MI: ' + miText;
                        miEl.title = 'Mortgage insurance at ' + mi.label + ' a year on ' + lfFmtMoney(amt)
                            + (mi.coverage ? '\nFannie Mae required coverage: ' + mi.coverage + '% (Selling Guide B7-1-02)' : '');
                        const b = document.createElement('button');
                        b.className = 'lf-icon-btn lf-mi-copy';
                        b.type = 'button';
                        b.title = 'Copy the mortgage insurance';
                        b.innerHTML = COPY_SVG;
                        b.onclick = async (e) => {
                            e.preventDefault(); e.stopPropagation();
                            try {
                                await navigator.clipboard.writeText(miText);
                                b.innerHTML = CHECK_SVG; b.style.color = '#16a34a';
                                showToast('Copied: ' + miText);
                                setTimeout(() => { b.innerHTML = COPY_SVG; b.style.color = ''; }, 1000);
                            } catch (err) { showToast('Copy failed'); }
                        };
                        miEl.appendChild(b);
                    }
                }
            }
        }
    }

    // ==========================================
    // 1003 > REAL ESTATE: COPY THE PROPERTY ADDRESS (v100.9.29)
    // Each property is a link; the "Missing: ..." notes sit outside that link, so
    // copying the link's own text gives the address on its own with nothing else.
    // Scoped to the Real Estate Owned section so no other link on the page is touched.
    // ==========================================
    function lfInjectRealEstateCopyButtons() {
        // Locate the "Real Estate Owned" section
        let section = null;
        for (const el of document.querySelectorAll('h1,h2,h3,h4,h5,div,span,td,p,strong,b,legend')) {
            if (!el.offsetParent) continue;
            if (!/^real estate owned\b/i.test(lfOwnText(el))) continue;
            // climb to a container that actually holds the property table
            let p = el;
            for (let i = 0; i < 6 && p; i++) {
                if (p.querySelector && p.querySelector('a')) { section = p; break; }
                p = p.parentElement;
            }
            if (section) break;
        }
        if (!section) return;

        section.querySelectorAll('a').forEach(link => {
            if (link.dataset.lfReCopy === '1') return;
            const addr = (link.textContent || '').replace(/\s+/g, ' ').trim();
            // an address has a number and a comma; this also rules out "Add", "Edit", etc.
            if (addr.length < 8 || !/\d/.test(addr) || !addr.includes(',')) return;
            if (/^(add|edit|remove|delete|read more)$/i.test(addr)) return;

            link.dataset.lfReCopy = '1';
            const b = document.createElement('button');
            b.className = 'lf-icon-btn lf-re-copy';
            b.type = 'button';
            b.title = 'Copy the property address';
            b.innerHTML = COPY_SVG;
            b.onclick = async (e) => {
                e.preventDefault(); e.stopPropagation();
                try {
                    await navigator.clipboard.writeText(addr);
                    b.innerHTML = CHECK_SVG; b.style.color = '#16a34a';
                    showToast('Copied: ' + addr);
                    setTimeout(() => { b.innerHTML = COPY_SVG; b.style.color = ''; }, 1000);
                } catch (err) { showToast('Copy failed'); }
            };
            // sibling of the link, never inside it
            if (link.parentNode) link.parentNode.insertBefore(b, link.nextSibling);
        });
    }

    // ==========================================
    // TO-DO LIST: DRAG & DROP UPLOAD (v100.9.36)
    //
    // Each to-do row has an "Upload" button that opens the operating system file
    // picker. This puts a small drop box under that button so a file can go straight
    // from the desktop into that exact condition.
    //
    // How the file reaches the portal: the row's own <input type="file"> is filled in
    // with a DataTransfer and given a change event, which is indistinguishable from
    // the user having picked the file by hand. When the input is not in the row, the
    // Upload button is clicked with HTMLInputElement.prototype.click borrowed for a
    // moment - that captures the input the app was about to open a dialog for and
    // swallows the dialog, so nothing flashes on screen.
    // ==========================================
    function lfTodoFindRowFileInput(scope) {
        return scope.querySelector('input[type="file"]');
    }

    // Press the Upload button but keep the OS dialog from appearing, and hand back
    // whichever file input the app tried to open.
    function lfTodoCaptureFileInput(triggerBtn) {
        const proto = HTMLInputElement.prototype;
        const orig = proto.click;
        let captured = null;
        proto.click = function () {
            if (this.type === 'file') { captured = this; return; }
            return orig.apply(this, arguments);
        };
        try { triggerBtn.click(); } catch (e) {}
        proto.click = orig;
        return captured;
    }

    async function lfTodoDeliverFiles(box, files) {
        if (!files || !files.length) return;
        const cell = box.closest('td') || box.parentElement;
        const row  = box.closest('tr') || cell;

        let input = lfTodoFindRowFileInput(cell) || lfTodoFindRowFileInput(row);
        if (!input) {
            const btn = (box.dataset.lfBtnIdx && row)
                ? row.querySelectorAll('button, a, .btn')[+box.dataset.lfBtnIdx]
                : null;
            const trigger = btn || Array.from(row.querySelectorAll('button, a, .btn'))
                .find(b => /^upload$/i.test((b.textContent || '').trim()));
            if (trigger) input = lfTodoCaptureFileInput(trigger);
        }

        if (!input) {
            showToast('Could not find the upload field for this row');
            box.classList.remove('lf-drop-busy');
            return;
        }

        try {
            const dt = new DataTransfer();
            for (const f of files) dt.items.add(f);
            if (!input.multiple && dt.files.length > 1) {
                showToast('This condition takes one file at a time \u2013 sending the first');
            }
            input.files = dt.files;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            box.classList.add('lf-drop-ok');
            const okText = files.length > 1
                ? files.length + ' files sent'
                : (files[0].name.length > 18 ? files[0].name.slice(0, 16) + '\u2026' : files[0].name);
            box.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>'
                          + '<span class="lf-drop-text">' + okText + '</span>';
            box.title = files.length > 1 ? files.length + ' files sent' : files[0].name;
            showToast('Uploading ' + (files.length > 1 ? files.length + ' files' : files[0].name));
            setTimeout(() => {
                box.classList.remove('lf-drop-ok');
                box.innerHTML = lfDropBoxContent(LF_DROP_LABEL);
            }, 2600);
        } catch (e) {
            showToast('Upload failed \u2013 use the Upload button instead');
            console.error('[LF Optimizer] drop upload failed:', e);
        }
        box.classList.remove('lf-drop-busy');
    }

    const LF_DROP_LABEL = 'Drop file(s)';
    const LF_DROP_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>';
    function lfDropBoxContent(text) { return LF_DROP_ICON + '<span class="lf-drop-text">' + text + '</span>'; }

    // v100.9.68: RESTORED. This definition was deleted along with the old sizer in
    // v100.9.53 while its two call sites stayed. Calling it threw immediately, the
    // try/catch around the injector swallowed the error, and the drop box silently
    // stopped being created - with nothing in the console to show for it.
    //
    // Some rows carry a Bypass button under Upload, so the box has to sit below
    // whichever control comes last or it lands between the two.
    function lfTodoLastControl(cell) {
        const ctrls = Array.from(cell.querySelectorAll('button, a, .btn'))
            .filter(el => !el.classList.contains('lf-drop-box') && !el.closest('.lf-drop-box'));
        return ctrls.length ? ctrls[ctrls.length - 1] : null;
    }

    function lfInjectTodoDropZones() {
        // v100.9.67: the column is found from the Upload buttons themselves rather than
        // from a header. The old version required the heading to sit inside a <thead>;
        // the compliance and to-do tables do not use one, so it matched nothing and no
        // box was ever created. Working from the buttons is structure-independent.
        const triggers = Array.from(document.querySelectorAll('button, a, .btn'))
            .filter(b => /^upload$/i.test((b.textContent || '').replace(/\s+/g, ' ').trim()));

        triggers.forEach(trigger => {
            const cell = trigger.closest('td');
            if (!cell) return;                                   // only inside a table row
            // v100.9.69: check for the box itself instead of a "done" flag on the cell.
            // The flag survived the portal re-rendering the cell's contents, so any row
            // that was redrawn lost its box and never got another one - which is why
            // some rows had one and some did not.
            if (cell.querySelector('.lf-drop-box')) return;
            const row = cell.closest('tr');
            if (!row) return;
            const btns = Array.from(row.querySelectorAll('button, a, .btn'));
            {
                cell.classList.add('lf-drop-cell');
                const box = document.createElement('div');
                box.className = 'lf-drop-box';
                box.textContent = LF_DROP_LABEL;
                box.title = 'Drag a file from your computer straight into this condition';
                box.dataset.lfBtnIdx = String(btns.indexOf(trigger));

                ['dragenter', 'dragover'].forEach(ev => box.addEventListener(ev, (e) => {
                    e.preventDefault(); e.stopPropagation();
                    e.dataTransfer.dropEffect = 'copy';
                    box.classList.add('lf-drop-over');
                }));
                ['dragleave', 'dragend'].forEach(ev => box.addEventListener(ev, (e) => {
                    e.preventDefault(); e.stopPropagation();
                    box.classList.remove('lf-drop-over');
                }));
                box.addEventListener('drop', (e) => {
                    e.preventDefault(); e.stopPropagation();
                    box.classList.remove('lf-drop-over');
                    box.classList.add('lf-drop-busy');
                    const files = e.dataTransfer && e.dataTransfer.files;
                    lfTodoDeliverFiles(box, files);
                });

                // v100.9.53: dropping anywhere in the Upload cell counts - the box is
                // the label, the cell is the target.
                if (cell.dataset.lfCellDrop !== '1') {
                    cell.dataset.lfCellDrop = '1';
                    ['dragenter', 'dragover'].forEach(ev => cell.addEventListener(ev, (e) => {
                        if (!e.dataTransfer || !Array.from(e.dataTransfer.types || []).includes('Files')) return;
                        e.preventDefault(); e.stopPropagation();
                        e.dataTransfer.dropEffect = 'copy';
                        cell.classList.add('lf-drop-over-cell');
                        const b = cell.querySelector('.lf-drop-box');
                        if (b) b.classList.add('lf-drop-over');
                    }));
                    ['dragleave', 'dragend'].forEach(ev => cell.addEventListener(ev, (e) => {
                        if (cell.contains(e.relatedTarget)) return;
                        cell.classList.remove('lf-drop-over-cell');
                        const b = cell.querySelector('.lf-drop-box');
                        if (b) b.classList.remove('lf-drop-over');
                    }));
                    cell.addEventListener('drop', (e) => {
                        const files = e.dataTransfer && e.dataTransfer.files;
                        if (!files || !files.length) return;
                        e.preventDefault(); e.stopPropagation();
                        cell.classList.remove('lf-drop-over-cell');
                        const b = cell.querySelector('.lf-drop-box');
                        if (!b) return;
                        b.classList.remove('lf-drop-over');
                        b.classList.add('lf-drop-busy');
                        lfTodoDeliverFiles(b, files);
                    });
                }
                // clicking it behaves like the Upload button, for convenience
                box.addEventListener('click', (e) => {
                    e.preventDefault(); e.stopPropagation();
                    try { trigger.click(); } catch (err) {}
                });

                const last = lfTodoLastControl(cell) || trigger;
                last.parentNode.insertBefore(box, last.nextSibling);
            }
        });
    }

    // ==========================================
    // GLOBAL SEARCH: KEYBOARD PICK (v100.9.42)
    //
    // The search is opened with a hotkey, so finishing it with the mouse defeats the
    // point. The LOAN / LEAD / APPLICATION badge in each result is what opens the
    // record, so one of them is always marked with a moving RGB glow: arrow keys move
    // the mark, Enter presses it.
    //
    // Enter and the arrows are only taken while the search panel is open and has
    // results - typing in the box is otherwise untouched.
    // ==========================================
    // v100.9.43: @property is what lets the gradient's angle animate. Chrome, Edge and
    // recent Firefox have it; where it is missing the ring would sit still, so the
    // angle is driven from a rAF loop instead - and only while something is marked.
    (function lfGsAngleSupport() {
        let supported = false;
        try {
            if (window.CSS && CSS.registerProperty) {
                CSS.registerProperty({ name: '--lf-gs-angle', syntax: '<angle>', initialValue: '0deg', inherits: false });
                supported = true;
            }
        } catch (e) { supported = true; }   // already registered by the stylesheet
        if (supported) return;

        let raf = null;
        const tick = () => {
            const el = document.querySelector('.lf-gs-active');
            if (!el) { raf = null; return; }
            const deg = (Date.now() / 5) % 360;
            el.style.setProperty('--lf-gs-angle', deg + 'deg');
            raf = requestAnimationFrame(tick);
        };
        setInterval(() => {
            if (!raf && document.querySelector('.lf-gs-active')) raf = requestAnimationFrame(tick);
        }, 400);
    })();

    const LF_GS_RX = /^(loan|lead|application)$/i;
    let lfGsIndex = 0;

    function lfGsPanel() {
        for (const el of document.querySelectorAll('h1,h2,h3,h4,h5,div,span,td,p,strong,b')) {
            if (!el.offsetParent) continue;
            if (!/^loans?\s+search$/i.test(lfOwnText(el))) continue;
            return el.closest('.modal, .ui-dialog, [role="dialog"]') || el.parentElement;
        }
        return null;
    }

    // The innermost element carrying the badge text - never a wrapper around it.
    function lfGsBadges(panel) {
        const all = Array.from(panel.querySelectorAll('a, button, span, div, td, strong, b'))
            .filter(el => el.offsetParent !== null && LF_GS_RX.test(lfOwnText(el)));
        return all.filter(el => !all.some(o => o !== el && el.contains(o)));
    }

    // scrollIntoView is disabled globally by this script, so walk up to whatever is
    // actually scrollable and move it by hand.
    function lfGsReveal(el) {
        let sc = el.parentElement;
        while (sc && sc !== document.body) {
            const canScroll = sc.scrollHeight > sc.clientHeight + 4 &&
                              /(auto|scroll)/.test(getComputedStyle(sc).overflowY);
            if (canScroll) break;
            sc = sc.parentElement;
        }
        const r = el.getBoundingClientRect();
        if (sc && sc !== document.body) {
            const sr = sc.getBoundingClientRect();
            if (r.top < sr.top + 8) sc.scrollTop -= (sr.top + 8 - r.top);
            else if (r.bottom > sr.bottom - 8) sc.scrollTop += (r.bottom - sr.bottom + 8);
        } else {
            if (r.top < 70) window.scrollBy(0, r.top - 80);
            else if (r.bottom > window.innerHeight - 20) window.scrollBy(0, r.bottom - window.innerHeight + 30);
        }
    }

    function lfGsPaint(badges, idx) {
        badges.forEach((b, i) => b.classList.toggle('lf-gs-active', i === idx));
        if (badges[idx]) lfGsReveal(badges[idx]);
    }

    // Keeps the glow on the first result as soon as results appear, and keeps it
    // pointing at something real when the result list changes under it.
    function lfGsSync() {
        const panel = lfGsPanel();
        if (!panel) {
            document.querySelectorAll('.lf-gs-active').forEach(e => e.classList.remove('lf-gs-active'));
            lfGsIndex = 0;
            return;
        }
        const badges = lfGsBadges(panel);
        if (!badges.length) { lfGsIndex = 0; return; }
        if (lfGsIndex >= badges.length) lfGsIndex = 0;
        if (!badges.some(b => b.classList.contains('lf-gs-active'))) lfGsPaint(badges, lfGsIndex);
    }

    function lfGsKeyHandler(e) {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (!['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(e.key)) return;

        const panel = lfGsPanel();
        if (!panel) return;

        // v100.9.49: Esc closes the results, using the panel's own close control so the
        // app tears the dialog down the way it expects. Left alone when one of this
        // script's own dialogs is on top - that one owns the key while it is open.
        if (e.key === 'Escape') {
            if (document.getElementById('lf-confirm-dialog') || document.querySelector('.tera-confirm')) return;
            const closeEl = lfFindCloseControl(panel);
            if (!closeEl) return;
            e.preventDefault(); e.stopPropagation();
            document.querySelectorAll('.lf-gs-active').forEach(el => el.classList.remove('lf-gs-active'));
            lfGsIndex = 0;
            try { closeEl.click(); } catch (err) {}
            return;
        }

        const badges = lfGsBadges(panel);
        if (!badges.length) return;

        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault(); e.stopPropagation();
            lfGsIndex = (lfGsIndex + (e.key === 'ArrowDown' ? 1 : -1) + badges.length) % badges.length;
            lfGsPaint(badges, lfGsIndex);
            return;
        }

        // Enter - open whichever badge is marked
        const target = badges[lfGsIndex] || badges[0];
        if (!target) return;
        e.preventDefault(); e.stopPropagation();
        const clickable = target.closest('a, button, [role="button"]') || target;
        try { clickable.click(); } catch (err) {}
        document.querySelectorAll('.lf-gs-active').forEach(el => el.classList.remove('lf-gs-active'));
        lfGsIndex = 0;
    }

    // ==========================================
    // TO-DO EMAIL TEMPLATES (v100.9.52)
    //
    // The Send To-do List page pre-fills a body that has to be rewritten by hand every
    // time. These templates hold the wording once; the placeholders in {braces} are
    // filled from the page itself when the template is applied.
    //
    // Only the body is touched - from the "Dear ..." line down to "Sincerely,". The
    // Loan Factory logo above it and the signature, reply-all notice and security
    // notice below it are left exactly as the portal built them.
    // ==========================================
    const LF_ET = {
        borrower: {
            key: 'lf_email_tpl_borrower',
            onKey: 'lf_email_tpl_borrower_on',
            titleKey: 'lf_email_tpl_borrower_title',
            defTitle: "{borrower's name} - Loan# {Loan#} - {Property address} - Loan conditions that need your help.",
            label: 'Customized borrower to-do email',
            hint: 'Used when the template is condition_document and the email is addressed to the borrower.',
            def: [
                'Dear {borrower(s)},',
                'Below is the list of documents required from you. In order to meet your close date and/or lock expiration date, please send all documents back to us at your earliest convenience.',
                '',
                '{list of to-do list item(s)}',
                '',
                "Please [log in](https://www.loanfactory.com/login) to your account to upload documents, using the email association with your application {Borrower 1's email address}",
                'If replying to this email, be sure to reply-all.',
                'Feel free to contact us with any questions or concerns.',
                "Loan Officer: {Loan officer's name} - {Loan officer's email address}",
                "Loan Processor: {Loan processor's name} - {Loan processor's email address}",
                'Thank you.',
                '',
                'Sincerely,'
            ].join('\n')
        },
        escrow: {
            key: 'lf_email_tpl_escrow',
            onKey: 'lf_email_tpl_escrow_on',
            titleKey: 'lf_email_tpl_escrow_title',
            defTitle: "{borrower's name} - Loan# {Loan#} - {Property address} - Loan conditions that need your help.",
            label: 'Customized escrow to-do email',
            hint: 'Used when the template is condition_document and the email opens with "Dear Escrow".',
            def: [
                'Dear Escrow,',
                'We would like to order some items for the below loan:',
                '',
                '\tMain borrower: {main borrower}',
                '\tPhone number: {main borrower phone}',
                '\tDOB: {main borrower DOB}',
                '\tEmail address: {main borrower email}',
                '\t{co-borrowers}',
                '\tSubject property: {Property address}',
                '\tLoan number: {Loan#}',
                '\tLoan amount: {loan amount}',
                '\tOccupancy: {occupancy}',
                '\tProperty type: {property type}',
                "\tLoan Officer: {Loan officer's name} - {Loan officer's email address}",
                "\tLoan Processor: {Loan processor's name} - {Loan processor's email address}",
                '\tMortgage Clause: {mortgage clause}',
                '',
                '{list of to-do list item(s)}',
                '',
                'Sincerely,'
            ].join('\n')
        }
    };

    // v100.9.55: templates are stored as HTML so formatting survives, and so that
    // saving no longer round-trips through innerText - that round trip turned every
    // block into an extra blank line, and the template grew every time it was saved.
    function lfEtHtml(which) {
        const v = localStorage.getItem(LF_ET[which].key);
        if (v === null || v === '') return lfEtToHtml(LF_ET[which].def, false);
        return /<[a-z][\s\S]*>/i.test(v) ? v : lfEtToHtml(v, false);   // plain text from an older version
    }
    function lfEtOn(which) { return localStorage.getItem(LF_ET[which].onKey) === 'true'; }
    function lfEtTitle(which) {
        const v = localStorage.getItem(LF_ET[which].titleKey);
        return (v === null || v === '') ? LF_ET[which].defTitle : v;
    }

    const lfEtEscape = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // {placeholders} in bold, [text](url) as a link, blank lines kept
    // v100.9.61: a line that starts with a tab is indented, which is how the portal's
    // own email lays out the loan details under the opening sentence.
    function lfEtToHtml(text, bold) {
        return String(text).split('\n').map(line => {
            if (!line.trim()) return '<div><br></div>';
            const indented = /^\t/.test(line);
            line = line.replace(/^\t+/, '');
            let h = lfEtEscape(line);
            h = h.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
                '<a href="$2" target="_blank" rel="noopener">$1</a>');
            if (bold) h = h.replace(/\{([^}]+)\}/g, '<b class="lf-et-ph">{</b>$1<b class="lf-et-ph">}</b>');
            return indented ? '<div style="margin-left: 40px;">' + h + '</div>'
                            : '<div>' + h + '</div>';
        }).join('');
    }

    // ---------- reading the page so the placeholders can be filled ----------
    // Reads the To field. Falls back to the address the body already quotes, then to
    // any non-company address on the form - the borrower is never @loanfactory.com.
    function lfEtBorrowerEmail(bodyText) {
        const EMAIL = /[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi;
        const pick = (list) => {
            if (!list) return '';
            const outside = list.filter(e => !/@loanfactory\.com$/i.test(e));
            return (outside[0] || '').trim();
        };

        // the row whose label is exactly "To"
        const labels = Array.from(document.querySelectorAll('label, th, td, div, span'))
            .filter(el => el.offsetParent !== null && /^to$/i.test((el.textContent || '').trim()));
        for (const l of labels) {
            const row = l.closest('.form-group, .row, tr, li') || l.parentElement;
            if (!row) continue;
            const found = (row.innerText || '').match(EMAIL);
            const hit = pick(found);
            if (hit) return hit;
        }

        // the body may already quote it: "...your application 'someone@example.com'"
        const quoted = (bodyText || '').match(/application\s*['"‘“]?\s*([\w.+-]+@[\w.-]+\.[a-z]{2,})/i);
        if (quoted) return quoted[1];

        // last resort - any outside address on the form
        const all = (document.body.innerText || '').match(EMAIL);
        return pick(all);
    }

    // v100.9.60: the escrow email states the loan in full - borrower, every
    // co-borrower, property, amounts and the mortgage clause. These are read line by
    // line from the body the portal generated, because the number of co-borrowers
    // varies from loan to loan and cannot be a fixed set of placeholders.
    function lfEtParseLoanBlock(bodyText) {
        const out = { coBorrowers: [] };
        const lines = String(bodyText || '').split('\n').map(l => l.replace(/\s+/g, ' ').trim());
        const val = (l) => l.slice(l.indexOf(':') + 1).trim();

        let cur = null;
        for (const l of lines) {
            if (/^main borrower\s*:/i.test(l))      { cur = out; out.borrower = val(l); continue; }
            if (/^co-?borrower\s*:/i.test(l))       { cur = { name: val(l) }; out.coBorrowers.push(cur); continue; }
            if (/^phone number\s*:/i.test(l))       { if (cur) cur.phone = val(l); continue; }
            if (/^dob\s*:/i.test(l))                { if (cur) cur.dob = val(l); continue; }
            if (/^email address\s*:/i.test(l))      { if (cur) cur.email = val(l); continue; }
            if (/^subject property\s*:/i.test(l))   { out.property = val(l); cur = null; continue; }
            if (/^loan number\s*:/i.test(l))        { out.loanNumber = val(l); continue; }
            if (/^loan amount\s*:/i.test(l))        { out.loanAmount = val(l); continue; }
            if (/^occupancy\s*:/i.test(l))          { out.occupancy = val(l); continue; }
            if (/^property type\s*:/i.test(l))      { out.propertyType = val(l); continue; }
            if (/^mortgage clause\s*:/i.test(l))    { out.mortgageClause = val(l); continue; }
        }

        // the clause often wraps onto the next line
        if (out.mortgageClause) {
            const i = lines.findIndex(l => /^mortgage clause\s*:/i.test(l));
            for (let j = i + 1; j < lines.length; j++) {
                const nx = lines[j];
                if (!nx || /^(document|please click|sincerely)/i.test(nx) || /:/.test(nx.split(' ')[0] || '')) break;
                if (/^[A-Z0-9]/.test(nx) && nx.length < 200) out.mortgageClause += ' ' + nx; else break;
            }
        }
        return out;
    }

    function lfEtPageFacts(editor) {
        const facts = {};
        const titleInput = Array.from(document.querySelectorAll('input')).find(i =>
            /loan conditions|loan#/i.test(i.value || ''));
        const title = titleInput ? titleInput.value : '';

        // "Bryan Pastor - Loan# 3000371793 - 44852 CORTE RODRIGUEZ, TEMECULA, CA 92592 - ..."
        const parts = title.split(' - ');
        if (parts.length) facts.borrower = parts[0].trim();
        const loanM = title.match(/loan#\s*([0-9]+)/i);
        if (loanM) facts.loanNumber = loanM[1];
        if (parts.length >= 3) facts.property = parts[2].trim();

        const body = editor ? (editor.innerText || '') : '';
        const lo = body.match(/Loan Officer:\s*([^\n-]+?)\s*-\s*([\w.+-]+@[\w.-]+)/i);
        if (lo) { facts.loName = lo[1].trim(); facts.loEmail = lo[2].trim(); }
        const lp = body.match(/Loan Processor:\s*([^\n-]+?)\s*-\s*([\w.+-]+@[\w.-]+)/i);
        if (lp) { facts.lpName = lp[1].trim(); facts.lpEmail = lp[2].trim(); }
        if (!facts.property) {
            const sp = body.match(/Subject property:\s*([^\n]+)/i);
            if (sp) facts.property = sp[1].trim();
        }
        if (!facts.loanNumber) {
            const ln = body.match(/Loan number:\s*([0-9]+)/i);
            if (ln) facts.loanNumber = ln[1];
        }

        // v100.9.56: the borrower's address is read from the To field itself. The old
        // version grabbed the first chip-looking element on the page, which on this
        // form is not the recipient - so the placeholder was left unfilled.
        facts.borrowerEmail = lfEtBorrowerEmail(body);

        // v100.9.60: everything the escrow email needs
        const blk = lfEtParseLoanBlock(body);
        facts.mainBorrower  = blk.borrower || facts.borrower || '';
        facts.mainPhone     = blk.phone || '';
        facts.mainDob       = blk.dob || '';
        facts.mainEmail     = blk.email || facts.borrowerEmail || '';
        facts.coBorrowers   = blk.coBorrowers || [];
        facts.loanAmount    = blk.loanAmount || '';
        facts.occupancy     = blk.occupancy || '';
        facts.propertyType  = blk.propertyType || '';
        facts.mortgageClause = blk.mortgageClause || '';
        if (!facts.property && blk.property) facts.property = blk.property;
        if (!facts.loanNumber && blk.loanNumber) facts.loanNumber = blk.loanNumber;
        return facts;
    }

    // v100.9.59: the to-do items are not always an <ol>/<ul>. The escrow email puts
    // them in a table (Document / Upload), which is why its list came out blank while
    // the borrower one worked. The search is also limited to the body between "Dear"
    // and "Sincerely," so the signature block's own table is never mistaken for it.
    function lfEtExistingList(editor, marks) {
        if (!editor) return '';

        let scope = [];
        if (marks && marks.kids) {
            for (let i = marks.sIdx; i <= marks.eIdx; i++) if (marks.kids[i]) scope.push(marks.kids[i]);
        } else {
            scope = [editor];
        }

        const findIn = (sel, test) => {
            for (const el of scope) {
                const cands = [];
                if (el.matches && el.matches(sel)) cands.push(el);
                if (el.querySelectorAll) cands.push(...el.querySelectorAll(sel));
                for (const c of cands) {
                    if (test && !test(c)) continue;
                    return c;
                }
            }
            return null;
        };

        // a real list first
        const list = findIn('ol, ul');
        if (list) return list.outerHTML;

        // then a table that actually holds to-do items - the signature table has none
        const table = findIn('table', (t) => {
            const txt = (t.textContent || '').toLowerCase();
            if (/nmls|loan processor\s*$|www\.loanfactory/.test(txt)) return false;   // signature
            return /document|upload|condition|item/.test(txt) || t.querySelectorAll('tr').length > 1;
        });
        if (table) return table.outerHTML;

        return '';
    }

    function lfEtFillMap(facts) {
        return {
            '{borrower(s)}': facts.borrower || '',
            "{Borrower 1's email address}": facts.borrowerEmail || '',
            "{Loan officer's name}": facts.loName || '',
            "{Loan officer's email address}": facts.loEmail || '',
            "{Loan processor's name}": facts.lpName || '',
            "{Loan processor's email address}": facts.lpEmail || '',
            '{subject property address}': facts.property || '',
            '{Property address}': facts.property || '',
            '{loan number}': facts.loanNumber || '',
            '{Loan#}': facts.loanNumber || '',
            "{borrower's name}": facts.borrower || '',
            '{main borrower}': facts.mainBorrower || '',
            '{main borrower phone}': facts.mainPhone || '',
            '{main borrower DOB}': facts.mainDob || '',
            '{main borrower email}': facts.mainEmail || '',
            '{loan amount}': facts.loanAmount || '',
            '{occupancy}': facts.occupancy || '',
            '{property type}': facts.propertyType || '',
            '{mortgage clause}': facts.mortgageClause || ''
        };
    }

    // Walks text nodes so bold, colour and size set in the editor are preserved.
    function lfEtSubstitute(root, facts, listHtml) {
        const map = lfEtFillMap(facts);
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
        const texts = [];
        while (walker.nextNode()) texts.push(walker.currentNode);
        texts.forEach(node => {
            let v = node.nodeValue;
            if (v.indexOf('{') < 0) return;
            Object.keys(map).forEach(k => { if (map[k]) v = v.split(k).join(map[k]); });
            if (v !== node.nodeValue) node.nodeValue = v;
        });

        // v100.9.60: {co-borrowers} becomes one block per co-borrower, or disappears
        // when the loan has none.
        const coEl = Array.from(root.querySelectorAll('*'))
            .find(el => (el.textContent || '').replace(/\s+/g, ' ').trim() === '{co-borrowers}');
        if (coEl) {
            const target = coEl.closest('div, p') || coEl;
            const list = facts.coBorrowers || [];
            if (list.length) {
                // whatever indent the {co-borrowers} line carries is passed on to each
                // block, so the expansion lines up with the rest of the details
                const indent = (target.getAttribute && target.getAttribute('style')) || '';
                const frag = document.createDocumentFragment();
                list.forEach(c => {
                    [['Co-borrower', c.name], ['Phone number', c.phone], ['DOB', c.dob], ['Email address', c.email]]
                        .forEach(([k, v]) => {
                            if (!v) return;
                            const d = document.createElement('div');
                            if (indent) d.setAttribute('style', indent);
                            d.textContent = k + ': ' + v;
                            frag.appendChild(d);
                        });
                });
                target.replaceWith(frag);
            } else {
                target.remove();
            }
        }

        // the to-do list placeholder keeps the portal's own markup
        const all = Array.from(root.querySelectorAll('*'));
        const holderEl = all.find(el => (el.textContent || '').replace(/\s+/g, ' ').trim() === '{list of to-do list item(s)}');
        if (holderEl) {
            const target = holderEl.closest('div, p') || holderEl;
            if (listHtml) {
                const tmp = document.createElement('div');
                tmp.innerHTML = listHtml;
                const listNode = tmp.firstElementChild;
                if (listNode) target.replaceWith(listNode);
            } else {
                target.remove();   // nothing to put there - do not leave the raw placeholder
            }
        }
        return root;
    }

    // ---------- applying it ----------
    function lfEtEditor() {
        return Array.from(document.querySelectorAll('[contenteditable="true"], .note-editable'))
            .find(e => e.offsetParent !== null && /dear\s/i.test(e.innerText || '')) || null;
    }

    // v100.9.54: the markers are found at ANY depth, not just among the editor's
    // direct children. The portal wraps the body in nested blocks, which is why the
    // first version reported "could not find the body" and did nothing.
    function lfEtFindMarkers(editor) {
        const blocks = Array.from(editor.querySelectorAll('div, p, span, td, h1, h2, h3, li'));
        let startNode = null, endNode = null;
        for (const b of blocks) {
            const t = (b.textContent || '').replace(/\s+/g, ' ').trim();
            if (!t) continue;
            if (!startNode && /^dear\b/i.test(t) && t.length < 160) startNode = b;
            if (/^sincerely[,.]?$/i.test(t)) endNode = b;      // last one wins
        }
        if (!startNode || !endNode) return null;

        // deepest node that still holds the whole marker text
        const deepest = (node, rx) => {
            let cur = node;
            for (;;) {
                const child = Array.from(cur.children).find(c => rx.test((c.textContent || '').replace(/\s+/g, ' ').trim()));
                if (!child) return cur;
                cur = child;
            }
        };
        startNode = deepest(startNode, /^dear\b/i);
        endNode = deepest(endNode, /^sincerely[,.]?$/i);

        // the level both markers live on
        let ca = startNode;
        while (ca && !ca.contains(endNode)) ca = ca.parentElement;
        if (!ca) return null;
        if (ca === startNode) ca = startNode.parentElement;    // start wraps end - go up one
        if (!ca) return null;

        const kids = Array.from(ca.children);
        const sIdx = kids.findIndex(k => k === startNode || k.contains(startNode));
        const eIdx = kids.findIndex(k => k === endNode || k.contains(endNode));
        if (sIdx < 0 || eIdx < 0 || eIdx < sIdx) return null;
        return { container: ca, kids, sIdx, eIdx };
    }

    function lfEtApply(which, silent) {
        const editor = lfEtEditor();
        if (!editor) { if (!silent) showToast('Open the email first'); return false; }

        const marks = lfEtFindMarkers(editor);
        if (!marks) {
            if (!silent) showToast('Could not read this email body \u2013 nothing was changed');
            return false;
        }

        const facts = lfEtPageFacts(editor);
        const listHtml = lfEtExistingList(editor, marks);

        const holder = document.createElement('div');
        holder.innerHTML = lfEtHtml(which);
        lfEtSubstitute(holder, facts, listHtml);
        const fresh = Array.from(holder.childNodes);

        const { container, kids, sIdx, eIdx } = marks;
        const after = kids[eIdx + 1] || null;                  // what follows "Sincerely,"
        for (let i = eIdx; i >= sIdx; i--) kids[i].remove();
        fresh.forEach(n => container.insertBefore(n, after));

        // v100.9.57: the subject line follows the same template. Done after the facts
        // were read, because the existing title is where the loan number comes from.
        try {
            const tplTitle = lfEtTitle(which);
            if (tplTitle) {
                const map = lfEtFillMap(facts);
                let t = tplTitle;
                Object.keys(map).forEach(k => { if (map[k]) t = t.split(k).join(map[k]); });
                const tInput = Array.from(document.querySelectorAll('input')).find(i =>
                    /loan conditions|loan#/i.test(i.value || ''));
                if (tInput && t.trim()) {
                    tInput.value = t;
                    tInput.dispatchEvent(new Event('input', { bubbles: true }));
                    tInput.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
        } catch (e) {}

        editor.dispatchEvent(new Event('input', { bubbles: true }));
        if (!silent) {
            showToast('Applied customized ' + (which === 'escrow' ? 'escrow' : 'borrower') + ' to-do template');
        }
        return true;
    }

    // ---------- applied automatically on the Send To-do List page ----------
    function lfEtTemplateName() {
        const inp = Array.from(document.querySelectorAll('input')).find(i =>
            (i.value || '').trim() === 'condition_document');
        return inp ? 'condition_document' : '';
    }

    function lfEtGuessKind(editor) {
        const t = editor ? (editor.innerText || '') : '';
        return /dear\s+escrow/i.test(t) ? 'escrow' : 'borrower';
    }

    // v100.9.54: no button. When the template is condition_document and the matching
    // switch is on, the body is rewritten once and a toast says so.
    function lfEtInjectButton() {
        if (lfEtTemplateName() !== 'condition_document') return;
        const editor = lfEtEditor();
        if (!editor || editor.dataset.lfEtDone === '1') return;

        const kind = lfEtGuessKind(editor);
        if (!lfEtOn(kind)) return;
        if (!lfEtFindMarkers(editor)) return;                  // body not rendered yet - wait

        editor.dataset.lfEtDone = '1';
        if (lfEtApply(kind, true)) {
            showToast('Applied customized ' + (kind === 'escrow' ? 'escrow' : 'borrower') + ' to-do template');
        }
    }

    // ---------- the editor dialog ----------
    function lfEtRgbToHex(v) {
        if (!v) return '';
        if (/^#[0-9a-f]{6}$/i.test(v)) return v;
        const m = String(v).match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
        if (!m) return '';
        return '#' + [1, 2, 3].map(i => (+m[i]).toString(16).padStart(2, '0')).join('');
    }

    function lfEtOpenEditor(which) {
        document.querySelectorAll('.lf-et-modal').forEach(m => m.remove());
        const cfg = LF_ET[which];

        // v100.9.55: a real editor. The buttons drive document.execCommand on the
        // editable area, the same mechanism the portal's own editor uses, so what is
        // saved is the HTML that will be dropped into the email.
        // v100.9.58: laid out like the portal's own note editor - same groups, same
        // order, and the same colour picker, so there is nothing new to learn.
        const SIZES = ['8', '9', '10', '11', '12', '14', '16', '18', '24', '30', '36', '48', '60', '72', '96'];
        const TOOLS = [
            { cmd: 'bold',          html: '<b>B</b>',   title: 'Bold' },
            { cmd: 'italic',        html: '<i>I</i>',   title: 'Italic' },
            { cmd: 'underline',     html: '<u>U</u>',   title: 'Underline' },
            { cmd: 'strikeThrough', html: '<s>S</s>',   title: 'Strikethrough' },
            { sep: true },
            { size: true },
            { fore: true },
            { back: true },
            { cmd: 'removeFormat',  html: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 20H7L3 16a2 2 0 0 1 0-3l7-7a2 2 0 0 1 3 0l6 6a2 2 0 0 1 0 3l-5 5"></path><line x1="18" y1="12" x2="9" y2="3"></line></svg>', title: 'Remove formatting' },
            { sep: true },
            { cmd: 'insertUnorderedList', html: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><circle cx="3.5" cy="6" r="1.2" fill="currentColor"></circle><circle cx="3.5" cy="12" r="1.2" fill="currentColor"></circle><circle cx="3.5" cy="18" r="1.2" fill="currentColor"></circle></svg>', title: 'Unordered list' },
            { cmd: 'insertOrderedList',   html: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="9" y1="6" x2="21" y2="6"></line><line x1="9" y1="12" x2="21" y2="12"></line><line x1="9" y1="18" x2="21" y2="18"></line><text x="1" y="8" font-size="7" fill="currentColor" stroke="none">1</text><text x="1" y="14.5" font-size="7" fill="currentColor" stroke="none">2</text><text x="1" y="21" font-size="7" fill="currentColor" stroke="none">3</text></svg>', title: 'Ordered list' },
            { cmd: 'outdent', html: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="10" y1="6" x2="21" y2="6"></line><line x1="10" y1="12" x2="21" y2="12"></line><line x1="10" y1="18" x2="21" y2="18"></line><polyline points="7 8 3 12 7 16"></polyline></svg>', title: 'Decrease indent' },
            { cmd: 'indent',  html: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="10" y1="6" x2="21" y2="6"></line><line x1="10" y1="12" x2="21" y2="12"></line><line x1="10" y1="18" x2="21" y2="18"></line><polyline points="3 8 7 12 3 16"></polyline></svg>', title: 'Increase indent' },
            { sep: true },
            { cmd: 'createLink',    html: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.5 1.5"></path><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7L12 19"></path></svg>', title: 'Insert link' },
            { sep: true },
            { cmd: 'undo',          html: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="9 14 4 9 9 4"></polyline><path d="M20 20v-7a4 4 0 0 0-4-4H4"></path></svg>', title: 'Undo' },
            { cmd: 'redo',          html: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="15 14 20 9 15 4"></polyline><path d="M4 20v-7a4 4 0 0 1 4-4h12"></path></svg>', title: 'Redo' }
        ];

        const toolHtml = TOOLS.map(t => {
            if (t.sep)  return '<span class="lf-et-sep"></span>';
            if (t.size) return '<select class="lf-et-size" title="Font size">' +
                               '<option value="">\u2014</option>' +
                               SIZES.map(v => '<option value="' + v + '">' + v + '</option>').join('') +
                               '</select>';
            if (t.fore) return '<button type="button" class="lf-et-swatch" data-kind="fg" title="Foreground Color">' +
                               '<span class="lf-et-sw-a">A</span><span class="lf-et-sw-bar" style="background:#212529"></span>' +
                               '</button>';
            if (t.back) return '<button type="button" class="lf-et-swatch" data-kind="bg" title="Background Color">' +
                               '<span class="lf-et-sw-fill" style="background:#ffff00"></span>' +
                               '</button>';
            return '<button type="button" class="lf-et-tool" data-cmd="' + t.cmd + '" title="' + t.title + '">' + t.html + '</button>';
        }).join('');

        const wrap = document.createElement('div');
        wrap.className = 'lf-et-modal';
        wrap.innerHTML =
            '<div class="lf-et-box">' +
              '<div class="lf-et-head">' +
                '<h4>' + cfg.label + '</h4>' +
                '<button type="button" class="lf-et-reset" data-reset title="Restore the original wording and title">Reset</button>' +
                '<span style="flex:1"></span>' +
                '<button type="button" class="lf-et-x" data-close>&times;</button>' +
              '</div>' +
              '<div class="lf-et-note">' + cfg.hint + ' Anything in {braces} is filled in from the loan when the template is used.</div>' +
              '<div class="lf-et-title-row">' +
                '<label>Title</label>' +
                '<input type="text" class="lf-et-title" spellcheck="false">' +
              '</div>' +
              '<div class="lf-et-tools">' + toolHtml + '</div>' +
              '<div class="lf-et-body" contenteditable="true" spellcheck="false"></div>' +
              '<div class="lf-et-foot">' +
                '<span style="flex:1"></span>' +
                '<button type="button" class="lf-btn-sm" data-cancel>Cancel</button>' +
                '<button type="button" class="lf-btn-sm lf-btn-primary-sm" data-save>Save</button>' +
              '</div>' +
            '</div>';
        document.body.appendChild(wrap);

        const body = wrap.querySelector('.lf-et-body');
        const titleInput = wrap.querySelector('.lf-et-title');
        titleInput.value = lfEtTitle(which);
        body.innerHTML = lfEtHtml(which);

        // mark the placeholders so they stand out while editing, without storing the marker
        const markPlaceholders = () => {
            const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, null);
            const nodes = [];
            while (walker.nextNode()) nodes.push(walker.currentNode);
            nodes.forEach(n => {
                if (!/\{[^}]+\}/.test(n.nodeValue)) return;
                if (n.parentElement && n.parentElement.classList.contains('lf-et-ph')) return;
                const frag = document.createDocumentFragment();
                let last = 0;
                // v100.9.57: only the braces are marked. The words between them keep
                // the document's own formatting, so the template still reads as the
                // sentence it will become.
                n.nodeValue.replace(/\{[^}]+\}/g, (m, idx) => {
                    if (idx > last) frag.appendChild(document.createTextNode(n.nodeValue.slice(last, idx)));
                    const open = document.createElement('b');
                    open.className = 'lf-et-ph';
                    open.textContent = '{';
                    frag.appendChild(open);
                    frag.appendChild(document.createTextNode(m.slice(1, -1)));
                    const close = document.createElement('b');
                    close.className = 'lf-et-ph';
                    close.textContent = '}';
                    frag.appendChild(close);
                    last = idx + m.length;
                    return m;
                });
                if (last < n.nodeValue.length) frag.appendChild(document.createTextNode(n.nodeValue.slice(last)));
                n.parentNode.replaceChild(frag, n);
            });
        };
        markPlaceholders();
        body.addEventListener('blur', markPlaceholders);

        // v100.9.56: the toolbar follows the cursor. Without this the size box kept
        // showing whatever was set last, so selecting smaller text still read 16px.
        // v100.9.62: reads what is actually rendered - size, colours and the on/off
        // states - from the element the cursor or the pointer is in.
        const syncFrom = (node) => {
            if (!node) return;
            if (node.nodeType === 3) node = node.parentElement;
            if (!node || !body.contains(node)) return;
            const cs = getComputedStyle(node);

            const px = String(Math.round(parseFloat(cs.fontSize)));
            sizeSel.value = sizeSel.querySelector('option[value="' + px + '"]') ? px : '';

            const fg = lfEtRgbToHex(cs.color);
            if (fg && foreBtn) foreBtn.querySelector('.lf-et-sw-bar').style.background = fg;

            let bgNode = node, bg = '';
            while (bgNode && body.contains(bgNode)) {
                const b = getComputedStyle(bgNode).backgroundColor;
                if (b && !/rgba?\(0,\s*0,\s*0,\s*0\)|transparent/i.test(b)) { bg = lfEtRgbToHex(b); break; }
                bgNode = bgNode.parentElement;
            }
            if (backBtn) backBtn.querySelector('.lf-et-sw-fill').style.background = bg || 'transparent';
        };

        const syncToolbar = () => {
            const state = (c) => { try { return document.queryCommandState(c); } catch (e) { return false; } };
            wrap.querySelectorAll('.lf-et-tool[data-cmd]').forEach(b => {
                const c = b.dataset.cmd;
                if (['bold', 'italic', 'underline', 'strikeThrough', 'insertUnorderedList', 'insertOrderedList'].includes(c)) {
                    b.classList.toggle('on', state(c));
                }
            });
            const sel = window.getSelection();
            if (sel && sel.rangeCount && body.contains(sel.anchorNode)) syncFrom(sel.anchorNode);
        };

        const exec = (cmd, val) => {
            body.focus();
            try { document.execCommand(cmd, false, val === undefined ? null : val); } catch (e) {}
            syncToolbar();
        };
        wrap.querySelectorAll('.lf-et-tool').forEach(b => {
            b.addEventListener('mousedown', (e) => e.preventDefault());   // keep the selection
            b.addEventListener('click', (e) => {
                e.preventDefault();
                const cmd = b.dataset.cmd;
                if (cmd === 'createLink') {
                    const url = prompt('Link address:', 'https://www.loanfactory.com/login');
                    if (url) exec('createLink', url);
                    return;
                }
                exec(cmd);
            });
        });
        const sizeSel = wrap.querySelector('.lf-et-size');
        // v100.9.64: the old version called body.focus() on mousedown, which pulled
        // focus away the instant the dropdown opened - so it only worked if you held
        // the button down and dragged. The selection is remembered instead, and put
        // back just before the size is applied.
        let savedRange = null;
        const rememberRange = () => {
            const sel = window.getSelection();
            if (sel && sel.rangeCount && body.contains(sel.anchorNode)) savedRange = sel.getRangeAt(0).cloneRange();
        };
        const restoreRange = () => {
            if (!savedRange) return false;
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(savedRange);
            return true;
        };
        ['keyup', 'mouseup'].forEach(ev => body.addEventListener(ev, rememberRange));
        sizeSel.addEventListener('mousedown', rememberRange);
        // v100.9.62: the size is applied by wrapping the selection directly. Going via
        // execCommand('fontSize', '7') and converting afterwards left text at the
        // browser's size 7 - roughly 48px - whenever the markup it produced did not
        // match what the conversion looked for. Wrapping is exact: 16 means 16.
        const applyFontSize = (px) => {
            const sel = window.getSelection();
            if (!sel || !sel.rangeCount || sel.isCollapsed) { showToast('Select some text first'); return; }
            const range = sel.getRangeAt(0);
            if (!body.contains(range.commonAncestorContainer)) return;

            const span = document.createElement('span');
            span.style.fontSize = px + 'px';
            try {
                range.surroundContents(span);
            } catch (e) {
                // the selection crosses element boundaries - move it wholesale
                span.appendChild(range.extractContents());
                range.insertNode(span);
            }
            // clear any size set deeper inside, so the new one actually shows
            span.querySelectorAll('font[size], [style*="font-size"]').forEach(el => {
                if (el.tagName === 'FONT') el.removeAttribute('size');
                if (el.style) el.style.fontSize = '';
            });

            const r2 = document.createRange();
            r2.selectNodeContents(span);
            sel.removeAllRanges();
            sel.addRange(r2);
            syncToolbar();
        };
        sizeSel.addEventListener('change', () => {
            if (!sizeSel.value) return;
            body.focus();
            restoreRange();
            applyFontSize(sizeSel.value);
        });

        // the portal's own colour picker, reused
        const foreBtn = wrap.querySelector('.lf-et-swatch[data-kind="fg"]');
        const backBtn = wrap.querySelector('.lf-et-swatch[data-kind="bg"]');
        let lastFore = '#212529', lastBack = '#ffff00';

        const applyFore = (val) => {
            lastFore = val || '#212529';
            foreBtn.querySelector('.lf-et-sw-bar').style.background = lastFore;
            exec('foreColor', lastFore);
        };
        const applyBack = (val) => {
            lastBack = val || '';
            backBtn.querySelector('.lf-et-sw-fill').style.background = lastBack || 'transparent';
            exec(val ? 'hiliteColor' : 'removeFormat', val || undefined);
        };

        [foreBtn, backBtn].forEach(btn => {
            btn.addEventListener('mousedown', (e) => { rememberRange(); e.preventDefault(); });
            btn.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation();
                const isBg = btn.dataset.kind === 'bg';
                lfDtOpenPalette(btn, isBg ? 'bg' : 'fg', isBg ? lastBack : lastFore,
                    (val) => { isBg ? applyBack(val) : applyFore(val); },
                    wrap.querySelector('.lf-et-box'));
            });
        });

        ['keyup', 'mouseup', 'input', 'focus'].forEach(ev => body.addEventListener(ev, syncToolbar));
        // hovering shows the formatting under the pointer, as long as nothing is selected
        body.addEventListener('mouseover', (e) => {
            const sel = window.getSelection();
            if (sel && sel.rangeCount && !sel.isCollapsed) return;   // a selection wins
            syncFrom(e.target);
        });
        body.addEventListener('mouseleave', syncToolbar);
        const onSelChange = () => { if (document.activeElement === body) syncToolbar(); };
        document.addEventListener('selectionchange', onSelChange);
        syncToolbar();

        let closing = false;
        const close = () => {
            if (closing) return;                       // a second click must not re-trigger it
            closing = true;
            document.removeEventListener('selectionchange', onSelChange);
            document.querySelectorAll('.lf-dt-palette').forEach(el => el.remove());
            wrap.classList.add('lf-et-closing');

            // v100.9.64: hand the user back to the settings panel they came from
            const panel = document.getElementById('lf-color-panel');
            if (panel) panel.classList.add('open');

            const done = () => { if (wrap.parentNode) wrap.remove(); };
            wrap.addEventListener('animationend', done, { once: true });
            setTimeout(done, 320);                     // in case the animation never fires
        };
        wrap.querySelector('[data-close]').onclick = close;
        wrap.querySelector('[data-cancel]').onclick = close;
        wrap.querySelector('[data-reset]').onclick = () => {
            body.innerHTML = lfEtToHtml(cfg.def, true);
            titleInput.value = cfg.defTitle;
            markPlaceholders();
            showToast('Reset to the original');
        };
        wrap.querySelector('[data-save]').onclick = () => {
            // strip the editing-only placeholder marker, keep everything else
            const clone = body.cloneNode(true);
            clone.querySelectorAll('b.lf-et-ph').forEach(b => {
                b.replaceWith(document.createTextNode(b.textContent));
            });
            localStorage.setItem(cfg.key, clone.innerHTML);
            localStorage.setItem(cfg.titleKey, titleInput.value.trim());
            showToast('Template saved');
            close();
        };
        wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(); });
    }

    // ==========================================
    // SLA DATE & TIME LOGIC
    // ==========================================
    function addBusinessHours(startDate, hoursToAdd) {
        // v100.9.45: the start and end of the day come from the chosen region rather
        // than being fixed at 9-18. The logic below is otherwise unchanged.
        const SH = lfTtShift();
        const DAY_START = SH.start, DAY_END = SH.end;

        let d = new Date(startDate.getTime());
        if (d.getDay() === 0) { d.setDate(d.getDate() + 1); d.setHours(DAY_START, 0, 0, 0); }
        else if (d.getDay() === 6) { d.setDate(d.getDate() + 2); d.setHours(DAY_START, 0, 0, 0); }
        else if (d.getHours() < DAY_START) { d.setHours(DAY_START, 0, 0, 0); }
        else if (d.getHours() >= DAY_END) {
            d.setDate(d.getDate() + 1); d.setHours(DAY_START, 0, 0, 0);
            if (d.getDay() === 6) { d.setDate(d.getDate() + 2); }
        }

        let minutesToAdd = hoursToAdd * 60;
        while (minutesToAdd > 0) {
            if (d.getDay() === 0) { d.setDate(d.getDate() + 1); d.setHours(DAY_START, 0, 0, 0); continue; }
            if (d.getDay() === 6) { d.setDate(d.getDate() + 2); d.setHours(DAY_START, 0, 0, 0); continue; }
            let currentHour = d.getHours();
            if (currentHour < DAY_START) { d.setHours(DAY_START, 0, 0, 0); continue; }
            if (currentHour >= DAY_END) { d.setDate(d.getDate() + 1); d.setHours(DAY_START, 0, 0, 0); continue; }
            let endOfDay = new Date(d.getTime()); endOfDay.setHours(DAY_END, 0, 0, 0);
            let msUntilEndOfDay = endOfDay.getTime() - d.getTime();
            let minsUntilEndOfDay = msUntilEndOfDay / (60 * 1000);
            if (minutesToAdd <= minsUntilEndOfDay) {
                d.setMinutes(d.getMinutes() + minutesToAdd); minutesToAdd = 0;
            } else {
                minutesToAdd -= minsUntilEndOfDay; d.setDate(d.getDate() + 1); d.setHours(DAY_START, 0, 0, 0);
            }
        }
        return d;
    }

    function formatDueDate(d) {
        if (!d || isNaN(d.getTime())) return 'N/A';
        let month = d.getMonth() + 1, day = d.getDate(), year = d.getFullYear(), h = d.getHours(), min = d.getMinutes();
        let ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12; h = h ? h : 12;
        min = min < 10 ? '0' + min : min;
        return `${month}/${day}/${year} ${h}:${min} ${ampm}`;
    }

    function normalizeDateStr(str) {
        const match = str.match(/(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])\/(\d{4})\s+(0?[1-9]|1[0-2]):(\d{1,2})\s+(AM|PM)/i);
        if (!match) return str;
        const [_, month, day, year, hour, minute, ampm] = match;
        const pad = (num) => num.padStart(2, '0');
        return `${pad(month)}/${pad(day)}/${year} ${pad(hour)}:${pad(minute)} ${ampm.toUpperCase()}`;
    }

    // ==========================================
    // DISCARD PROTECTION LOGIC
    // ==========================================
    const isNoteDirty = () => {
        const visibleModals = document.querySelectorAll('.modal.show, .modal[style*="display: block"], .ui-dialog[style*="display: block"]');
        for (let m of visibleModals) {
            if ((m.textContent || '').toUpperCase().includes('SELECT RECIPIENTS')) {
                return false;
            }
        }

        // v100.9.2: the editor must actually be ON SCREEN. querySelector returns the
        // first match whether visible or not, so a hidden note editor left in the DOM
        // made every page look like it had an unsaved note - which made the navigation
        // guard intercept (and preventDefault) every link click, including Ctrl+click
        // on "View Loan".
        const editors = Array.from(document.querySelectorAll('.note-editable, textarea[name*="note"], textarea[id*="note"]'));
        const editor = editors.find(e => e.offsetParent !== null || (e.offsetWidth > 0 && e.offsetHeight > 0));
        if (!editor) return false;

        const parentModal = editor.closest('.modal, .ui-dialog');
        if (parentModal) {
            const modalText = parentModal.textContent.toUpperCase();
            if (modalText.includes('FOLLOW-UP FLAG') || modalText.includes('SEND NOTES') || modalText.includes('SEND NOTE') || modalText.includes('EMAIL NOTE')) {
                return false;
            }
        }

        // v100.8.62: strip the zero-width character used by the Default Text Style
        // seed, so an editor that only carries the styling marker still counts as empty
        const text = (editor.textContent || editor.value || '').replace(/\u200B/g, '').trim();
        return text.length > 0 && text !== '<p><br></p>';
    };

    function getPSTTime() {
        return new Date(new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
    }

    function getNextBusinessDayPST() {
        let d = getPSTTime();
        d.setDate(d.getDate() + 1);
        if (d.getDay() === 6) d.setDate(d.getDate() + 2);
        else if (d.getDay() === 0) d.setDate(d.getDate() + 1);
        return d;
    }

    const showConfirmDialog = (onConfirm, onCancel) => {
        if (document.getElementById('lf-confirm-dialog')) return;
        const dialogHtml = `
            <div id="lf-confirm-dialog" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.5); z-index: 99999; display: flex; align-items: center; justify-content: center;">
                <div style="background: white; padding: 25px; border-radius: 10px; width: 400px; box-shadow: 0 4px 15px rgba(0,0,0,0.3); font-family: sans-serif; text-align: center;">
                    <h4 style="margin-top: 0; color: #333; font-weight: bold; margin-bottom: 12px;">Discard Unsaved Note?</h4>
                    <p style="color: #666; font-size: 14px; margin: 15px 0 25px 0;">You have typed a note. If you close this window, your note will be permanently lost.</p>
                    <div style="display: flex; justify-content: space-around;">
                        <button id="lf-confirm-cancel" style="background: #2ecc71; color: white; border: none; padding: 10px 24px; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 14px;">Keep Editing</button>
                        <button id="lf-confirm-discard" style="background: #d9534f; color: white; border: none; padding: 10px 24px; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 14px;">Discard Note</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', dialogHtml);
        document.getElementById('lf-confirm-cancel').onclick = () => { document.getElementById('lf-confirm-dialog').remove(); if (onCancel) onCancel(); };
        document.getElementById('lf-confirm-discard').onclick = () => { document.getElementById('lf-confirm-dialog').remove(); if (onConfirm) onConfirm(); };
    };

    // ==========================================
    // AUTO-AVAILABILITY HELPERS
    // ==========================================
    function isToggleOn(element) {
        if (!element) return false;
        if (element.tagName === 'INPUT' && element.type === 'checkbox') return element.checked;
        if (element.getAttribute('aria-checked') === 'true') return true;
        if (element.getAttribute('checked') !== null) return true;
        const checkClasses = (el) => {
            if (!el) return false;
            const classes = Array.from(el.classList).map(c => c.toLowerCase());
            return classes.some(c => c.includes('active') || c.includes('checked') || c.includes('-on') || c === 'on');
        };
        if (checkClasses(element) || checkClasses(element.parentElement)) return true;
        return false;
    }

    function findElementByText(text, selector = 'span, label, div, a, li, b, strong') {
        return Array.from(document.querySelectorAll(selector)).find(el => el.textContent && el.textContent.trim() === text && el.children.length === 0);
    }

    function findAvailableCheckbox() {
        const availText = findElementByText('Available');
        if (availText && availText.parentElement) {
            const parent = availText.parentElement;
            const checkbox = parent.querySelector('input[type="checkbox"]');
            if (checkbox) return checkbox;
            const switchEl = parent.querySelector('[role="switch"], .form-check-input, .switch, [class*="switch"]');
            if (switchEl) return switchEl;
            if (parent.tagName === 'LABEL' || parent.classList.contains('form-check') || parent.classList.contains('form-switch')) return parent;
        }
        const dropdownMenu = document.querySelector('.dropdown-menu, .menu-sub, .menu-column');
        if (dropdownMenu) {
            const checkbox = dropdownMenu.querySelector('input[type="checkbox"]');
            if (checkbox) return checkbox;
        }
        return document.querySelector('input[name="available"], input[id*="available"]');
    }

    // ==========================================
    // MASTER INITIALIZATION
    // ==========================================
    function initAll() {
        injectMasterCSS();
        initColors();

        const autoEnabled = localStorage.getItem('lf_auto_avail_enabled') === 'true';
        const autoStart = localStorage.getItem('lf_auto_avail_start') || '09:00';
        const autoEnd = localStorage.getItem('lf_auto_avail_end') || '18:00';
        const autoMsg = localStorage.getItem('lf_auto_avail_msg') || 'out of office';

        const autoNavEnabled = localStorage.getItem('lf_auto_nav_enabled') === 'true';
        const autoSidebarEnabled = localStorage.getItem('lf_auto_sidebar_enabled') !== 'false';
        // v100.8.49: borrower-name recolor (for files WITHOUT a follow-up flag)
        const nameColorEnabled = localStorage.getItem('lf_name_color_enabled') === 'true';
        const nameColorValue = localStorage.getItem('lf_name_color_value') || '#e74c3c';
        // v100.8.74: Tickets Turn-time settings
        const ttEnabled = lfTtEnabled();
        const ttRole = lfTtRole();
        // v100.8.60: default text style settings for the panel card
        const dtStyle = lfDtLoad();

        // Color Panel + Settings Injection
        const panelHtml = `
            <div id="lf-color-panel" class="lf-side-panel">
                <div class="lf-panel-header">
                    <h3 class="lf-panel-title">Pipeline Colors <span style="font-size:11px; font-weight:600; color:#94a3b8; margin-left:6px;">v100.9.69</span></h3>
                    <button class="lf-close-btn" id="lf-panel-close">×</button>
                </div>
                <div class="lf-panel-content">
                    <div class="lf-themes-bar">
                        <span class="lf-panel-title" style="width: 100%; font-size: 13px; color: #666;">Presets:</span>
                        <button class="lf-theme-btn" data-theme="classic">Classic</button>
                        <button class="lf-theme-btn" data-theme="pastel">Pastel</button>
                        <button class="lf-theme-btn" data-theme="ocean">Ocean</button>
                        <button class="lf-theme-btn" data-theme="white">White</button>
                    </div>
                    ${[
                        { id: 'purple', name: 'Clear to Close' },
                        { id: 'green', name: 'Funded / Closed' },
                        { id: 'yellow', name: 'Approved' },
                        { id: 'blue', name: 'Processing' },
                        { id: 'red', name: 'Denied / Suspended' },
                        { id: 'new', name: 'New Loans' }
                    ].map(status => {
                        let swatches = COLOR_PRESETS.map(p => `<span class="lf-swatch" data-color="${p.hex}" style="background:${p.hex}" title="${p.name}"></span>`).join('');
                        return `<div class="lf-grid-row" data-row-status="${status.id}">
                            <div class="lf-label-wrapper"><span class="lf-indicator-dot" data-indicator-status="${status.id}"></span><span class="lf-row-label">${status.name}</span></div>
                            <div class="lf-swatch-list">${swatches}<span class="lf-swatch lf-swatch-picker" title="Custom Picker"><input type="color" data-picker-status="${status.id}"></span></div>
                        </div>`;
                    }).join('')}

                    <div class="lf-settings-card">
                        <h4 class="lf-settings-title">
                            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                            Auto-Availability
                        </h4>
                        <label class="lf-switch-wrapper">
                            <span class="lf-switch-label">Auto turn capacity ON/OFF</span>
                            <div class="lf-switch">
                                <input type="checkbox" id="lf-auto-toggle" ${autoEnabled ? 'checked' : ''}>
                                <span class="lf-slider"></span>
                            </div>
                        </label>
                        <div id="lf-auto-hours-container" class="lf-hours-container ${autoEnabled ? 'visible' : 'hidden'}">
                            <div class="lf-hours-inner">
                                <div class="lf-hours-label">Working hours (PST)</div>
                                <div class="lf-hours-row">
                                    <input type="time" id="lf-auto-start" class="lf-time-input" value="${autoStart}">
                                    <span class="lf-time-separator">to</span>
                                    <input type="time" id="lf-auto-end" class="lf-time-input" value="${autoEnd}">
                                </div>
                                <div class="lf-hours-label" style="margin-top: 8px;">Away Message</div>
                                <input type="text" id="lf-auto-msg" class="lf-time-input" value="${autoMsg}" style="width: 100%;">
                            </div>
                        </div>
                    </div>

                    <div class="lf-settings-card">
                        <h4 class="lf-settings-title">
                            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                            Auto-Navigate to Docs
                        </h4>
                        <label class="lf-switch-wrapper">
                            <span class="lf-switch-label">Auto-open "All documents" tab</span>
                            <div class="lf-switch">
                                <input type="checkbox" id="lf-auto-nav-toggle" ${autoNavEnabled ? 'checked' : ''}>
                                <span class="lf-slider"></span>
                            </div>
                        </label>
                    </div>

                    <div class="lf-settings-card">
                        <h4 class="lf-settings-title">
                            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><polyline points="12 7 12 12 15.5 14"></polyline></svg>
                            Tickets Turn-time
                        </h4>
                        <label class="lf-switch-wrapper">
                            <span class="lf-switch-label">Show due date &amp; countdown</span>
                            <div class="lf-switch">
                                <input type="checkbox" id="lf-tt-toggle" ${ttEnabled ? 'checked' : ''}>
                                <span class="lf-slider"></span>
                            </div>
                        </label>
                        <div id="lf-tt-container" class="lf-hours-container ${ttEnabled ? 'visible' : 'hidden'}">
                            <div class="lf-hours-inner">
                                <div class="lf-hours-label">Role</div>
                                <select id="lf-tt-role" class="lf-dt-select" style="width: 100%;">
                                    ${Object.keys(LF_TT_RULES).map(k => `<option value="${k}"${ttRole === k ? ' selected' : ''}>${LF_TT_RULES[k].label}</option>`).join('')}
                                </select>
                                <div class="lf-hours-label" style="margin-top: 4px;">Working hours</div>
                                <select id="lf-tt-shift" class="lf-dt-select" style="width: 100%;">
                                    ${Object.keys(LF_TT_SHIFTS).map(k => `<option value="${k}"${lfTtShiftKey() === k ? ' selected' : ''}>${LF_TT_SHIFTS[k].label} \u2013 ${LF_TT_SHIFTS[k].note}</option>`).join('')}
                                </select>
                                <div class="lf-hours-label" style="margin-top: 4px;">Rule</div>
                                <div id="lf-tt-summary" class="lf-tt-summary">${LF_TT_RULES[ttRole].summary}</div>
                            </div>
                        </div>
                    </div>

                    <div class="lf-settings-card">
                        <h4 class="lf-settings-title">
                            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg>
                            Auto Sidebar Collapser
                        </h4>
                        <label class="lf-switch-wrapper">
                            <span class="lf-switch-label">Auto-collapse left sidebar</span>
                            <div class="lf-switch">
                                <input type="checkbox" id="lf-auto-sidebar-toggle" ${autoSidebarEnabled ? 'checked' : ''}>
                                <span class="lf-slider"></span>
                            </div>
                        </label>
                    </div>

                    <div class="lf-settings-card">
                        <h4 class="lf-settings-title">
                            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                            To-do Email Templates
                        </h4>
                        <label class="lf-switch-wrapper">
                            <span class="lf-switch-label">Customized borrower to-do email</span>
                            <div class="lf-switch">
                                <input type="checkbox" id="lf-et-borrower-toggle" ${localStorage.getItem('lf_email_tpl_borrower_on') === 'true' ? 'checked' : ''}>
                                <span class="lf-slider"></span>
                            </div>
                        </label>
                        <button type="button" class="lf-theme-btn" id="lf-et-borrower-edit" style="width:100%; padding:7px 10px; margin-bottom:10px;">Edit borrower email</button>

                        <label class="lf-switch-wrapper">
                            <span class="lf-switch-label">Customized escrow to-do email</span>
                            <div class="lf-switch">
                                <input type="checkbox" id="lf-et-escrow-toggle" ${localStorage.getItem('lf_email_tpl_escrow_on') === 'true' ? 'checked' : ''}>
                                <span class="lf-slider"></span>
                            </div>
                        </label>
                        <button type="button" class="lf-theme-btn" id="lf-et-escrow-edit" style="width:100%; padding:7px 10px;">Edit escrow email</button>

                        <div style="font-size: 11px; color: #94a3b8; margin-top: 8px;">Applies on the Send To-do List page when the template is <b>condition_document</b>. Only the body between "Dear" and "Sincerely," is replaced \u2013 the logo and signature stay as they are.</div>
                    </div>

                    <div class="lf-settings-card">
                        <h4 class="lf-settings-title">
                            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                            System Notices
                        </h4>
                        <label class="lf-switch-wrapper">
                            <span class="lf-switch-label">Disable system warning notice - <span class="lf-warn-caution">use with caution</span></span>
                            <div class="lf-switch">
                                <input type="checkbox" id="lf-warn-notice-toggle" ${localStorage.getItem('lf_disable_warning_notice') === 'true' ? 'checked' : ''}>
                                <span class="lf-slider"></span>
                            </div>
                        </label>
                        <div style="font-size: 11px; color: #94a3b8; margin-top: 8px;">Closes the portal's "WARNING NOTICE" pop-up automatically on every page load. Those notices can carry compliance deadlines and account-lockout warnings, so read them before switching this on.</div>
                    </div>

                    <div class="lf-settings-card">
                        <h4 class="lf-settings-title">
                            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 7 4 4 20 4 20 7"></polyline><line x1="9" y1="20" x2="15" y2="20"></line><line x1="12" y1="4" x2="12" y2="20"></line></svg>
                            Default Text Style
                        </h4>
                        <label class="lf-switch-wrapper">
                            <span class="lf-switch-label">Use this style when typing</span>
                            <div class="lf-switch">
                                <input type="checkbox" id="lf-dt-enabled" ${dtStyle.enabled ? 'checked' : ''}>
                                <span class="lf-slider"></span>
                            </div>
                        </label>
                        <div id="lf-dt-container" class="lf-hours-container ${dtStyle.enabled ? 'visible' : 'hidden'}">
                            <div class="lf-hours-inner">
                                <div class="lf-hours-label">Presets</div>
                                <div class="lf-dt-row">
                                    ${LF_DT_PRESETS.map(p => `<button type="button" class="lf-dt-preset" data-preset="${p.name}" title="Apply the ${p.name} preset">${p.name}</button>`).join('')}
                                </div>
                                <div class="lf-hours-label">Font</div>
                                <div class="lf-dt-row">
                                    <button type="button" id="lf-dt-font" class="lf-dt-fontbtn" title="Font family (web-safe)" style="font-family:${dtStyle.font || 'inherit'};">
                                        <span id="lf-dt-font-label">${lfDtFontLabel(dtStyle.font)}</span>
                                        <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                                    </button>
                                </div>
                                <div class="lf-hours-label">Format</div>
                                <div class="lf-dt-row">
                                    <button type="button" class="lf-dt-tbtn${dtStyle.bold ? ' on' : ''}" data-dt="bold" title="Bold"><b>B</b></button>
                                    <button type="button" class="lf-dt-tbtn${dtStyle.italic ? ' on' : ''}" data-dt="italic" title="Italic"><i>I</i></button>
                                    <button type="button" class="lf-dt-tbtn${dtStyle.underline ? ' on' : ''}" data-dt="underline" title="Underline"><u>U</u></button>
                                    <select id="lf-dt-size" class="lf-dt-select" title="Font size">
                                        ${[10,11,12,13,14,16,18,20,22,24,28,32,36].map(n => `<option value="${n}"${Number(dtStyle.size) === n ? ' selected' : ''}>${n} px</option>`).join('')}
                                    </select>
                                </div>
                                <div class="lf-hours-label">Colours</div>
                                <div class="lf-dt-row">
                                    <button type="button" id="lf-dt-color" class="lf-dt-swatch-btn" data-kind="fg" title="Foreground Color">
                                        <span class="lf-dt-swatch-a">A</span>
                                        <span class="lf-dt-swatch-bar" style="background:${dtStyle.color || '#000000'};"></span>
                                    </button>
                                    <button type="button" id="lf-dt-highlight" class="lf-dt-swatch-btn" data-kind="bg" title="Background Color">
                                        <span class="lf-dt-swatch-a">\u25A0</span>
                                        <span class="lf-dt-swatch-bar${dtStyle.highlight ? '' : ' none'}" style="background:${dtStyle.highlight || 'transparent'};"></span>
                                    </button>
                                    <button type="button" id="lf-dt-reset" class="lf-dt-mini">Reset</button>
                                </div>
                                <div class="lf-hours-label">Preview</div>
                                <div id="lf-dt-preview"><span id="lf-dt-preview-text">Hiếu đẹp trai siêu cấp</span></div>
                            </div>
                        </div>
                    </div>

                    <div class="lf-settings-card">
                        <h4 class="lf-settings-title">
                            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"></path><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path><path d="M2 2l7.586 7.586"></path><circle cx="11" cy="11" r="2"></circle></svg>
                            Borrower Name Color
                        </h4>
                        <label class="lf-switch-wrapper">
                            <span class="lf-switch-label">Recolor names (no follow-up flag)</span>
                            <div class="lf-switch">
                                <input type="checkbox" id="lf-name-color-toggle" ${nameColorEnabled ? 'checked' : ''}>
                                <span class="lf-slider"></span>
                            </div>
                        </label>
                        <div id="lf-name-color-container" class="lf-hours-container ${nameColorEnabled ? 'visible' : 'hidden'}">
                            <div class="lf-hours-inner">
                                <div class="lf-hours-label">Name color</div>
                                <div class="lf-name-color-swatches">
                                    ${[['Red', '#e74c3c'], ['Orange', '#e67e22'], ['Green', '#27ae60'], ['Blue', '#2980b9'], ['Purple', '#8e44ad'], ['Teal', '#16a085'], ['Pink', '#d63384'], ['Black', '#111111']].map(([nm, hex]) =>
                                        `<span class="lf-name-swatch${nameColorValue.toLowerCase() === hex ? ' active' : ''}" data-name-color="${hex}" title="${nm}" style="background:${hex};"></span>`).join('')}
                                    <input type="color" id="lf-name-color-picker" value="${nameColorValue}" title="Custom color" class="lf-name-swatch lf-name-swatch-picker">
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="lf-settings-card">
                        <h4 class="lf-settings-title">
                            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                            Global Search Hotkey
                        </h4>
                        <div class="lf-hours-label">Click the box, then press your key</div>
                        <div class="lf-hours-row" style="margin-top: 6px;">
                            <input type="text" id="lf-search-hotkey-input" class="lf-time-input" readonly value="" style="text-align: center; font-weight: 700; cursor: pointer;" title="Click here, then press the key you want to use for global search">
                            <button type="button" id="lf-search-hotkey-reset" class="lf-theme-btn" style="flex-shrink: 0;">Reset to \\</button>
                        </div>
                        <div style="font-size: 11px; color: #94a3b8; margin-top: 6px;">Opens the global search bar. Ignored while typing in any text field. Remember to click Save Settings.</div>
                    </div>

                    <div class="lf-settings-card">
                        <h4 class="lf-settings-title">
                            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                            Backup &amp; Restore
                        </h4>
                        <div class="lf-hours-label">All script settings (colors, schedules, hotkey, auto-reviews)</div>
                        <div class="lf-hours-row" style="margin-top: 6px;">
                            <button type="button" id="lf-export-btn" class="lf-theme-btn" style="flex: 1; padding: 7px 10px;">Export Settings</button>
                            <button type="button" id="lf-import-btn" class="lf-theme-btn" style="flex: 1; padding: 7px 10px;">Import Settings</button>
                            <input type="file" id="lf-import-file" accept=".json,application/json" style="display: none;">
                        </div>
                    </div>

                    <button id="lf-auto-save-btn">
                        ${SAVE_SVG}
                        <span>Save Settings</span>
                    </button>

                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', panelHtml);

        const navRight = document.querySelector('.navbar-nav.navbar-right');
        const colorPanel = document.getElementById('lf-color-panel');
        const openBtn = document.getElementById('lf-nav-color-btn');

        if (navRight) {
            const li = document.createElement('li');
            li.className = 'dropdown'; li.id = 'lf-nav-color-btn';
            li.innerHTML = `<a href="javascript:;" class="icon"><i class="material-icons" style="font-size:26px; color: inherit;">palette</i></a>`;
            const notifyBtn = document.getElementById('a__notify');
            if (notifyBtn) navRight.insertBefore(li, notifyBtn); else navRight.appendChild(li);
            li.addEventListener('click', () => colorPanel.classList.add('open'));
        }

        document.getElementById('lf-panel-close').addEventListener('click', () => { lfDtCloseFontList(); colorPanel.classList.remove('open'); });

        document.addEventListener('mousedown', (e) => {
            if (colorPanel && colorPanel.classList.contains('open')) {
                const toggleBtn = document.getElementById('lf-nav-color-btn');
                // v100.9.64: a click inside the template editor is not a click outside
                // the panel - Cancel used to close both, so the panel had to be
                // reopened for any further setting.
                if (e.target.closest && e.target.closest('.lf-et-modal, .lf-dt-palette')) return;
                if (!colorPanel.contains(e.target) && (!toggleBtn || !toggleBtn.contains(e.target))) {
                    // v100.8.70: the font list is fixed-positioned, so it must be removed
                    // with the panel or it would be left floating over the page
                    lfDtCloseFontList();
                    colorPanel.classList.remove('open');
                }
            }
        });

        // Setup UI listeners
        const autoToggle = document.getElementById('lf-auto-toggle');
        const autoNavToggle = document.getElementById('lf-auto-nav-toggle');
        const autoSidebarToggle = document.getElementById('lf-auto-sidebar-toggle');
        const autoHoursContainer = document.getElementById('lf-auto-hours-container');
        const startInput = document.getElementById('lf-auto-start');
        const endInput = document.getElementById('lf-auto-end');
        const msgInput = document.getElementById('lf-auto-msg');
        const saveBtn = document.getElementById('lf-auto-save-btn');

        // ==========================================
        // v100.8.39: GLOBAL SEARCH HOTKEY RECORDER
        // ==========================================
        const hotkeyInput = document.getElementById('lf-search-hotkey-input');
        const hotkeyReset = document.getElementById('lf-search-hotkey-reset');
        const displayHotkey = (k) => (k === ' ' ? 'Space' : (k && k.length === 1 ? k.toUpperCase() : k));
        // Pending value = what will be persisted when Save Settings is clicked
        let pendingHotkey = {
            key: localStorage.getItem('lf_search_hotkey_key') || '\\',
            code: localStorage.getItem('lf_search_hotkey_code') || 'Backslash'
        };
        if (hotkeyInput) {
            hotkeyInput.value = displayHotkey(pendingHotkey.key);
            hotkeyInput.addEventListener('keydown', (e) => {
                e.preventDefault(); e.stopPropagation();
                // Ignore bare modifier presses; block keys that conflict with other features
                if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
                if (['Escape', 'Enter', 'Tab'].includes(e.key)) {
                    showToast(`"${e.key}" cannot be used as the search hotkey`);
                    return;
                }
                pendingHotkey = { key: e.key, code: e.code };
                hotkeyInput.value = displayHotkey(e.key);
            });
        }
        if (hotkeyReset) {
            hotkeyReset.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation();
                pendingHotkey = { key: '\\', code: 'Backslash' };
                if (hotkeyInput) hotkeyInput.value = '\\';
            });
        }

        // ==========================================
        // v100.8.44: SETTINGS EXPORT / IMPORT
        // Backs up every lf_* localStorage key: row colors, availability schedule,
        // auto-nav/sidebar toggles, sort preference, search hotkey, and ALL
        // auto-review schedules. (lf_saved_summary is excluded - transient cache.)
        // ==========================================
        const LF_EXPORT_EXCLUDE = ['lf_saved_summary'];
        const exportBtn = document.getElementById('lf-export-btn');
        const importBtn = document.getElementById('lf-import-btn');
        const importFile = document.getElementById('lf-import-file');

        if (exportBtn) {
            exportBtn.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation();
                const data = {};
                for (let i = 0; i < localStorage.length; i++) {
                    const k = localStorage.key(i);
                    if (k && k.startsWith('lf_') && !LF_EXPORT_EXCLUDE.includes(k)) data[k] = localStorage.getItem(k);
                }
                const payload = { app: 'lf-optimizer-settings', version: '100.8.44', exported: new Date().toISOString(), settings: data };
                const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
                const a = document.createElement('a');
                const d = new Date();
                a.href = URL.createObjectURL(blob);
                a.download = `lf-optimizer-settings-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`;
                document.body.appendChild(a);
                a.click();
                setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
                showToast(`Exported ${Object.keys(data).length} settings`);
            });
        }

        if (importBtn && importFile) {
            importBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); importFile.click(); });
            importFile.addEventListener('change', () => {
                const file = importFile.files && importFile.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                    try {
                        const payload = JSON.parse(reader.result);
                        // Accept both our wrapped format and a bare {key: value} object
                        const settings = (payload && payload.app === 'lf-optimizer-settings' && payload.settings) ? payload.settings : payload;
                        if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error('bad format');
                        let count = 0;
                        for (const [k, v] of Object.entries(settings)) {
                            if (k.startsWith('lf_') && typeof v === 'string') { localStorage.setItem(k, v); count++; }
                        }
                        if (!count) throw new Error('no settings');
                        showToast(`Imported ${count} settings - refresh the page to apply`);
                    } catch (err) {
                        showToast('Import failed: not a valid settings file');
                    }
                    importFile.value = '';
                };
                reader.readAsText(file);
            });
        }

        // ==========================================
        // v100.8.74: Tickets Turn-time - toggle, role and live rule summary
        const ttToggle = document.getElementById('lf-tt-toggle');
        const ttContainer = document.getElementById('lf-tt-container');
        const ttRoleSel = document.getElementById('lf-tt-role');
        const ttSummary = document.getElementById('lf-tt-summary');
        const ttShiftSel = document.getElementById('lf-tt-shift');
        const ttRefresh = () => {
            const r = LF_TT_RULES[lfTtRole()];
            if (ttSummary) {
                ttSummary.innerHTML = r ? r.summary : 'TBD';
                ttSummary.classList.toggle('tbd', !r || r.ready !== true);
                // v100.9.45: fill in the "Counted ..." line from the chosen region
                ttSummary.querySelectorAll('.lf-tt-counted').forEach(el => {
                    el.textContent = lfTtCountedNote();
                });
            }
            // Recompute from scratch so a rule change takes effect immediately
            lfTtClear();
        };
        if (ttToggle && ttContainer) {
            ttToggle.addEventListener('change', (e) => {
                localStorage.setItem(LF_TT_ENABLED_KEY, e.target.checked);
                if (e.target.checked) { ttContainer.classList.remove('hidden'); ttContainer.classList.add('visible'); }
                else { ttContainer.classList.remove('visible'); ttContainer.classList.add('hidden'); }
                ttRefresh();
            });
        }
        if (ttShiftSel) {
            ttShiftSel.addEventListener('change', (e) => {
                localStorage.setItem(LF_TT_SHIFT_KEY, e.target.value);
                ttRefresh();                                  // redraws every due date
                showToast('Working hours: ' + lfTtShift().label + ' (' + lfTtShift().note + ')');
            });
        }
        if (ttRoleSel) {
            ttRoleSel.addEventListener('change', (e) => {
                localStorage.setItem(LF_TT_ROLE_KEY, e.target.value);
                ttRefresh();
                const r = LF_TT_RULES[e.target.value];
                if (r && r.ready !== true) showToast(`${r.label} rules are not set yet \u2013 turn-time paused`);
            });
        }
        ttRefresh();

        // v100.8.60: DEFAULT TEXT STYLE controls (live preview)
        // ==========================================
        let pendingDt = lfDtLoad();
        const dtToggle = document.getElementById('lf-dt-enabled');
        const dtContainer = document.getElementById('lf-dt-container');
        const dtPreview = document.getElementById('lf-dt-preview');
        const dtPaint = () => {
            // v100.8.63: style the inner SPAN, never the container. Previously the
            // container's `background:#fff` shorthand was appended after the user's
            // `background-color`, silently resetting it - which is why the highlight
            // never appeared in the preview. Styling the span also makes the
            // highlight hug the text, exactly as it does in a real note.
            const span = document.getElementById('lf-dt-preview-text');
            if (!span) return;
            span.setAttribute('style', lfDtStyleString(pendingDt, false));
        };
        dtPaint();
        if (dtToggle && dtContainer) {
            dtToggle.addEventListener('change', (e) => {
                pendingDt.enabled = e.target.checked;
                if (e.target.checked) { dtContainer.classList.remove('hidden'); dtContainer.classList.add('visible'); }
                else { dtContainer.classList.remove('visible'); dtContainer.classList.add('hidden'); }
            });
        }
        document.querySelectorAll('.lf-dt-tbtn').forEach(b => {
            b.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation();
                const k = b.dataset.dt;
                pendingDt[k] = !pendingDt[k];
                b.classList.toggle('on', pendingDt[k]);
                dtPaint();
            });
        });
        const dtFont = document.getElementById('lf-dt-font');
        const dtSetFontBtn = (css) => {
            if (!dtFont) return;
            dtFont.style.fontFamily = css || 'inherit';
            const lbl = document.getElementById('lf-dt-font-label');
            if (lbl) lbl.textContent = lfDtFontLabel(css);
        };
        if (dtFont) {
            dtFont.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation();
                // Second click closes it
                if (document.querySelector('.lf-dt-fontlist')) { lfDtCloseFontList(); return; }
                lfDtOpenFontList(dtFont, pendingDt.font, (css) => {
                    pendingDt.font = css || '';
                    dtSetFontBtn(pendingDt.font);
                    dtPaint();
                });
            });
        }
        const dtSize = document.getElementById('lf-dt-size');
        if (dtSize) dtSize.addEventListener('change', (e) => { pendingDt.size = parseInt(e.target.value, 10) || 16; dtPaint(); });
        // v100.8.61: colour buttons open the app-style palette popup. Using explicit
        // palette picks (instead of a native colour input that merely LOOKED set)
        // is what fixes the highlight never being applied.
        const dtSetSwatch = (btn, val) => {
            if (!btn) return;
            const bar = btn.querySelector('.lf-dt-swatch-bar');
            if (!bar) return;
            bar.style.background = val || 'transparent';
            bar.classList.toggle('none', !val);
        };
        const dtColorBtn = document.getElementById('lf-dt-color');
        const dtHlBtn = document.getElementById('lf-dt-highlight');
        if (dtColorBtn) {
            dtColorBtn.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation();
                lfDtOpenPalette(dtColorBtn, 'fg', pendingDt.color, (val) => {
                    pendingDt.color = val;
                    dtSetSwatch(dtColorBtn, val);
                    dtPaint();
                });
            });
        }
        if (dtHlBtn) {
            dtHlBtn.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation();
                lfDtOpenPalette(dtHlBtn, 'bg', pendingDt.highlight, (val) => {
                    pendingDt.highlight = val;   // '' = Transparent
                    dtSetSwatch(dtHlBtn, val);
                    dtPaint();
                });
            });
        }
        const dtReset = document.getElementById('lf-dt-reset');
        if (dtReset) {
            dtReset.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation();
                pendingDt = Object.assign({}, LF_DT_DEFAULT, { enabled: pendingDt.enabled });
                document.querySelectorAll('.lf-dt-tbtn').forEach(b => b.classList.remove('on'));
                if (dtSize) dtSize.value = String(LF_DT_DEFAULT.size);
                if (dtFont) dtSetFontBtn('');
                // Keep an open font list's highlight in sync with the reset
                document.querySelectorAll('.lf-dt-fontlist .lf-dt-fontitem').forEach(o => {
                    o.classList.toggle('sel', (o.dataset.css || '') === '');
                });
                dtSetSwatch(dtColorBtn, LF_DT_DEFAULT.color);
                dtSetSwatch(dtHlBtn, '');
                dtPaint();
            });
        }

        // v100.9.52: to-do email templates
        const etBorrowerToggle = document.getElementById('lf-et-borrower-toggle');
        if (etBorrowerToggle) {
            etBorrowerToggle.addEventListener('change', (e) => {
                localStorage.setItem('lf_email_tpl_borrower_on', e.target.checked);
                showToast(e.target.checked ? 'Borrower template will be applied automatically' : 'Borrower template off');
            });
        }
        const etEscrowToggle = document.getElementById('lf-et-escrow-toggle');
        if (etEscrowToggle) {
            etEscrowToggle.addEventListener('change', (e) => {
                localStorage.setItem('lf_email_tpl_escrow_on', e.target.checked);
                showToast(e.target.checked ? 'Escrow template will be applied automatically' : 'Escrow template off');
            });
        }
        const etBorrowerEdit = document.getElementById('lf-et-borrower-edit');
        if (etBorrowerEdit) etBorrowerEdit.addEventListener('click', (e) => { e.preventDefault(); lfEtOpenEditor('borrower'); });
        const etEscrowEdit = document.getElementById('lf-et-escrow-edit');
        if (etEscrowEdit) etEscrowEdit.addEventListener('click', (e) => { e.preventDefault(); lfEtOpenEditor('escrow'); });


        // v100.9.21: System warning notice - applies immediately
        const warnToggle = document.getElementById('lf-warn-notice-toggle');
        if (warnToggle) {
            warnToggle.addEventListener('change', (e) => {
                localStorage.setItem('lf_disable_warning_notice', e.target.checked);
                if (e.target.checked) {
                    showToast('System warning notices will be closed automatically');
                    try { lfDismissWarningNotice(); } catch (err) {}
                } else {
                    // let the next one through again
                    document.querySelectorAll('[data-lf-warn-done]').forEach(el => { delete el.dataset.lfWarnDone; });
                    showToast('System warning notices will be shown again');
                }
            });
        }

        // v100.9.20: preset buttons. These drive the very same pendingDt object and UI
        // sync as the manual controls, so the preview updates instantly and the value
        // is persisted by the existing Save button - nothing new to remember.
        document.querySelectorAll('.lf-dt-preset').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation();
                const preset = LF_DT_PRESETS.find(p => p.name === btn.dataset.preset);
                if (!preset) return;

                pendingDt = Object.assign({}, pendingDt, preset.style);

                // reflect it in every control
                document.querySelectorAll('.lf-dt-tbtn').forEach(b => {
                    b.classList.toggle('on', !!pendingDt[b.dataset.dt]);
                });
                if (dtSize) dtSize.value = String(pendingDt.size);
                if (dtFont) dtSetFontBtn(pendingDt.font);
                document.querySelectorAll('.lf-dt-fontlist .lf-dt-fontitem').forEach(o => {
                    o.classList.toggle('sel', (o.dataset.css || '') === (pendingDt.font || ''));
                });
                dtSetSwatch(dtColorBtn, pendingDt.color);
                dtSetSwatch(dtHlBtn, pendingDt.highlight);
                dtPaint();

                document.querySelectorAll('.lf-dt-preset').forEach(b => b.classList.remove('applied'));
                btn.classList.add('applied');
                showToast(`Preset "${preset.name}" applied \u2013 press Save Settings to keep it`);
            });
        });

        autoToggle.addEventListener('change', (e) => {
            if (e.target.checked) {
                autoHoursContainer.classList.remove('hidden');
                autoHoursContainer.classList.add('visible');
            } else {
                autoHoursContainer.classList.remove('visible');
                autoHoursContainer.classList.add('hidden');
            }
        });

        // v100.8.49: Borrower Name Color - toggle animation + swatch selection
        const nameColorToggle = document.getElementById('lf-name-color-toggle');
        const nameColorContainer = document.getElementById('lf-name-color-container');
        const nameColorPicker = document.getElementById('lf-name-color-picker');
        if (nameColorToggle && nameColorContainer) {
            nameColorToggle.addEventListener('change', (e) => {
                if (e.target.checked) {
                    nameColorContainer.classList.remove('hidden');
                    nameColorContainer.classList.add('visible');
                } else {
                    nameColorContainer.classList.remove('visible');
                    nameColorContainer.classList.add('hidden');
                }
            });
        }
        const lfMarkActiveNameSwatch = (hex) => {
            document.querySelectorAll('.lf-name-swatch[data-name-color]').forEach(s => {
                s.classList.toggle('active', (s.dataset.nameColor || '').toLowerCase() === (hex || '').toLowerCase());
            });
        };
        document.querySelectorAll('.lf-name-swatch[data-name-color]').forEach(sw => {
            sw.addEventListener('click', () => {
                const hex = sw.dataset.nameColor;
                localStorage.setItem('lf_name_color_value', hex);
                if (nameColorPicker) nameColorPicker.value = hex;
                lfMarkActiveNameSwatch(hex);
                lfRefreshNameColorState();
            });
        });
        if (nameColorPicker) {
            nameColorPicker.addEventListener('input', (e) => {
                localStorage.setItem('lf_name_color_value', e.target.value);
                lfMarkActiveNameSwatch(e.target.value);
                lfRefreshNameColorState();
            });
        }

        saveBtn.addEventListener('click', () => {
            localStorage.setItem('lf_auto_avail_enabled', autoToggle.checked);
            localStorage.setItem('lf_auto_avail_start', startInput.value);
            localStorage.setItem('lf_auto_avail_end', endInput.value);
            localStorage.setItem('lf_auto_avail_msg', msgInput.value);

            if (autoNavToggle) {
                localStorage.setItem('lf_auto_nav_enabled', autoNavToggle.checked);
            }

            if (autoSidebarToggle) {
                localStorage.setItem('lf_auto_sidebar_enabled', autoSidebarToggle.checked);
            }

            // v100.8.39: persist the chosen global search hotkey
            localStorage.setItem('lf_search_hotkey_key', pendingHotkey.key);
            localStorage.setItem('lf_search_hotkey_code', pendingHotkey.code);

            // v100.8.49: persist borrower name-color enable/disable (color is saved on click)
            if (nameColorToggle) localStorage.setItem('lf_name_color_enabled', nameColorToggle.checked);
            lfRefreshNameColorState();

            // v100.8.60: persist the default text style
            lfDtSave(pendingDt);
            lfDtCloseFontList(); // v100.8.70: the font list stays open until Save

            const textSpan = saveBtn.querySelector('span');
            const originalText = textSpan.innerText;
            textSpan.innerText = 'Saved!';
            saveBtn.style.background = 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)';
            saveBtn.style.boxShadow = '0 2px 4px rgba(40, 167, 69, 0.4)';
            setTimeout(() => {
                textSpan.innerText = originalText;
                saveBtn.style.background = '';
                saveBtn.style.boxShadow = '';
            }, 1500);
            showToast('Settings Saved');
        });

        // Colors listeners
        ['purple', 'green', 'yellow', 'blue', 'red', 'new'].forEach(statusKey => {
            updateActiveSwatch(statusKey);

            document.querySelectorAll(`[data-row-status="${statusKey}"] .lf-swatch:not(.lf-swatch-picker)`).forEach(sw => {
                sw.addEventListener('click', () => {
                    localStorage.setItem(`lf_color_${statusKey}`, sw.dataset.color);
                    applyColor(statusKey, sw.dataset.color);
                    updateActiveSwatch(statusKey);
                });
            });
            document.querySelector(`input[data-picker-status="${statusKey}"]`).addEventListener('input', (e) => {
                localStorage.setItem(`lf_color_${statusKey}`, e.target.value);
                applyColor(statusKey, e.target.value);
                updateActiveSwatch(statusKey);
            });
        });
        document.querySelectorAll('.lf-theme-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const themeData = THEMES[btn.dataset.theme];
                for (const [k, hex] of Object.entries(themeData)) {
                    localStorage.setItem(`lf_color_${k}`, hex);
                    applyColor(k, hex);
                    updateActiveSwatch(k);
                }
            });
        });

        // --- PERSISTENT TURN TIME SORTING MUTATION OBSERVER ---
        const menuObserver = new MutationObserver((mutations) => {
            for (let mutation of mutations) {
                if (mutation.addedNodes.length) {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === 1) {
                            const dropdowns = node.classList && node.classList.contains('dropdown-menu')
                                            ? [node]
                                            : node.querySelectorAll('.dropdown-menu');

                            dropdowns.forEach(menu => {
                                // v100.8.74: only offer "Turn time" sorting while the
                                // feature is on and the selected role has rules
                                if (!lfTtActive()) {
                                    menu.querySelectorAll('.lf-tt-custom').forEach(el => el.remove());
                                    return;
                                }
                                if (menu.textContent.includes('Created - ASC') && !menu.querySelector('.lf-tt-custom')) {

                                    const divider = document.createElement('div');
                                    divider.className = 'dropdown-divider lf-tt-custom';
                                    menu.appendChild(divider);

                                    const optAsc = document.createElement('a');
                                    optAsc.className = 'dropdown-item lf-tt-custom';
                                    optAsc.href = 'javascript:void(0);';
                                    optAsc.innerHTML = 'Turn time - ASC';
                                    optAsc.style.cssText = 'color: #17a2b8; font-weight: bold; cursor: pointer;';

                                    const optDesc = document.createElement('a');
                                    optDesc.className = 'dropdown-item lf-tt-custom';
                                    optDesc.href = 'javascript:void(0);';
                                    optDesc.innerHTML = 'Turn time - DESC';
                                    optDesc.style.cssText = 'color: #17a2b8; font-weight: bold; cursor: pointer;';

                                    optAsc.onclick = (e) => {
                                        e.preventDefault(); e.stopPropagation();
                                        currentCustomSort = 'asc';
                                        localStorage.setItem('lf_custom_sort_pref', 'asc');
                                        updateMainBtn('Turn time - ASC');
                                        sortTableByTurnTime(true);
                                        document.body.click();
                                    };

                                    optDesc.onclick = (e) => {
                                        e.preventDefault(); e.stopPropagation();
                                        currentCustomSort = 'desc';
                                        localStorage.setItem('lf_custom_sort_pref', 'desc');
                                        updateMainBtn('Turn time - DESC');
                                        sortTableByTurnTime(false);
                                        document.body.click();
                                    };

                                    menu.appendChild(optAsc);
                                    menu.appendChild(optDesc);

                                    Array.from(menu.querySelectorAll('.dropdown-item:not(.lf-tt-custom)')).forEach(nativeOpt => {
                                        nativeOpt.addEventListener('click', () => {
                                            currentCustomSort = '';
                                            localStorage.removeItem('lf_custom_sort_pref');
                                        });
                                    });
                                }
                            });
                        }
                    });
                }
            }
        });
        menuObserver.observe(document.body, { childList: true, subtree: true });

        // v100.9.28: the panel's contents arrive after the panel element itself, so
        // react to it appearing AND to its contents changing, then re-check on a
        // short ladder while it settles.
        let lfModalPassQueued = false;
        function lfQueueModalPass() {
            if (lfModalPassQueued) return;
            lfModalPassQueued = true;
            requestAnimationFrame(() => {
                lfModalPassQueued = false;
                try { lfInjectModalCopyButtons(); } catch (e) {}
            });
        }

        const LF_MODAL_SEL = '.modal.show, .modal[style*="display: block"], .ui-dialog[style*="display: block"], div[role="dialog"]';

        new MutationObserver((muts) => {
            for (const m of muts) {
                if (m.target && m.target.closest && m.target.closest(LF_MODAL_SEL)) { lfQueueModalPass(); return; }
                for (const n of m.addedNodes) {
                    if (n.nodeType !== 1) continue;
                    if ((n.matches && n.matches(LF_MODAL_SEL)) || (n.closest && n.closest(LF_MODAL_SEL)) ||
                        (n.querySelector && n.querySelector(LF_MODAL_SEL))) {
                        lfQueueModalPass();
                        [40, 120, 250, 500, 900].forEach(ms => setTimeout(() => {
                            try { lfInjectModalCopyButtons(); } catch (e) {}
                        }, ms));
                        return;
                    }
                }
            }
        }).observe(document.body, { childList: true, subtree: true, characterData: true });

        lfQueueModalPass();

        // ==========================================
        // MASTER LOOP 1: UI & TABLES (Runs every 1000ms)
        // ==========================================
        setInterval(() => {
            if (lfSelectionBusy()) return;   // v100.8.92: never touch the DOM mid-selection
            const url = window.location.href;

            // 1. Table Processing
            const tables = document.querySelectorAll('table');
            const now = new Date(); now.setHours(0, 0, 0, 0);

            tables.forEach(table => {
                try {
                    const isModal = table.closest('.modal') || table.closest('.ui-dialog') || table.closest('.offcanvas');

                    // --- LIABILITIES COPIER (v100.8.35: live count in label + skips rows where BOTH Unpaid balance and Monthly payment are $0) ---
                    if (!isModal && table.textContent.includes('Creditor name') && table.textContent.includes('Liability/Expense type')) {
                        if (!table.previousElementSibling || table.previousElementSibling.id !== 'custom-lf-copy-btn') {
                            const btn = document.createElement('button');
                            btn.id = 'custom-lf-copy-btn';
                            btn.innerHTML = `<span class="lf-svg-container">${COPY_SVG}</span><span id="custom-lf-copy-text">Copy Liabilities</span>`;
                            btn.onclick = (e) => {
                                e.preventDefault(); e.stopPropagation();
                                const { rows, skipped } = getCopyableLiabilityRows(table);
                                const tsvData = rows.map(r => {
                                    const cells = r.querySelectorAll('td');
                                    const rowData = [];
                                    for (let j = 1; j <= 7; j++) rowData.push(cells[j] ? cells[j].innerText.replace(/\r?\n|\r/g, ' ').replace(/\t/g, ' ').trim() : '');
                                    return rowData.join('\t');
                                });
                                const ta = document.createElement("textarea"); ta.value = tsvData.join('\n');
                                ta.style.position = 'fixed'; ta.style.left = '-9999px'; document.body.appendChild(ta);
                                ta.focus(); ta.select();
                                try {
                                    document.execCommand('copy');
                                    btn.querySelector('#custom-lf-copy-text').textContent = 'Copied!';
                                    btn.querySelector('.lf-svg-container').innerHTML = CHECK_SVG;
                                    showToast(`Copied ${tsvData.length} liabilit${tsvData.length === 1 ? 'y' : 'ies'}` + (skipped > 0 ? ` (skipped ${skipped} with $0/$0)` : ''));
                                    setTimeout(() => {
                                        btn.querySelector('#custom-lf-copy-text').textContent = `Copy Liabilities (${getCopyableLiabilityRows(table).rows.length})`;
                                        btn.querySelector('.lf-svg-container').innerHTML = COPY_SVG;
                                    }, 1000);
                                } catch (err) {} finally { document.body.removeChild(ta); }
                            };
                            table.parentNode.insertBefore(btn, table);
                        }

                        // v100.8.35: keep the button label showing a LIVE count of copyable rows,
                        // e.g. "Copy Liabilities (3)" - updates automatically as the table changes.
                        const copyBtnEl = (table.previousElementSibling && table.previousElementSibling.id === 'custom-lf-copy-btn') ? table.previousElementSibling : null;
                        if (copyBtnEl) {
                            const labelSpan = copyBtnEl.querySelector('#custom-lf-copy-text');
                            if (labelSpan && labelSpan.textContent !== 'Copied!') {
                                const liveCount = getCopyableLiabilityRows(table).rows.length;
                                const wanted = `Copy Liabilities (${liveCount})`;
                                if (labelSpan.textContent !== wanted) labelSpan.textContent = wanted;
                            }
                        }

                        // Inject sort arrows into the liabilities header row.
                        // Runs every pass so arrows are re-added if the app re-renders the table.
                        injectLiabilitySorters(table);
                    }

                    if (isModal) return;

                    // v100.8.51: Employment table sorters (Employer or Business Name,
                    // Monthly income, Start date, End date). Returns immediately for any
                    // table that isn't the employment table. Runs every pass so the arrows
                    // survive re-renders.
                    try { injectEmploymentSorters(table); } catch (e) {}

                    const thead = table.querySelector('thead');
                    if (!thead && !table.dataset.empProcessed) return;

                    const headersText = Array.from(table.querySelectorAll('th, td.header, thead td')).map(h => (h.textContent || '').toLowerCase().trim());

                    const statusIdx = headersText.findIndex(h => h.includes('status'));
                    const dueIdx = headersText.findIndex(h => h.includes('due') || h.includes('deadline'));
                    const empIdx = headersText.findIndex(h => ['employer or business name', 'company name', 'employer name', 'employer'].includes(h));
                    const borrowerIdx = headersText.findIndex(h => h.includes('borrower') || h === 'name');

                    const rows = table.querySelectorAll('tbody tr, tr');
                    rows.forEach(row => {
                        if (row.querySelector('th') || row.closest('thead')) return;
                        const tds = row.children;

                        // Pipeline Colors
                        if (statusIdx > -1 && tds[statusIdx]) {
                            let statusText = tds[statusIdx].textContent || '';
                            tds[statusIdx].querySelectorAll('select').forEach(sel => { if(sel.options[sel.selectedIndex]) statusText += ' ' + sel.options[sel.selectedIndex].text; });
                            statusText = statusText.toLowerCase();
                            let targetColor = 'lf-row-new';
                            for (const [color, keywords] of Object.entries(STATUS_MAP)) {
                                if (keywords.some(k => statusText.includes(k))) { targetColor = `lf-row-${color}`; break; }
                            }
                            if (!row.classList.contains(targetColor)) {
                                row.classList.remove('lf-row-green', 'lf-row-yellow', 'lf-row-blue', 'lf-row-red', 'lf-row-purple', 'lf-row-new');
                                row.classList.add(targetColor);
                            }
                        }

                        // Due Date Highlighting
                        if (dueIdx > -1 && tds[dueIdx] && !tds[dueIdx].querySelector('.lf-due-alert')) {
                            const txt = (tds[dueIdx].textContent || '').trim();
                            const m = txt.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
                            if (m) {
                                const d = new Date(parseInt(m[3]), parseInt(m[1]) - 1, parseInt(m[2]));
                                d.setHours(0, 0, 0, 0);
                                if (d < now) { tds[dueIdx].style.color = '#dc2626'; tds[dueIdx].style.fontWeight = 'bold'; tds[dueIdx].title = 'Overdue!'; }
                                else if (d.getTime() === now.getTime()) { tds[dueIdx].style.color = '#e67e22'; tds[dueIdx].style.fontWeight = 'bold'; tds[dueIdx].title = 'Due Today!'; }
                            }
                        }

                        // Employment Copy
                        if (empIdx > -1 && tds[empIdx]) {
                            table.dataset.empProcessed = "true";
                            // v100.8.48: copy ONLY the business name, not the "Missing: ..." sub-text
                            const cText = getEmployerName(tds[empIdx]);
                            if (cText && tds[empIdx].colSpan <= 1 && !cText.toLowerCase().includes('total') && !cText.toLowerCase().includes('position') && !cText.toLowerCase().startsWith('missing')) {
                                injectInlineCopyBtn(tds[empIdx], cText, true);
                            }
                        }

                        // Loan Number Copy
                        if (borrowerIdx > -1 && tds[borrowerIdx] && !tds[borrowerIdx].querySelector('.lf-copy-btn')) {
                            const walker = document.createTreeWalker(tds[borrowerIdx], NodeFilter.SHOW_TEXT, null, false);
                            let node;
                            while ((node = walker.nextNode())) {
                                const m = node.nodeValue.match(/\b(?:[A-Za-z]{1,5}\d{4,15}|\d{6,15}|\d{2,6}-\d{4,10})\b/);
                                if (m && !node.parentNode.querySelector('.lf-copy-btn')) {
                                    injectInlineCopyBtn(node, m[0], false); break;
                                }
                            }
                        }

                        // v100.8.50: Borrower NAME copy button + optional name recolor.
                        // Uses the name's own <span class="lf-bname"> wrapper (NOT the cell's
                        // anchor, which can be the icon-only "open in new tab" link).
                        if (borrowerIdx > -1 && tds[borrowerIdx]) {
                            const nameSpan = lfEnsureBorrowerNameSpan(tds[borrowerIdx]);
                            if (nameSpan) {
                                const nameText = (nameSpan.textContent || '').trim();

                                // 1) Copy button immediately to the RIGHT of the name,
                                //    which leaves the app's new-tab icon further right.
                                if (nameText && !tds[borrowerIdx].querySelector('.lf-name-copy-btn')) {
                                    const nb = document.createElement('button');
                                    nb.className = 'lf-name-copy-btn lf-icon-btn';
                                    nb.setAttribute('data-copy-text', nameText);
                                    nb.innerHTML = COPY_SVG;
                                    nb.title = 'Copy borrower name';
                                    nb.onclick = async (e) => {
                                        e.preventDefault(); e.stopPropagation();
                                        try {
                                            await navigator.clipboard.writeText(nameText);
                                            nb.innerHTML = CHECK_SVG;
                                            showToast(`Copied: ${nameText}`);
                                            setTimeout(() => { nb.innerHTML = COPY_SVG; }, 1000);
                                        } catch (err) {}
                                    };
                                    nameSpan.parentNode.insertBefore(nb, nameSpan.nextSibling);
                                }

                                // Keep the stored/copied text in sync if the row is re-rendered
                                const existingBtn = tds[borrowerIdx].querySelector('.lf-name-copy-btn');
                                if (existingBtn && nameText && existingBtn.getAttribute('data-copy-text') !== nameText) {
                                    existingBtn.remove();
                                }

                                // 2) Recolor ONLY the name span when enabled AND this file
                                //    has NO follow-up flag ("FU on ...").
                                if (lfNameColorEnabled && !/\bFU\s*on\b/i.test(row.textContent || '')) {
                                    if (nameSpan.style.color !== lfNameColorValue) {
                                        nameSpan.style.setProperty('color', lfNameColorValue, 'important');
                                    }
                                } else if (nameSpan.style.color) {
                                    nameSpan.style.removeProperty('color');
                                }
                            }
                        }

                        // SLA Timers
                        if (lfTtActive() && (url.includes('/escalation_desk') || url.includes('/pipeline'))) {
                            const dateRegex = /(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])\/\d{4}\s+(0?[1-9]|1[0-2]):\d{1,2}\s+(AM|PM)/i;
                            let targetCell = Array.from(tds).find(td => dateRegex.test(td.innerText));
                            if (targetCell) {
                                const ttRuleNow = lfTtRule();
                                const fromAssign = ttRuleNow.startFrom === 'assign';
                                // v100.8.93: the disclose-due override depends on the status,
                                // so a status change has to force a recalculation.
                                const stNow = lfRowStatusText(row);
                                if (row.dataset.lfStatusSeen !== stNow) {
                                    row.dataset.lfStatusSeen = stNow;
                                    delete row.dataset.dueDate; delete row.dataset.dueDateFormatted;
                                }
                                if (!row.dataset.dueDate) {
                                    // v100.8.77: the clock starts at the created time
                                    // (Underwriter) or the cached assign time (Disclosure
                                    // Specialist - captured from Action -> Audit log).
                                    let startDate = null;
                                    // v100.8.80: the app's "X hour(s) ago" text under the
                                    // created time is noise - strip it in BOTH modes.
                                    const stripAgo = (cell) => {
                                        const w = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT, null, false);
                                        let n; while ((n = w.nextNode())) { if (/(?:\d+\s+(?:minute|hour|day|month)\(s\)\s*)+ago/ig.test(n.nodeValue)) n.nodeValue = n.nodeValue.replace(/(?:\d+\s+(?:minute|hour|day|month)\(s\)\s*)+ago/ig, ''); }
                                    };
                                    if (fromAssign) {
                                        stripAgo(targetCell);
                                        const rec = lfDsAssignGetRow(row);   // v100.8.97
                                        if (rec && rec.t) startDate = new Date(rec.t);
                                    } else {
                                        const matchArr = targetCell.innerText.match(dateRegex);
                                        if (matchArr) {
                                            startDate = new Date(normalizeDateStr(matchArr[0].replace(/\n/g, ' ')));
                                            stripAgo(targetCell);
                                        }
                                    }
                                    if (startDate && !isNaN(startDate.getTime())) {
                                        const slaHours = ttRuleNow.hours(row.innerText);
                                        let dObj = addBusinessHours(startDate, slaHours);
                                        // v100.8.89: a disclose due date caps the turn time -
                                        // if the SLA would land later, pull it back to 6:00 PM
                                        // on the chosen date.
                                        // v100.8.95: store the RAW SLA result. The disclose-due
                                        // override is applied at render time (below) so it also
                                        // takes effect on rows whose due date was already cached.
                                        row.dataset.slaDueRaw = dObj.getTime();
                                        row.dataset.dueDate = dObj.getTime(); row.dataset.dueDateFormatted = formatDueDate(dObj);
                                    }
                                }
                                if (row.dataset.dueDate) {
                                    // ==========================================
                                    // v100.8.98: DISCLOSE-DUE OVERRIDE, applied every pass.
                                    // If BOTH hold:
                                    //   a. status is "In progress" or "Waiting for further information"
                                    //   b. a disclose due date has been set
                                    // then the due date BECOMES 6:00 PM on that date - even when
                                    // the current due time is earlier. Any other status keeps the
                                    // older behaviour of only pulling a later date back.
                                    // ==========================================
                                    // v100.9.18: the disclose due belongs to the Disclosure
                                    // Specialist role only - Underwriter turn times are never
                                    // altered by it.
                                    const ddCapNow = (lfTtRole() === 'disclosure') ? lfDdCapDate(lfDdGetRow(row)) : null;
                                    if (ddCapNow) {
                                        const rawMs = parseInt(row.dataset.slaDueRaw || row.dataset.dueDate);
                                        const stNowTxt = lfRowStatusText(row).toLowerCase();
                                        const qualifies = /in\s*progress/.test(stNowTxt) || /waiting\s+for\s+further\s+information/.test(stNowTxt);
                                        let effMs = rawMs;
                                        if (qualifies) effMs = ddCapNow.getTime();
                                        else if (rawMs > ddCapNow.getTime()) effMs = ddCapNow.getTime();
                                        if (String(effMs) !== row.dataset.dueDate) {
                                            row.dataset.dueDate = String(effMs);
                                            row.dataset.dueDateFormatted = formatDueDate(new Date(effMs));
                                        }
                                    } else if (row.dataset.slaDueRaw && row.dataset.dueDate !== row.dataset.slaDueRaw) {
                                        // disclose due was removed - fall back to the plain SLA date
                                        row.dataset.dueDate = row.dataset.slaDueRaw;
                                        row.dataset.dueDateFormatted = formatDueDate(new Date(parseInt(row.dataset.slaDueRaw)));
                                    }

                                    const dObj = new Date(parseInt(row.dataset.dueDate)), diffRaw = dObj.getTime() - new Date().getTime(), isOver = diffRaw < 0, diff = Math.abs(diffRaw);
                                    const h = Math.floor(diff / 3600000), m = Math.floor((diff % 3600000) / 60000);
                                    let tText = (h >= 24) ? `${Math.floor(h/24)} day(s) ${h%24} hr(s) ${m} min` : `${h} hr(s) ${m} min`;
                                    tText += isOver ? " overdue" : " left";
                                    let bc = targetCell.querySelector('.sla-badge-container');
                                    if (!bc) { bc = document.createElement('div'); bc.className = 'sla-badge-container'; bc.style.cssText = "display:block; margin-top:5px;"; targetCell.appendChild(bc); }
                                    // v100.8.44: SLA countdown as a pill badge - red = overdue, amber = under 2h left, blue = on track
                                    const pillBg = isOver ? '#d9534f' : (diffRaw < 7200000 ? '#e67e22' : '#009ef7');
                                    // v100.8.78: for the assign-time role, show "Assigned:"
                                    // above "Due:" (both sit under the app's created time)
                                    let assignedLine = '';
                                    if (fromAssign) {
                                        const rec = lfDsAssignGetRow(row);   // v100.8.97
                                        if (rec && rec.t) assignedLine = `<div style="color:#5b21b6; font-weight:800; font-size:13px; margin-bottom:2px;">Assigned: ${formatDueDate(new Date(rec.t))}</div>`;
                                    }
                                    // v100.8.96: mark the Due line when it is being driven by
                                    // the disclose due, so it is obvious the override applied
                                    const ddDriven = !!(ddCapNow && parseInt(row.dataset.dueDate) === ddCapNow.getTime());
                                    const dueMark = ddDriven ? ' <span style="font-size:10px; font-weight:800; color:#d6336c;">(disclose due)</span>' : '';
                                    const html = `${assignedLine}<div style="color:#e67e22; font-weight:bold; font-size:14px; margin-bottom:3px;">Due: ${row.dataset.dueDateFormatted}${dueMark}</div><span style="display:inline-block; padding:2px 10px; border-radius:10px; background:${pillBg}; color:#ffffff; font-weight:700; font-size:12px; white-space:nowrap;">${tText}</span>`;
                                    if (bc.innerHTML !== html) bc.innerHTML = html;
                                } else if (fromAssign) {
                                    // v100.8.77: no assign time cached for this ticket yet.
                                    // v100.8.78: the pill is now a button that does it for you.
                                    let bc = targetCell.querySelector('.sla-badge-container');
                                    if (!bc) { bc = document.createElement('div'); bc.className = 'sla-badge-container'; bc.style.cssText = "display:block; margin-top:5px;"; targetCell.appendChild(bc); }
                                    // v100.8.79: built as a real element with its own
                                    // handler (belt and braces alongside the delegated one)
                                    if (!bc.querySelector('.lf-ds-start-btn')) {
                                        bc.innerHTML = '';
                                        const pill = document.createElement('span');
                                        pill.className = 'lf-ds-start-btn';
                                        pill.textContent = '\u23F1 open Audit log to start';
                                        pill.title = 'Click: opens Action \u2192 Audit log, saves the assign time and closes it again';
                                        pill.style.cssText = 'display:inline-block; padding:3px 10px; border-radius:10px; background:#e2e8f0; color:#475569; font-weight:700; font-size:11px; white-space:nowrap; cursor:pointer;';
                                        pill.onmouseenter = () => { pill.style.background = '#cbd5e1'; };
                                        pill.onmouseleave = () => { pill.style.background = '#e2e8f0'; };
                                        pill.onclick = (ev) => { ev.preventDefault(); ev.stopPropagation(); lfDsAutoOpenAudit(row); };
                                        bc.appendChild(pill);
                                    }
                                }
                            }
                        }
                    });
                } catch (e) {
                    console.error("[LF Optimizer] Table processing error:", e);
                }
            });

            // 1.5 Header Copy Buttons (v100.8.34): Borrower name + Loan number, Property address
            try { injectHeaderCopyButtons(); } catch (e) { console.error("[LF Optimizer] Header copy button error:", e); }

            // 1.6 Bonus Details modal (v100.8.65): Loan # copy buttons + Funded Date sorter
            try { lfBonusDetailsEnhance(); } catch (e) { console.error("[LF Optimizer] Bonus details error:", e); }

            // 2. Isolated Employment Labels
            try {
                Array.from(document.querySelectorAll('td, th, dt, dd, span, div, strong, b, label')).forEach(el => {
                    if (el.children.length > 1 && el.tagName !== 'TD') return;
                    if (el.tagName === 'TH' || el.closest('thead') || el.closest('table[data-emp-processed="true"]')) return;
                    const text = (el.textContent || '').toLowerCase().trim();
                    if (['employer or business name', 'employer name', 'company name', 'employer'].some(l => text === l || text === l + ':')) {
                        let vEl = el.nextElementSibling;
                        if (!vEl) {
                            if (el.tagName === 'TD') {
                                const tr = el.closest('tr');
                                if (tr && tr.cells.length > el.cellIndex+1) vEl = tr.cells[el.cellIndex+1];
                            } else {
                                const parent = el.parentElement;
                                if (parent && parent.children.length > 1) {
                                    const index = Array.from(parent.children).indexOf(el);
                                    if (index > -1 && index + 1 < parent.children.length) vEl = parent.children[index + 1];
                                }
                            }
                        }
                        if (vEl) {
                            const cText = getCleanText(vEl).toLowerCase();
                            if (cText && !cText.includes('position') && !cText.includes('total')) injectInlineCopyBtn(vEl, getCleanText(vEl), true);
                        }
                    }
                });
            } catch (e) { console.error("[LF Optimizer] Employment isolated label error:", e); }

            // 3+4. Loan summary copy buttons (v100.9.28)
            try { lfInjectModalCopyButtons(); } catch (e) { console.error('[LF Optimizer] Modal copy button error:', e); }

        }, 1000);

        // ==========================================
        // MASTER LOOP 2: FAST CHECKS (Runs every 500ms)
        // ==========================================
        setInterval(() => {
            // 0. Keep the Clean Paste suspension state machine updated (v100.8.38).
            // This must run continuously - the popup may be replaced by the compose
            // window BEFORE the user ever pastes, so arming can't wait for a paste event.
            try { isCleanPasteSuspended(); } catch (err) {}

            // v100.9.28: before the selection guard on purpose. Nothing is inserted
            // unless a button is actually missing, so this is inert during a
            // selection - but a button lost to a re-render returns within 500ms.
            try { lfInjectModalCopyButtons(); } catch (err) {}

            if (lfSelectionBusy()) return;   // v100.8.92

            // 0.6 Assign-time capture (v100.8.77): reads an open Audit log / History
            // dialog and caches the ticket's assign time for Disclosure Specialist SLA
            try { if (lfTtRule().startFrom === 'assign') lfDsCaptureAssignTime(null, true); } catch (err) {}

            // 0.7 Bulk assign-time button above the "Created" header (v100.8.81)
            try { lfDsInjectBulkButton(); } catch (err) {}

            // 0.8 Row chips: "Resubmit" + "Due: mm/dd" disclose due (v100.8.89)
            try { lfInjectRowChips(); } catch (err) {}

            // 0.9 "Pop-up" button on the Escalation desk loan summary (v100.8.84)
            try { lfInjectSummaryPopupBtn(); } catch (err) {}
            try { lfInjectRealEstateCopyButtons(); } catch (err) {}  // v100.9.29
            try { lfInjectTodoDropZones(); } catch (err) {}          // v100.9.36
            try { lfGsSync(); } catch (err) {}                       // v100.9.42
            try { lfEtInjectButton(); } catch (err) {}               // v100.9.52

            // 1.0 Escalation desk copy buttons: borrower name + loan number (v100.8.85)
            try { lfEscInjectCopyButtons(); } catch (err) {}

            // 1.1 Repair any of our buttons nested inside interactive controls (v100.9.1)
            try { lfRepairNestedButtons(); } catch (err) {}

            // 1.15 Keep the app's own container as the cell root (v100.9.14)
            try { lfKeepCellRootNative(); } catch (err) {}

            // 1.17 Hide unwanted Action menu items (v100.9.17)
            try { lfHideUnwantedActions(); } catch (err) {}

            // 1.18 Auto-dismiss the portal's "WARNING NOTICE" modal (v100.9.19)
            try { lfDismissWarningNotice(); } catch (err) {}

            // 1.16 Re-place the chip row after the guard may have moved it (v100.9.14)
            try {
                document.querySelectorAll('tr .lf-chip-row').forEach(cr => {
                    const rowEl = cr.closest('tr');
                    if (!rowEl) return;
                    const plusNow = lfFindLabelsChip(rowEl);
                    if (plusNow && plusNow.parentNode) lfPlaceChipRow(cr, lfLabelGroupStart(plusNow));
                });
            } catch (err) {}

            // 1. Sidebar Collapser
            const autoSidebarEnabled = localStorage.getItem('lf_auto_sidebar_enabled') !== 'false'; // Checks the saved state (defaults to true)
            if (autoSidebarEnabled) {
                const pc = document.getElementById('page-container'), sbBtn = document.getElementById('__sidebar_collapse_btn') || document.querySelector('[data-click="sidebar-minify"]');
                if (pc && !pc.classList.contains('page-sidebar-minified')) { if(sbBtn) sbBtn.click(); pc.classList.add('page-sidebar-minified'); }
            }

            // 2. Auto-Navigate to All Docs
            const autoNavEnabled = localStorage.getItem('lf_auto_nav_enabled') === 'true'; // Checks the saved state
            if (autoNavEnabled) {
                let cFileId = null;
                for (let el of document.querySelectorAll('h1, h2, h3, h4, h5, strong, span, div')) {
                    if (el.children.length === 0 || el.textContent.length < 100) {
                        const m = el.textContent.trim().match(/(?:Loan|Application)\s*ID:\s*([0-9a-zA-Z-]+)/i);
                        if (m) { cFileId = m[1]; break; }
                    }
                }
                if (!cFileId) lastProcessedFileId = null;
                else if (cFileId !== lastProcessedFileId) {
                    const sLeafs = Array.from(document.querySelectorAll('span, a, div, p')).filter(e => e.children.length === 0);
                    const dItem = sLeafs.find(e => e.textContent.trim() === 'Documents' && e.offsetWidth > 0);
                    const allDItem = sLeafs.find(e => e.textContent.trim().toLowerCase() === 'all documents' && e.offsetWidth > 0);
                    if (allDItem) { hardClick(allDItem); lastProcessedFileId = cFileId; }
                    else if (dItem) { hardClick(dItem); }
                }
            } else {
                lastProcessedFileId = null; // Reset so if they toggle it on, it works immediately
            }

            // 3. LTV appending + summary capture
            // v100.9.16: the floating "Pop-Out Summary" button in the to-do view is gone.
            // The green "Pop-up" button that sits beside the summary's own X is better and
            // now appears on EVERY loan summary, so this duplicate was removed. The LTV
            // append and the saved-summary capture below are still needed.
            {
                const oMod = document.querySelector('.modal.show') || document.querySelector('.modal[style*="display: block"]');
                if (oMod && (oMod.textContent.toUpperCase().includes('LOAN SUMMARY') || oMod.textContent.toUpperCase().includes('BORROWER INFORMATION'))) {
                    const mContent = oMod.querySelector('.modal-content');
                    if (mContent && !mContent.textContent.includes('Loading...')) {
                        // v100.9.29: LTV is calculated now, and the Total row also
                        // carries the downpayment.
                        try { lfApplyLtvAndDownpayment(mContent); } catch (err) {}
                        localStorage.setItem('lf_saved_summary', mContent.innerHTML);
                    }
                }
            }
        }, 500);

        // ==========================================
        // MASTER LOOP 3: DROPDOWNS & SORTING (Runs every 1500ms)
        // ==========================================
        setInterval(() => {
            // v100.8.92: THIS is the loop that was breaking selections - it dispatches
            // change/focus on selects, which makes the app re-render the grid.
            if (lfSelectionBusy()) return;
            document.querySelectorAll('select').forEach(select => {
                const id = (select.id||'').toLowerCase(), name = (select.name||'').toLowerCase(), className = (select.className||'').toLowerCase();

                // Pipeline Limits Enforcer
                if (name === 'limit' && select.value !== '100') { select.value = '100'; select.dispatchEvent(new Event('change', {bubbles: true})); }
                else if (!id.includes('doc') && !name.includes('doc') && !className.includes('doc') && !id.includes('file') && !name.includes('file')) {
                    const vals = Array.from(select.options).map(o => o.text.trim());
                    if (vals.some(v => /^10$/.test(v)) && vals.some(v => /^100$/.test(v))) {
                        const curText = select.options[select.selectedIndex]?.text.trim() || '';
                        if (curText !== '' && !/^100/.test(curText)) {
                            let opt100 = Array.from(select.options).find(o => /^100/.test(o.text.trim()));
                            if (opt100) { select.value = opt100.value; /* v100.8.92: no focus/blur */ ['input','change'].forEach(e => select.dispatchEvent(new Event(e, {bubbles:true}))); }
                        }
                    }
                }

                // Priority Enforcer for Funded Status - REMOVED in v100.9.19.
                // This used to force Priority to "Lowest" whenever Status was set to
                // "Funded". Disabled at the user's request; the priority on a funded
                // loan is now left exactly as the user set it.
            });

            // Persistent Turn Time Sorting Execution
            if (currentCustomSort === 'asc') {
                sortTableByTurnTime(true);
                updateMainBtn('Turn time - ASC');
            }
            else if (currentCustomSort === 'desc') {
                sortTableByTurnTime(false);
                updateMainBtn('Turn time - DESC');
            }

        }, 1500);

        // ==========================================
        // AUTO-AVAILABILITY SYSTEM (Runs every 5000ms)
        // ==========================================
        setInterval(() => {
            if (isActionPending) return;

            // 1. ALWAYS UPDATE AVATAR RING FIRST
            const toggle = findAvailableCheckbox();
            const isCurrentlyOn = isToggleOn(toggle);

            const avatar = document.querySelector('.navbar-user img, #a__user img, .symbol img, img.rounded-circle');
            if (avatar) {
                avatar.style.borderRadius = '50%';
                avatar.style.boxShadow = isCurrentlyOn ? '0 0 0 3px #2ecc71, 0 0 12px rgba(46, 204, 113, 0.6)' : '0 0 0 3px #dc2626, 0 0 12px rgba(231, 76, 60, 0.6)';
            }

            // 2. NOW CHECK IF AUTO-TOGGLE IS ENABLED
            const autoEnabled = localStorage.getItem('lf_auto_avail_enabled') === 'true';
            if (!autoEnabled) return;

            const autoStartStr = localStorage.getItem('lf_auto_avail_start') || '09:00';
            const autoEndStr = localStorage.getItem('lf_auto_avail_end') || '18:00';
            const customMsg = localStorage.getItem('lf_auto_avail_msg') || 'out of office';

            const [startH, startM] = autoStartStr.split(':').map(Number);
            const [endH, endM] = autoEndStr.split(':').map(Number);

            const startMins = startH * 60 + startM;
            const endMins = endH * 60 + endM;

            const nowPST = getPSTTime();
            const hour = nowPST.getHours();
            const min = nowPST.getMinutes();
            const nowMins = hour * 60 + min;

            const day = nowPST.getDay();
            const isWeekend = (day === 0 || day === 6);

            let actionToTake = null;
            if (isWeekend) {
                actionToTake = 'turn_off';
            } else if (nowMins >= startMins && nowMins < endMins) {
                actionToTake = 'turn_on';
            } else {
                actionToTake = 'turn_off';
            }

            if (!actionToTake || ((actionToTake === 'turn_on' && isCurrentlyOn) || (actionToTake === 'turn_off' && !isCurrentlyOn))) return;

            isActionPending = true;
            let profileOpened = false;
            for (let tr of document.querySelectorAll('[data-kt-menu-trigger="click"], [data-toggle="dropdown"], .dropdown-toggle, .user-menu-toggle')) {
                const rect = tr.getBoundingClientRect(); if(rect.top < 100 && rect.left > window.innerWidth * 0.5) { tr.click(); profileOpened = true; break; }
            }
            if(!profileOpened && avatar) { (avatar.closest('.dropdown, .menu-item, a, button') || avatar).click(); }

            setTimeout(() => {
                const aToggle = findAvailableCheckbox();
                if (!aToggle) { isActionPending = false; return; }
                if (aToggle.tagName === 'INPUT') { const lbl = aToggle.closest('label'); if (lbl) lbl.click(); else aToggle.click(); } else aToggle.click();

                if (actionToTake === 'turn_off') {
                    let chk = 0, mInt = setInterval(() => {
                        chk++;
                        let mod = null;
                        for (let m of document.querySelectorAll('.modal, .ui-dialog, div[role="dialog"]')) {
                            if (m.offsetWidth>0 && m.offsetHeight>0 && ((m.textContent||'').includes('Reason you turn off') || (m.textContent||'').includes('available again'))) { mod = m; break; }
                        }
                        if (mod) {
                            clearInterval(mInt);
                            const ta = mod.querySelector('textarea'), dIn = Array.from(mod.querySelectorAll('input')).find(e=>e.offsetWidth>0&&e.type!=='hidden'&&e.type!=='submit'&&e.type!=='button');
                            if (ta && dIn) {
                                ta.focus(); if(ta.hasAttribute('readonly')) ta.removeAttribute('readonly'); ta.value = customMsg; ['input','change'].forEach(ev=>ta.dispatchEvent(new Event(ev,{bubbles:true})));
                                const nbDay = getNextBusinessDayPST(), tgtStr = String(nbDay.getDate()), needNxt = nbDay.getMonth() !== nowPST.getMonth();
                                dIn.focus(); dIn.click(); hardClick(dIn);
                                setTimeout(() => {
                                    if(needNxt) { const nx = document.querySelector('.datePickerMonthSelector .datePickerNextButton, .ui-datepicker-next, .flatpickr-next-month, th.next, [title="Next Month"]'); if(nx) nx.click(); }
                                    setTimeout(() => {
                                        let clicked = false;
                                        for (let cl of document.querySelectorAll('td.datePickerDay:not(.datePickerDayIsFiller), td[data-handler="selectDay"], .flatpickr-day:not(.prevMonthDay):not(.nextMonthDay), td.day:not(.old):not(.new)')) {
                                            if (cl.offsetWidth>0 && cl.textContent.trim() === tgtStr) { cl.click(); hardClick(cl); clicked=true; break; }
                                        }
                                        setTimeout(() => {
                                            const mt = mod.querySelector('.modal-title, .ui-dialog-title, .modal-header'); if(mt) mt.click();
                                            setTimeout(() => {
                                                const sBtn = Array.from(mod.querySelectorAll('button, input[type="submit"], a.btn')).find(e=>(e.textContent||'').toLowerCase().includes('submit'));
                                                if (sBtn) {
                                                    sBtn.removeAttribute('disabled'); sBtn.click(); hardClick(sBtn);
                                                    let wInt = setInterval(()=>{
                                                        if(!document.body.contains(mod)) {
                                                            clearInterval(wInt); document.body.click(); isActionPending=false;
                                                            setTimeout(()=>{ document.querySelectorAll('.modal, .ui-dialog, div[role="dialog"]').forEach(d=>{ if(d.textContent.includes('Associate will NOT be available')){ const ob=Array.from(d.querySelectorAll('button')).find(b=>b.textContent.trim().toLowerCase()==='ok'); if(ob){ob.click();hardClick(ob);} } }); }, 1500);
                                                        }
                                                    }, 500);
                                                    setTimeout(()=>{ clearInterval(wInt); isActionPending=false; }, 10000);
                                                } else isActionPending=false;
                                            }, 500);
                                        }, 500);
                                    }, needNxt?300:150);
                                }, 400);
                            } else isActionPending=false;
                        } else if(chk>=20) { clearInterval(mInt); isActionPending=false; }
                    }, 500);
                } else { setTimeout(() => { document.body.click(); isActionPending = false; }, 1500); }
            }, 1000);
        }, 5000);

        // ==========================================
        // KEYBOARD EVENT LISTENERS (Discard & Docs)
        // ==========================================
        document.addEventListener('keydown', function (e) {
            const isNote = isNoteDirty();
            if ((e.key === 'Escape' || e.code === 'Escape') && isNote) {
                e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
                // v100.8.35: if the confirm dialog is already open, Escape = "Keep Editing"
                const openDlg = document.getElementById('lf-confirm-dialog');
                if (openDlg) { openDlg.remove(); return; }
                showConfirmDialog(() => {
                    const am = document.querySelector('.modal.show, .ui-dialog[style*="display: block"]');
                    if (am) {
                        const cb = am.querySelector('[data-dismiss="modal"], .close');
                        if (cb) { const ed = document.querySelector('.note-editable, textarea[name*="note"], textarea[id*="note"]'); if (ed) { if(ed.tagName==='TEXTAREA')ed.value=''; else ed.innerHTML=''; } cb.click(); }
                    }
                });
            }
            // v100.8.39: configurable search hotkey (default \) - read live so a newly
            // saved hotkey applies immediately, no page reload needed
            const hkKey = localStorage.getItem('lf_search_hotkey_key') || '\\';
            const hkCode = localStorage.getItem('lf_search_hotkey_code') || 'Backslash';
            if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key === hkKey || e.code === hkCode)) {
                const aEl = document.activeElement; if (aEl && (aEl.tagName === 'INPUT' || aEl.tagName === 'TEXTAREA' || aEl.isContentEditable)) return;
                e.preventDefault();
                const si = document.getElementById('a__search'), st = document.querySelector('#a__search_intro a');
                if (si) { if(si.offsetWidth===0 || si.style.display==='none'){ if(st) st.click(); } setTimeout(()=>si.focus(), 100); }
                else if (st) st.click();
            }

            // Docs Shortcuts
            const getActiveEditor = () => {
                const a = document.activeElement; if(a && a.isContentEditable) return a;
                for(let i of document.querySelectorAll('iframe')){ try{ const d=i.contentDocument||i.contentWindow.document; if(d&&d.activeElement&&d.activeElement.isContentEditable) return i; }catch(err){} }
                return null;
            };
            const ed = getActiveEditor(); if (!ed) return;
            const doc = (ed.tagName === 'IFRAME') ? (ed.contentDocument || ed.contentWindow.document) : document;
            const ctrl = e.ctrlKey || e.metaKey, shift = e.shiftKey, alt = e.altKey, code = e.code;
            let triggered = false;

            if (ctrl && !shift && !alt && code === 'KeyK') {
                triggered = true;
                let lBtn = null;
                for (let sel of ['img[src*="link" i], img[src*="chain" i], img[alt*="link" i]', '[title*="Link" i], [aria-label*="Link" i], [data-tooltip*="Link" i]', 'button[title*="hyperlink" i], button[title*="Link" i]', '.gwt-Image[src*="link"], .gwt-Image[src*="chain"]']) { lBtn = document.querySelector(sel) || doc.querySelector(sel); if(lBtn) break; }
                if (lBtn) { (lBtn.closest('button, div[role="button"], td, .gwt-Button, .toolbar-button') || lBtn).click(); }
                else { const url = prompt('Enter URL:'); if (url) doc.execCommand('createLink', false, url); }
            }
            else if (ctrl && shift && code === 'Digit7') { triggered=true; doc.execCommand('insertOrderedList', false, null); }
            else if (ctrl && shift && code === 'Digit8') { triggered=true; doc.execCommand('insertUnorderedList', false, null); }
            else if (ctrl && shift && code === 'KeyL') { triggered=true; doc.execCommand('justifyLeft', false, null); }
            else if (ctrl && shift && code === 'KeyE') { triggered=true; doc.execCommand('justifyCenter', false, null); }
            else if (ctrl && shift && code === 'KeyR') { triggered=true; doc.execCommand('justifyRight', false, null); }
            else if (ctrl && !shift && code === 'BracketLeft') { triggered=true; doc.execCommand('outdent', false, null); }
            else if (ctrl && !shift && code === 'BracketRight') { triggered=true; doc.execCommand('indent', false, null); }
            else if (alt && shift && code === 'Digit5') { triggered=true; doc.execCommand('strikeThrough', false, null); }
            else if (ctrl && !shift && !alt && code === 'Backslash') { triggered=true; doc.execCommand('removeFormat', false, null); }
            else if (ctrl && shift && (code === 'Period' || code === 'Comma')) {
                triggered=true; const sel = doc.getSelection ? doc.getSelection() : window.getSelection();
                if(sel.rangeCount && !sel.isCollapsed) {
                    const r = sel.getRangeAt(0); let n = r.commonAncestorContainer; if(n.nodeType===3) n=n.parentNode;
                    const sp = doc.createElement('span'); sp.style.fontSize = `${Math.max(8, (parseInt(getComputedStyle(n).fontSize)||16) + (code==='Period'?2:-2))}px`;
                    try{ sp.appendChild(r.extractContents()); r.insertNode(sp); sel.removeAllRanges(); const nr = doc.createRange(); nr.selectNodeContents(sp); sel.addRange(nr); }catch(err){}
                }
            }
            else if (ctrl && !shift && !alt && code === 'KeyQ') {
                // v100.8.73: applies the saved "Default Text Style" (font, size, B/I/U,
                // text colour, highlight) instead of the old hardcoded bold purple.
                triggered = true;
                const dtS = lfDtLoad();
                const dtCss = lfDtStyleString(dtS, true);
                const sel2 = doc.getSelection ? doc.getSelection() : window.getSelection();
                if (!dtCss) {
                    showToast('No default text style set - configure it in the palette panel');
                } else if (sel2 && sel2.rangeCount && !sel2.isCollapsed) {
                    // Wrap the selection so every property applies at once
                    try {
                        const r2 = sel2.getRangeAt(0);
                        const sp2 = doc.createElement('span');
                        sp2.setAttribute('style', dtCss);
                        sp2.appendChild(r2.extractContents());
                        r2.insertNode(sp2);
                        sel2.removeAllRanges();
                        const nr2 = doc.createRange();
                        nr2.selectNodeContents(sp2);
                        sel2.addRange(nr2);
                    } catch (err) {}
                } else {
                    // Nothing selected: start typing in the style from the caret onward
                    try {
                        const sp3 = doc.createElement('span');
                        sp3.setAttribute('style', dtCss);
                        sp3.textContent = '\u200B';
                        const r3 = sel2.getRangeAt(0);
                        r3.insertNode(sp3);
                        const nr3 = doc.createRange();
                        nr3.setStart(sp3.firstChild, 1);
                        nr3.collapse(true);
                        sel2.removeAllRanges();
                        sel2.addRange(nr3);
                    } catch (err) {}
                }
            }
            if (triggered) { e.preventDefault(); e.stopImmediatePropagation(); }
        }, true);

        // Click handler for Discard Protection
        // (v100.8.32) Now covers TWO scenarios:
        //   A) Closing a modal (X button / backdrop click) - original behavior
        //   B) NEW: Navigating away via the top navbar, breadcrumb links, or the
        //      left sidebar while a note/description editor has unsaved text.
        document.addEventListener('click', function(event) {
            // v100.9.0: a modified click (Ctrl/Cmd/Shift/Alt or middle button) is the
            // browser's "open in a new tab/window" gesture - never intercept it, or
            // Ctrl+clicking "View Loan" does nothing.
            if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button === 1) return;
            const btn = event.target.closest('button, a, input');
            if (btn) { const t = (btn.textContent||btn.value||'').toLowerCase(); if(t.includes('save')||t.includes('email')||t.includes('submit')){ isSavingOrEmailing=true; setTimeout(()=>isSavingOrEmailing=false, 2000); return; } }
            const tgt = event.target, isC = tgt.closest('[data-dismiss="modal"]') || tgt.closest('.close') || tgt.classList.contains('close'), isB = tgt.classList.contains('modal') && tgt.classList.contains('show');
            if (isB && mousedownTarget && mousedownTarget !== tgt) return;
            if ((isC || isB) && isNoteDirty()) {
                if (isSavingOrEmailing) return;
                event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
                showConfirmDialog(() => {
                    const ed = document.querySelector('.note-editable, textarea[name*="note"], textarea[id*="note"]');
                    if (ed) { if(ed.tagName==='TEXTAREA')ed.value=''; else ed.innerHTML=''; }
                    tgt.click();
                });
                return;
            }

            // ==========================================
            // NAVIGATION & CANCEL DISCARD PROTECTION (v100.8.33)
            // ==========================================
            if (!isNoteDirty() || isSavingOrEmailing) return;

            // Never intercept clicks on our own injected UI
            if (tgt.closest('#lf-confirm-dialog, #lf-color-panel, #lf-nav-color-btn, #lf-global-toast, #lf-toast-stack, #custom-lf-copy-btn')) return;

            // Never intercept clicks inside the editor itself or its toolbar
            if (tgt.closest('.note-editor, .note-toolbar, .note-popover, .note-editable')) return;

            // NEW (v100.8.33): "Cancel" buttons discard the note too - detect them FIRST,
            // before the form-container exclusion below (Cancel lives inside the form).
            const cancelEl = tgt.closest('button, a, input');
            const isCancel = !!(cancelEl && ((cancelEl.textContent || cancelEl.value || '').trim().toLowerCase() === 'cancel'));

            if (!isCancel) {
                // Never intercept clicks inside the same form/modal that hosts the editor
                // (so the editor toolbar, "Rewrite using AI", Owner dropdown, Submit, etc. all still work normally)
                const editorEl = document.querySelector('.note-editable, textarea[name*="note"], textarea[id*="note"]');
                if (editorEl) {
                    const container = editorEl.closest('form, .modal, .ui-dialog, .modal-content');
                    if (container && container.contains(tgt)) return;
                }

                // Never intercept pure UI toggles (dropdown openers, search toggle, sidebar collapse, etc.)
                if (tgt.closest('[data-toggle], [data-click], [data-dismiss]')) return;
            }

            let isNav = isCancel;

            // 1) Anything clicked in the top header bar or the left sidebar counts as navigation
            if (!isNav && tgt.closest('#header, #sidebar, .sidebar, .sidebar-bg, .navbar-header')) isNav = true;

            // 2) NEW (v100.8.33): Anything inside a breadcrumb container
            //    (the "Loans > To-do lists > New To-do" chevron bar)
            if (!isNav && tgt.closest('.breadcrumb, [class*="breadcrumb" i], [class*="bread-crumb" i]')) isNav = true;

            // 3) ANY anchor or link-role element (v100.8.33: no longer requires an href -
            //    GWT renders breadcrumb/nav links as <a> elements WITHOUT an href attribute).
            //    Only a bare href="#" (a pure no-op) is ignored.
            if (!isNav) {
                const a = tgt.closest('a, [role="link"]');
                if (a) {
                    const href = ((a.getAttribute && a.getAttribute('href')) || '').trim().toLowerCase();
                    if (href !== '#') isNav = true;
                }
            }

            if (!isNav) return;

            // A dirty note + a navigation/cancel click = intercept and confirm first
            console.warn('[LF Optimizer] click blocked by note-discard guard ->', tgt.tagName, tgt.className, '| text:', (tgt.textContent||'').trim().slice(0,40));
            event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
            showConfirmDialog(() => {
                const ed = document.querySelector('.note-editable, textarea[name*="note"], textarea[id*="note"]');
                if (ed) { if (ed.tagName === 'TEXTAREA') ed.value = ''; else ed.innerHTML = ''; }
                // Re-fire the original navigation/cancel click now that the note is cleared
                hardClick(tgt);
            });
        }, true);

        document.addEventListener('mousedown', function(e) { mousedownTarget = e.target; }, true);

        // v100.9.42: arrow keys / Enter pick a global-search result
        document.addEventListener('keydown', lfGsKeyHandler, true);

        // v100.9.19: catch the WARNING NOTICE as early as possible on a refresh, so it
        // does not flash up before the master loop's first pass.
        [0, 120, 300, 600, 1000, 1600, 2400].forEach(ms => setTimeout(() => {
            try { lfDismissWarningNotice(); } catch (e) {}
        }, ms));

        // v100.9.17: hide the unwanted Action item the moment a menu opens, so it never
        // flashes into view while waiting for the next polling pass
        document.addEventListener('mousedown', function (e) {
            try {
                const t = e.target.closest ? e.target.closest('a, button, .btn, div') : null;
                if (!t) return;
                if (!(t.textContent || '').trim().replace(/\s+/g, ' ').startsWith('Action')) return;
                setTimeout(lfHideUnwantedActions, 0);
                setTimeout(lfHideUnwantedActions, 120);
            } catch (err) {}
        }, true);

        // v100.9.6: before the app handles a click, put the rows back in their real
        // order so its row-to-record lookup resolves correctly.
        document.addEventListener('mousedown', function (e) {
            try {
                if (!e.target || !e.target.closest) return;
                if (!e.target.closest('tbody[data-lf-sorted="1"]')) return;
                lfRestoreDomOrder();
            } catch (err) {}
        }, true);



        // NEW (v100.8.32): Browser-level guard - warns before refresh (F5) or closing
        // the tab while a note has unsaved text. Uses the browser's native dialog.
        window.addEventListener('beforeunload', function (e) {
            if (isNoteDirty()) {
                e.preventDefault();
                e.returnValue = '';
                return '';
            }
        });

        document.addEventListener('paste', function (e) {
            // ==========================================
            // CLEAN PASTE (v100.8.52)
            // Text and HTML are cleaned. Picture handling is controlled by the
            // "Clean-paste Picture" option in the palette panel (default ON).
            // ==========================================

            // v100.8.38: Clean Paste is suspended during the whole 5-star review flow -
            // the "REQUEST FOR 5-STAR REVIEWS" popup AND the follow-up compose window
            // it opens. We bail out BEFORE any preventDefault, so the app's native
            // paste behavior runs exactly as if this module did not exist. Once the
            // flow's windows are closed, Clean Paste is enabled again automatically.
            if (isCleanPasteSuspended()) return;

            const getActiveEditor = () => {
                const a = document.activeElement;
                if(a && a.isContentEditable) return a;
                for(let i of document.querySelectorAll('iframe')){
                    try {
                        const d=i.contentDocument||i.contentWindow.document;
                        if(d&&d.activeElement&&d.activeElement.isContentEditable) return i;
                    } catch(err) {}
                }
                return null;
            };
            const ed = getActiveEditor();
            if (!ed) return;

            const doc = (ed.tagName === 'IFRAME') ? (ed.contentDocument || ed.contentWindow.document) : document;

            // ==========================================
            // v100.8.64: picture pasting is handled ENTIRELY by the native Loan Factory
            // portal. Any paste involving an image - a screenshot/copied image file, or
            // HTML containing an <img> - returns before preventDefault, so the app's own
            // behaviour runs untouched. Clean Paste only handles text and picture-free HTML.
            // ==========================================
            if (e.clipboardData.files && e.clipboardData.files.length > 0) {
                for (let i = 0; i < e.clipboardData.files.length; i++) {
                    if (e.clipboardData.files[i].type.startsWith('image/')) return;
                }
            }

            const h = e.clipboardData.getData('text/html');
            const t = e.clipboardData.getData('text/plain');

            if (h && h.includes('<img')) return; // picture inside HTML -> native

            if (!h && !t) return;

            e.preventDefault();
            e.stopImmediatePropagation();

            if (h) {
                doc.execCommand('insertHTML', false, h);
            } else if (t) {
                doc.execCommand('insertText', false, t);
            }
        }, true);

        // ==========================================
        // PHONE FORMATTING (Universal Symbol Trigger)
        // ==========================================
        document.addEventListener('keydown', function(e) {
            const isSymbol = e.key.length === 1 && /^[^a-zA-Z0-9]$/.test(e.key);
            if (e.target && e.target.tagName === 'INPUT' && isSymbol) {
                let val = e.target.value.trim();
                if (/^\d{10}$/.test(val)) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    let formatted = `(${val.substring(0,3)}) ${val.substring(3,6)}-${val.substring(6,10)}`;
                    e.target.select();
                    if (!document.execCommand('insertText', false, formatted)) {
                        let nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
                        if(nativeSetter) nativeSetter.call(e.target, formatted);
                        else e.target.value = formatted;
                        e.target.dispatchEvent(new Event('input', { bubbles: true }));
                        e.target.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                    e.target.selectionStart = e.target.selectionEnd = e.target.value.length;
                }
            }
        }, true);

        // ==========================================
        // AUTO SEND REVIEW REQUEST VIA TEXT (v100.8.40) - registration
        // ==========================================
        initAutoReviewRequest();

        // ==========================================
        // DEFAULT TEXT STYLE (v100.8.59) - typing hook
        // ==========================================
        lfDtInitTyping();

        // ==========================================
        // v100.8.79: assign-time capture support
        //  - remember the last ticket row touched (used to attribute an opened log)
        //  - clicking "open Audit log to start" runs the whole capture trip
        // ==========================================
        document.addEventListener('mousedown', (e) => {
            if (!e.target || !e.target.closest) return;
            const r = e.target.closest('tr');
            if (r && !r.closest('.modal, .ui-dialog') && r.querySelector('td')) lfDsLastRow = r;
        }, true);

        document.addEventListener('click', (e) => {
            if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button === 1) return;   // v100.9.0
            const pill = e.target.closest ? e.target.closest('.lf-ds-start-btn') : null;
            if (!pill) return;
            e.preventDefault(); e.stopPropagation();
            const row = pill.closest('tr');
            if (row) lfDsAutoOpenAudit(row);
        }, true);
    }

    // ==========================================
    // AUTO SEND REVIEW REQUEST VIA TEXT (v100.8.40)
    // Fully self-contained feature. Adds an "Auto send review request via text"
    // item to each loan row's Action dropdown. Per-loan schedule (plain-text
    // message, send time in the PC's local timezone, days of week) is stored in
    // localStorage. While the script is running and the loan's row is visible on
    // the page, at the scheduled time it replays the manual flow:
    //   Action -> Request for 5-star reviews -> Request review by text
    //   -> fill the saved message -> click Send.
    // A small indicator appears under the "[x active ticket(s)]" badge.
    // If the row shows the "review_received_response_posted" label, that loan's
    // schedule is removed automatically.
    // NOTE: no existing feature is modified - everything in this section is additive.
    // ==========================================
    const LF_AR_STORE = 'lf_auto_review_configs';
    const LF_AR_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    let lfArBusy = false;
    let lfArLastActionRow = null;

    function lfArLoad() { try { return JSON.parse(localStorage.getItem(LF_AR_STORE) || '{}'); } catch (e) { return {}; } }
    function lfArSave(cfgs) { localStorage.setItem(LF_AR_STORE, JSON.stringify(cfgs)); }

    // v100.8.43 ROOT-CAUSE FIX: textContent glues adjacent elements together with
    // no space, e.g. "Thu Nguyen 3474913991may_qualify_for_refinow" - a \b-based
    // regex can never match there (digit->letter is NOT a word boundary). Instead,
    // extract runs of CONSECUTIVE DIGITS and take the first run 6-15 digits long.
    // Dates (7/8/2021 -> 1,1,4 digits) and amounts ($203,000 -> 3,3 digits) can
    // never qualify; a glued loan number still yields its clean digit run.
    function lfArDigitsKeyFromText(text) {
        const runs = (text || '').match(/\d+/g) || [];
        for (const r of runs) {
            if (r.length >= 6 && r.length <= 15) return r;
        }
        return null;
    }

    // The loan key = the loan number shown in the Borrower column (e.g. 3474913991).
    function lfArLoanKeyFromRow(row) {
        if (!row) return null;
        // 1) Prefer the Borrower column (located via the table's header text)
        const table = row.closest('table');
        if (table) {
            const headers = Array.from(table.querySelectorAll('th, thead td')).map(h => (h.textContent || '').toLowerCase().trim());
            const bIdx = headers.findIndex(h => h.includes('borrower'));
            if (bIdx > -1 && row.cells && row.cells.length > bIdx) {
                const k1 = lfArDigitsKeyFromText(row.cells[bIdx].textContent);
                if (k1) return k1;
            }
        }
        // 2) Fallback: first qualifying digit run anywhere in the row
        return lfArDigitsKeyFromText(row.textContent);
    }

    function lfArBorrowerFromRow(row) {
        if (!row) return '';
        const a = row.querySelector('a');
        return a ? getCleanText(a) : '';
    }

    function lfArFindRowByKey(key) {
        const rows = document.querySelectorAll('table tr');
        for (const r of rows) {
            if (r.closest('.modal, .ui-dialog')) continue;
            if (lfArLoanKeyFromRow(r) === key) {
                // Must be a real pipeline row with an Action control
                const hasAction = Array.from(r.querySelectorAll('a, button, .btn')).some(el => (el.textContent || '').trim().replace(/\s+/g, ' ').startsWith('Action'));
                if (hasAction) return r;
            }
        }
        return null;
    }

    // Polls for an element every 400ms until found or timed out
    function lfArWaitFor(finder, timeoutMs, cb) {
        const start = Date.now();
        const int = setInterval(() => {
            let el = null;
            try { el = finder(); } catch (e) {}
            if (el) { clearInterval(int); cb(el); }
            else if (Date.now() - start > timeoutMs) { clearInterval(int); cb(null); }
        }, 400);
    }

    function lfArVisibleDialogWith(text) {
        const dialogs = document.querySelectorAll('.modal.show, .modal[style*="display: block"], .ui-dialog[style*="display: block"], div[role="dialog"]');
        for (const d of dialogs) {
            if (d.offsetWidth > 0 && d.offsetHeight > 0 && (d.textContent || '').toUpperCase().includes(text)) return d;
        }
        return null;
    }

    // ==========================================
    // v100.8.44: SMARTER INDICATOR HELPERS
    // ==========================================
    function lfArScheduleLabel(c) {
        const days = Array.isArray(c.days) ? c.days : [];
        const dTxt = days.length === 7 ? 'Daily' : days.map(i => LF_AR_DAYS[i]).join(',');
        return `\u23F1 ${dTxt} \u00B7 ${c.time}`;
    }

    // idle = not scheduled today | due = scheduled today, not yet sent
    // soon = within 30 min before send time | sent = already sent today
    function lfArDueState(c) {
        const now = new Date();
        if (!Array.isArray(c.days) || !c.days.includes(now.getDay())) return 'idle';
        const dateKey = now.getFullYear() + '-' + (now.getMonth() + 1) + '-' + now.getDate();
        if (c.lastSentKey === dateKey) return 'sent';
        const parts = (c.time || '').split(':');
        const sched = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
        if (isNaN(sched)) return 'idle';
        const cur = now.getHours() * 60 + now.getMinutes();
        if (cur >= sched - 30 && cur <= sched + 10) return 'soon';
        return 'due';
    }

    function lfArRefreshIndicator(ind, c) {
        if (!ind || !c) return;
        const state = lfArDueState(c);
        ind.classList.toggle('lf-ar-due', state === 'due' || state === 'soon');
        ind.classList.toggle('lf-ar-soon', state === 'soon');
        ind.classList.toggle('lf-ar-sent', state === 'sent');
        const label = state === 'sent' ? `\u2713 Sent today \u00B7 ${c.time}` : lfArScheduleLabel(c);
        if (ind.textContent !== label) ind.textContent = label;
        ind.title = `Auto review request: ${c.time} on ${(c.days || []).map(i => LF_AR_DAYS[i]).join(', ')} - click to edit`;
    }

    // ==========================================
    // v100.8.46: AGENDA STRIP
    // Slim dismissible bar above the pipeline listing today's scheduled
    // auto-reviews. Click a name to scroll to and flash that loan's row.
    // The X hides the strip for the rest of the day.
    // ==========================================
    function lfArTodayKey() {
        const n = new Date();
        return n.getFullYear() + '-' + (n.getMonth() + 1) + '-' + n.getDate();
    }

    function lfArEscapeHtml(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function lfArUpdateAgendaStrip(cfgs) {
        const existing = document.getElementById('lf-ar-agenda');
        const dateKey = lfArTodayKey();

        // Dismissed today -> keep it hidden until tomorrow
        if (localStorage.getItem('lf_ar_agenda_dismissed') === dateKey) {
            if (existing) existing.remove();
            return;
        }

        // Collect today's scheduled auto-reviews
        const now = new Date();
        const items = [];
        for (const key of Object.keys(cfgs)) {
            const c = cfgs[key];
            if (!c || !Array.isArray(c.days) || !c.days.includes(now.getDay()) || !c.time) continue;
            items.push({ key: key, time: c.time, name: c.borrower || key, sent: c.lastSentKey === dateKey });
        }
        if (!items.length) { if (existing) existing.remove(); return; }
        items.sort((a, b) => (a.time < b.time ? -1 : (a.time > b.time ? 1 : 0)));

        // Find the pipeline table (Borrower + To-dos + Action = the loans list)
        let pipelineTable = null;
        for (const t of document.querySelectorAll('table')) {
            if (t.closest('.modal, .ui-dialog, .offcanvas')) continue;
            const txt = t.textContent || '';
            if (txt.includes('Borrower') && txt.includes('To-dos') && txt.includes('Action')) { pipelineTable = t; break; }
        }
        if (!pipelineTable) { if (existing) existing.remove(); return; }

        let strip = existing;
        if (!strip) {
            strip = document.createElement('div');
            strip.id = 'lf-ar-agenda';
            strip.addEventListener('click', (e) => {
                const closeB = e.target.closest('.lf-ar-agenda-close');
                if (closeB) {
                    localStorage.setItem('lf_ar_agenda_dismissed', lfArTodayKey());
                    strip.remove();
                    return;
                }
                const item = e.target.closest('.lf-ar-agenda-item');
                if (item) {
                    const row = lfArFindRowByKey(item.dataset.key);
                    if (row) {
                        // NOTE: scrollIntoView is globally disabled by Absolute Scroll
                        // Suppression, so we scroll the window to the row's position.
                        const r = row.getBoundingClientRect();
                        window.scrollTo({ top: window.scrollY + r.top - 140, behavior: 'smooth' });
                        row.classList.add('lf-ar-flash');
                        setTimeout(() => row.classList.remove('lf-ar-flash'), 2500);
                    } else {
                        showToast('Loan row not visible on this page');
                    }
                }
            });
        }

        // Keep the strip parked immediately above the pipeline table
        if (strip.nextElementSibling !== pipelineTable || strip.parentNode !== pipelineTable.parentNode) {
            pipelineTable.parentNode.insertBefore(strip, pipelineTable);
        }

        // Only re-render when the content actually changed (preserves hover state)
        const sig = items.map(i => `${i.key}|${i.time}|${i.sent ? 1 : 0}`).join(',');
        if (strip.dataset.sig !== sig) {
            strip.dataset.sig = sig;
            strip.innerHTML =
                `<span class="lf-ar-agenda-ico">\uD83D\uDCCB</span>` +
                `<span class="lf-ar-agenda-count">${items.length} auto-review${items.length === 1 ? '' : 's'} today:</span>` +
                items.map(i => `<span class="lf-ar-agenda-item${i.sent ? ' sent' : ''}" data-key="${lfArEscapeHtml(i.key)}" title="${i.sent ? 'Already sent today' : 'Click to jump to this loan'}">${lfArEscapeHtml(i.name)} ${lfArEscapeHtml(i.time)}${i.sent ? ' \u2713' : ''}</span>`).join('<span class="lf-ar-agenda-sep">\u00B7</span>') +
                `<button type="button" class="lf-ar-agenda-close" title="Hide for today">\u00D7</button>`;
        }
    }

    // Own style element - deliberately NOT touching the existing injectMasterCSS
    function lfArInjectStyles() {
        if (document.getElementById('lf-ar-styles')) return;
        const st = document.createElement('style');
        st.id = 'lf-ar-styles';
        st.innerHTML = `
            #lf-ar-popup { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.5); z-index: 99998; display: flex; align-items: center; justify-content: center; }
            .lf-ar-box { background: #fff; border-radius: 10px; width: 460px; max-width: calc(100vw - 40px); box-shadow: 0 4px 15px rgba(0,0,0,0.3); font-family: inherit; padding: 22px; }
            .lf-ar-box h4 { margin: 0 0 4px; font-weight: bold; color: #333; font-size: 17px; }
            .lf-ar-sub { color: #888; font-size: 12px; margin-bottom: 14px; }
            .lf-ar-label { font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin: 12px 0 4px; }
            .lf-ar-box textarea { width: 100%; min-height: 90px; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 10px; font-size: 13px; font-family: inherit; color: #334155; resize: vertical; outline: none; box-sizing: border-box; }
            .lf-ar-box textarea:focus, .lf-ar-box input[type="time"]:focus { border-color: #f36f20; box-shadow: 0 0 0 2px rgba(243,111,32,0.2); }
            .lf-ar-box input[type="time"] { border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 10px; font-size: 13px; font-family: inherit; color: #334155; outline: none; }
            .lf-ar-days { display: flex; gap: 6px; }
            .lf-ar-day { flex: 1; padding: 7px 0; text-align: center; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff; color: #64748b; font-size: 12px; font-weight: 700; cursor: pointer; user-select: none; transition: all 0.15s ease; }
            .lf-ar-day:hover { border-color: #f36f20; color: #f36f20; }
            .lf-ar-day.on { background: #f36f20; border-color: #f36f20; color: #fff; }
            .lf-ar-actions { display: flex; justify-content: space-between; margin-top: 20px; }
            .lf-ar-actions button { border: none; border-radius: 4px; padding: 10px 24px; font-weight: bold; font-size: 14px; cursor: pointer; font-family: inherit; }
            #lf-ar-save { background: #16a34a; color: #fff; }
            #lf-ar-save:hover { background: #15803d; }
            #lf-ar-remove { background: #dc2626; color: #fff; }
            #lf-ar-remove:hover { background: #c82333; }
            .lf-ar-close { float: right; background: none; border: none; font-size: 24px; line-height: 1; color: #aaa; cursor: pointer; padding: 0; margin: -4px -4px 0 0; }
            .lf-ar-close:hover { color: #333; }
            .lf-ar-indicator { display: table; margin-top: 4px; padding: 2px 8px; border-radius: 10px; background: rgba(243,111,32,0.13); border: 1px solid #f36f20; color: #c2591a; font-size: 11px; font-weight: 700; cursor: pointer; white-space: nowrap; }
            .lf-ar-indicator.lf-ar-due { background: #f36f20; border-color: #f36f20; color: #ffffff; }
            .lf-ar-indicator.lf-ar-sent { background: rgba(40,167,69,0.12); border-color: #16a34a; color: #1e7e34; }
            @keyframes lfArPulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(243,111,32,0.55); } 50% { box-shadow: 0 0 0 6px rgba(243,111,32,0); } }
            .lf-ar-indicator.lf-ar-soon { animation: lfArPulse 1.6s ease-in-out infinite; }
            /* v100.8.46: agenda strip above the pipeline */
            #lf-ar-agenda { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; margin: 0 0 10px 0; padding: 8px 12px; background: #fff7f2; border: 1px solid #f3ceb6; border-left: 4px solid #f36f20; border-radius: 10px; font-size: 12px; font-weight: 600; color: #7c4a26; }
            #lf-ar-agenda .lf-ar-agenda-ico { font-size: 14px; }
            #lf-ar-agenda .lf-ar-agenda-count { color: #c2591a; font-weight: 800; }
            #lf-ar-agenda .lf-ar-agenda-item { cursor: pointer; color: #b45309; text-decoration: underline; text-decoration-style: dotted; white-space: nowrap; }
            #lf-ar-agenda .lf-ar-agenda-item:hover { color: #f36f20; }
            #lf-ar-agenda .lf-ar-agenda-item.sent { color: #1e7e34; text-decoration: none; cursor: default; }
            #lf-ar-agenda .lf-ar-agenda-sep { color: #d8b294; }
            #lf-ar-agenda .lf-ar-agenda-close { margin-left: auto; background: none; border: none; font-size: 18px; line-height: 1; color: #c9a284; cursor: pointer; padding: 0 2px; }
            #lf-ar-agenda .lf-ar-agenda-close:hover { color: #7c4a26; }
            .lf-ar-flash { outline: 3px solid #f36f20 !important; outline-offset: -3px; transition: outline-color 0.4s ease; }
        `;
        document.head.appendChild(st);
    }

    // The configuration popup (message / time / days / Save / Remove)
    function lfArOpenPopup(loanKey, borrower) {
        lfArInjectStyles();
        const old = document.getElementById('lf-ar-popup');
        if (old) old.remove();
        const cfgs = lfArLoad();
        const cfg = cfgs[loanKey] || { message: 'Hi,\nPlease give us a 5-star review.\nThank you.', time: '09:00', days: [] };

        const overlay = document.createElement('div');
        overlay.id = 'lf-ar-popup';
        overlay.innerHTML = `
            <div class="lf-ar-box">
                <button type="button" class="lf-ar-close" title="Close">\u00D7</button>
                <h4>Auto Send Review Request via Text</h4>
                <div class="lf-ar-sub">Loan ${loanKey}${borrower ? ' \u2013 ' + borrower : ''}</div>
                <div class="lf-ar-label">Message (plain text)</div>
                <textarea id="lf-ar-msg" spellcheck="false"></textarea>
                <div class="lf-ar-label">Send time (your PC's timezone)</div>
                <input type="time" id="lf-ar-time" value="${cfg.time || '09:00'}">
                <div class="lf-ar-label">Days of week</div>
                <div class="lf-ar-days">${LF_AR_DAYS.map((d, i) => `<div class="lf-ar-day${(cfg.days || []).includes(i) ? ' on' : ''}" data-day="${i}">${d}</div>`).join('')}</div>
                <div class="lf-ar-actions">
                    <button type="button" id="lf-ar-save">Save</button>
                    <button type="button" id="lf-ar-remove">Remove</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);

        // Set the message via JS (not via HTML) so special characters are safe
        overlay.querySelector('#lf-ar-msg').value = cfg.message || '';
        overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) overlay.remove(); });
        overlay.querySelector('.lf-ar-close').onclick = () => overlay.remove();
        overlay.querySelectorAll('.lf-ar-day').forEach(d => { d.onclick = () => d.classList.toggle('on'); });

        overlay.querySelector('#lf-ar-save').onclick = (e) => {
            e.preventDefault(); e.stopPropagation();
            const message = overlay.querySelector('#lf-ar-msg').value.trim();
            const time = overlay.querySelector('#lf-ar-time').value;
            const days = Array.from(overlay.querySelectorAll('.lf-ar-day.on')).map(d => parseInt(d.dataset.day, 10));
            if (!message) { showToast('Please enter a message'); return; }
            if (!time) { showToast('Please choose a send time'); return; }
            if (!days.length) { showToast('Please choose at least one day'); return; }
            const all = lfArLoad();
            const prev = all[loanKey] || {};
            all[loanKey] = { message: message, time: time, days: days, borrower: borrower || prev.borrower || '', lastSentKey: prev.lastSentKey || '' };
            lfArSave(all);
            overlay.remove();
            showToast(`Auto-review saved: ${time} on ${days.map(i => LF_AR_DAYS[i]).join(', ')}`);
        };
        overlay.querySelector('#lf-ar-remove').onclick = (e) => {
            e.preventDefault(); e.stopPropagation();
            const all = lfArLoad();
            if (all[loanKey]) { delete all[loanKey]; lfArSave(all); showToast('Auto-review removed for this loan'); }
            overlay.remove();
        };
    }

    // Replays the manual flow for one loan. Marks the config as sent BEFORE
    // clicking Send so a slow page can never cause a duplicate text.
    function lfArRunSend(loanKey, cfg, row) {
        lfArBusy = true;
        let finished = false;
        const done = () => { if (!finished) { finished = true; lfArBusy = false; } };
        const safety = setTimeout(done, 45000); // absolute safety release

        // Step 1: open the row's Action dropdown
        const actionToggle = Array.from(row.querySelectorAll('a, button, .btn')).find(el => (el.textContent || '').trim().replace(/\s+/g, ' ').startsWith('Action'));
        if (!actionToggle) { clearTimeout(safety); done(); return; }
        hardClick(actionToggle);

        // Step 2: click "Request for 5-star reviews" in the dropdown
        lfArWaitFor(() => {
            return Array.from(document.querySelectorAll('a, li, span, div')).find(el =>
                el.offsetWidth > 0 &&
                (el.textContent || '').trim().length < 60 &&
                (el.textContent || '').includes('Request for 5-star reviews') &&
                !el.classList.contains('lf-ar-menu-item') &&
                el.children.length <= 2);
        }, 6000, (item) => {
            if (!item) { clearTimeout(safety); done(); return; }
            hardClick(item);

            // Step 3: in the review popup, click "Request review by text"
            lfArWaitFor(() => {
                const pop = lfArVisibleDialogWith('REQUEST FOR 5-STAR REVIEWS');
                if (!pop) return null;
                return Array.from(pop.querySelectorAll('button, a, div, span')).find(el =>
                    el.offsetWidth > 0 &&
                    (el.textContent || '').trim().length < 40 &&
                    (el.textContent || '').toLowerCase().includes('request review by text'));
            }, 10000, (txtBtn) => {
                if (!txtBtn) { clearTimeout(safety); done(); return; }
                hardClick(txtBtn);

                // Step 4: in the SMS window, set the saved message, then press Send
                lfArWaitFor(() => {
                    const sms = lfArVisibleDialogWith('MESSAGE WILL BE SENT TO');
                    return sms ? sms.querySelector('textarea') : null;
                }, 10000, (ta) => {
                    if (!ta) { clearTimeout(safety); done(); return; }
                    const sms = ta.closest('.modal, .ui-dialog, div[role="dialog"]') || document;
                    ta.focus();
                    if (ta.hasAttribute('readonly')) ta.removeAttribute('readonly');
                    const desc = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
                    if (desc && desc.set) desc.set.call(ta, cfg.message); else ta.value = cfg.message;
                    ['input', 'change'].forEach(ev => ta.dispatchEvent(new Event(ev, { bubbles: true })));

                    setTimeout(() => {
                        const sendBtn = Array.from(sms.querySelectorAll('button, a, div, span')).find(el =>
                            el.offsetWidth > 0 &&
                            /(^|\s)send(\s|$)/i.test((el.textContent || '').trim()) &&
                            (el.textContent || '').trim().length < 12);
                        if (!sendBtn) { clearTimeout(safety); done(); return; }

                        // Duplicate guard: mark as sent for today BEFORE clicking Send
                        const now = new Date();
                        const dateKey = now.getFullYear() + '-' + (now.getMonth() + 1) + '-' + now.getDate();
                        const all = lfArLoad();
                        if (all[loanKey]) { all[loanKey].lastSentKey = dateKey; lfArSave(all); }

                        hardClick(sendBtn);
                        showToast(`Auto-review request sent${cfg.borrower ? ' to ' + cfg.borrower : ''}`);

                        // Step 5: tidy up - close the SMS window, then the review popup
                        setTimeout(() => {
                            const sms2 = lfArVisibleDialogWith('MESSAGE WILL BE SENT TO');
                            if (sms2) {
                                const c2 = sms2.querySelector('[data-dismiss="modal"], .close');
                                if (c2) hardClick(c2);
                            }
                            setTimeout(() => {
                                const pop = lfArVisibleDialogWith('REQUEST FOR 5-STAR REVIEWS');
                                if (pop) {
                                    const closer = pop.querySelector('[data-dismiss="modal"], .close') ||
                                        Array.from(pop.querySelectorAll('button, a')).find(el => (el.textContent || '').trim().toLowerCase() === 'cancel');
                                    if (closer) hardClick(closer);
                                }
                                clearTimeout(safety); done();
                            }, 800);
                        }, 2000);
                    }, 600);
                });
            });
        });
    }

    function initAutoReviewRequest() {
        lfArInjectStyles();

        // Remember the last pipeline row the user pressed inside - fallback for
        // dropdown menus that GWT renders outside the row itself.
        // v100.8.41: broadened from "mousedown exactly on the Action element" to
        // "mousedown anywhere inside a row that has an Action control", which is
        // far more reliable (opening the dropdown is always a click inside the row).
        document.addEventListener('mousedown', (e) => {
            if (!e.target || !e.target.closest) return;
            const r = e.target.closest('tr');
            if (r && !r.closest('.modal, .ui-dialog') &&
                Array.from(r.querySelectorAll('a, button, .btn')).some(el => (el.textContent || '').trim().replace(/\s+/g, ' ').startsWith('Action'))) {
                lfArLastActionRow = r;
            }
        }, true);

        // Inject our menu item into any Action dropdown containing "Request for 5-star reviews"
        const arObserver = new MutationObserver((mutations) => {
            for (const mu of mutations) {
                mu.addedNodes.forEach(node => {
                    if (node.nodeType !== 1) return;
                    const menus = (node.classList && node.classList.contains('dropdown-menu'))
                        ? [node]
                        : Array.from(node.querySelectorAll ? node.querySelectorAll('.dropdown-menu') : []);
                    menus.forEach(menu => {
                        if (!(menu.textContent || '').includes('Request for 5-star reviews')) return;
                        if (menu.querySelector('.lf-ar-menu-item')) return;
                        const item = document.createElement('a');
                        item.className = 'dropdown-item lf-ar-menu-item';
                        item.href = 'javascript:void(0);';
                        item.textContent = 'Auto send review request via text';
                        item.style.cssText = 'color: #f36f20; font-weight: bold; cursor: pointer; display: block;';
                        item.onclick = (ev) => {
                            ev.preventDefault(); ev.stopPropagation();
                            // v100.8.42: GWT can render the dropdown inside a LAYOUT
                            // table row (no loan number in it), so finding "a" row is
                            // not enough - collect all candidate rows and use the first
                            // one that actually yields a loan key.
                            const candidates = [];
                            const r1 = menu.closest('tr');
                            if (r1) candidates.push(r1);
                            const openGrp = document.querySelector('.dropdown.show, .btn-group.show, .dropdown.open, .btn-group.open, .show > .dropdown-menu');
                            if (openGrp && openGrp.closest) {
                                const r2 = openGrp.closest('tr');
                                if (r2) candidates.push(r2);
                            }
                            if (lfArLastActionRow) candidates.push(lfArLastActionRow);

                            let row = null, key = null;
                            for (const c of candidates) {
                                const k = lfArLoanKeyFromRow(c);
                                if (k) { row = c; key = k; break; }
                            }

                            if (!key) {
                                console.warn('[LF Optimizer] Auto-review: could not resolve loan row/key.',
                                    'candidates:', candidates.length,
                                    'last-action-row:', lfArLastActionRow ? (lfArLastActionRow.textContent || '').slice(0, 120) : null);
                                showToast('Could not identify this loan');
                                return;
                            }
                            document.body.click(); // close the dropdown
                            lfArOpenPopup(key, lfArBorrowerFromRow(row));
                        };
                        menu.appendChild(item);
                    });
                });
            }
        });
        arObserver.observe(document.body, { childList: true, subtree: true });

        // Indicators under "[x active ticket(s)]" + auto-removal when the
        // "review_received_response_posted" label appears (every 1.5s)
        setInterval(() => {
            try {
                const cfgs = lfArLoad();
                let changed = false;
                document.querySelectorAll('table tr').forEach(row => {
                    if (row.closest('.modal, .ui-dialog')) return;
                    const key = lfArLoanKeyFromRow(row);
                    if (!key) return;
                    const hasCfg = !!cfgs[key];
                    const existing = row.querySelector('.lf-ar-indicator');

                    // Review received -> remove that loan's auto-review schedule
                    if (hasCfg && /review_received_response_posted/i.test(row.textContent || '')) {
                        const nm = cfgs[key].borrower || key;
                        delete cfgs[key];
                        changed = true;
                        if (existing) existing.remove();
                        showToast(`Auto-review removed for ${nm} (review received)`);
                        return;
                    }

                    if (hasCfg && !existing) {
                        const anchor = Array.from(row.querySelectorAll('div, span, a, button')).find(el =>
                            /active ticket/i.test(el.textContent || '') && (el.textContent || '').trim().length < 30);
                        if (anchor) {
                            const ind = document.createElement('div');
                            ind.className = 'lf-ar-indicator';
                            ind.onclick = (ev) => { ev.preventDefault(); ev.stopPropagation(); lfArOpenPopup(key, lfArBorrowerFromRow(row)); };
                            lfArRefreshIndicator(ind, cfgs[key]);
                            if (anchor.nextSibling) anchor.parentNode.insertBefore(ind, anchor.nextSibling);
                            else anchor.parentNode.appendChild(ind);
                        }
                    } else if (hasCfg && existing) {
                        // v100.8.44: live refresh - schedule text ("⏱ Tue · 09:00"), orange fill on
                        // due days, pulse in the last 30 min before send, green "✓ Sent today"
                        lfArRefreshIndicator(existing, cfgs[key]);
                    } else if (!hasCfg && existing) {
                        existing.remove();
                    }
                });
                if (changed) lfArSave(cfgs);

                // v100.8.46: keep the agenda strip above the pipeline in sync
                lfArUpdateAgendaStrip(cfgs);
            } catch (e) {}
        }, 1500);

        // Scheduler (every 20s): fires due configs within a 10-minute catch-up window
        setInterval(() => {
            try {
                if (lfArBusy) return;
                const cfgs = lfArLoad();
                const now = new Date();
                const dateKey = now.getFullYear() + '-' + (now.getMonth() + 1) + '-' + now.getDate();
                const cur = now.getHours() * 60 + now.getMinutes();
                for (const key of Object.keys(cfgs)) {
                    const cfg = cfgs[key];
                    if (!cfg || !Array.isArray(cfg.days) || !cfg.days.includes(now.getDay())) continue;
                    const parts = (cfg.time || '').split(':');
                    const sched = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
                    if (isNaN(sched)) continue;
                    if (cur < sched || cur > sched + 10) continue;  // inside the window?
                    if (cfg.lastSentKey === dateKey) continue;      // already sent today
                    const row = lfArFindRowByKey(key);
                    if (!row) continue;                             // row not on screen - retry next tick
                    lfArRunSend(key, cfg, row);
                    return; // one send at a time
                }
            } catch (e) {}
        }, 20000);
    }

    // Initialize safely when the DOM is fully interactive
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAll);
    } else {
        initAll();
    }

})();
