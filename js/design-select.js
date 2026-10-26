/* Native select semantics, with MYCLM's monochrome menu in the top layer. */
(function () {
    'use strict';
    let current = null, nextId = 0;
    const close = () => current?.close();
    document.addEventListener('pointerdown', event => {
        if (current && !current.wrapper.contains(event.target) && !current.list.contains(event.target)) close();
    }, true);
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && current) { event.preventDefault(); event.stopPropagation(); close(); } }, true);
    document.addEventListener('close', close, true);
    window.addEventListener('resize', () => current?.position());
    document.addEventListener('scroll', event => { if (current && !current.list.contains(event.target)) current.position(); }, true);
    function enhance(select) {
        if (select._designSelect) return;
        const wrapper = document.createElement('span'); wrapper.className = 'design-select';
        select.before(wrapper); wrapper.append(select);
        const value = document.createElement('span'); value.className = 'design-select-value'; value.setAttribute('aria-hidden', 'true');
        const arrow = document.createElement('span'); arrow.className = 'design-select-arrow'; arrow.setAttribute('aria-hidden', 'true');
        wrapper.append(value, arrow);
        const list = document.createElement('div'); list.className = 'design-select-list'; list.id = `design-select-${++nextId}`; list.setAttribute('data-editor-overlay', '');
        list.setAttribute('role', 'listbox'); list.setAttribute('popover', 'manual'); list.hidden = true;
        (select.closest('dialog') || document.body).append(list);
        select.setAttribute('aria-controls', list.id); select.setAttribute('aria-expanded', 'false');
        let active = 0, typed = '', typedAt = 0;
        const options = () => [...select.options];
        const api = select._designSelect = {
            wrapper, list,
            close() {
                if (current !== api) return;
                if (list.hidePopover && list.matches(':popover-open')) list.hidePopover();
                list.hidden = true; select.setAttribute('aria-expanded', 'false'); select.removeAttribute('aria-activedescendant');
                wrapper.classList.remove('is-open'); current = null;
            },
            position() {
                if (current !== api) return;
                const r = wrapper.getBoundingClientRect(), below = innerHeight - r.bottom - 8, above = r.top - 8;
                const upwards = below < 150 && above > below;
                list.style.width = `${Math.min(r.width, innerWidth - 16)}px`;
                list.style.left = `${Math.max(8, Math.min(r.left, innerWidth - r.width - 8))}px`;
                list.style.maxHeight = `${Math.max(60, Math.min(280, upwards ? above : below))}px`;
                list.style.top = upwards ? 'auto' : `${r.bottom + 3}px`;
                list.style.bottom = upwards ? `${innerHeight - r.top + 3}px` : 'auto';
            }
        };
        function highlight(index) {
            active = index;
            for (const row of list.children) row.classList.toggle('is-active', Number(row.dataset.index) === active);
            const row = list.children[active];
            if (row) { select.setAttribute('aria-activedescendant', row.id); row.scrollIntoView({ block: 'nearest' }); }
        }
        function choose(index) {
            if (select.matches(':disabled') || options()[index]?.disabled) return;
            select.selectedIndex = index;
            select.dispatchEvent(new Event('input', { bubbles: true })); select.dispatchEvent(new Event('change', { bubbles: true }));
            api.close(); sync(); select.focus({ preventScroll: true });
        }
        function sync() {
            value.textContent = select.selectedOptions[0]?.textContent || '';
            wrapper.classList.toggle('is-disabled', select.matches(':disabled'));
            if (current === api) api.close();
        }
        function open() {
            if (select.matches(':disabled')) return;
            close(); current = api; list.replaceChildren();
            for (const [i, option] of options().entries()) {
                const row = document.createElement('div'); row.id = `${list.id}-${i}`; row.dataset.index = i;
                row.setAttribute('role', 'option'); row.setAttribute('aria-selected', String(i === select.selectedIndex));
                row.setAttribute('aria-disabled', String(option.disabled)); row.textContent = option.textContent;
                row.addEventListener('pointerdown', event => { event.preventDefault(); choose(i); }); list.append(row);
            }
            list.hidden = false; wrapper.classList.add('is-open'); select.setAttribute('aria-expanded', 'true');
            if (list.showPopover) list.showPopover(); else list.removeAttribute('popover');
            api.position(); highlight(Math.max(0, select.selectedIndex));
        }
        select.addEventListener('pointerdown', event => {
            if (event.button !== 0 || select.matches(':disabled')) return;
            event.preventDefault(); select.focus({ preventScroll: true }); current === api ? api.close() : open();
        });
        select.addEventListener('keydown', event => {
            if (event.key === 'Tab') { api.close(); return; }
            if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(event.key)) {
                event.preventDefault();
                if (current !== api) { open(); return; }
                if (event.key === 'Enter' || event.key === ' ') { choose(active); return; }
                const enabled = options().map((o, i) => !o.disabled ? i : -1).filter(i => i >= 0), n = enabled.indexOf(active);
                highlight(event.key === 'Home' ? enabled[0] : event.key === 'End' ? enabled.at(-1) : enabled[(n + (event.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length]);
            } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
                event.preventDefault(); if (current !== api) open();
                typed = performance.now() - typedAt < 700 ? typed + event.key : event.key; typedAt = performance.now();
                const i = options().findIndex(o => !o.disabled && o.textContent.trim().toLowerCase().startsWith(typed.toLowerCase())); if (i >= 0) highlight(i);
            }
        });
        select.addEventListener('change', sync);
        new MutationObserver(sync).observe(select, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'label'] });
        select._designRefresh = sync; sync();
    }
    window.MyclmSelect = { enhance(root) { root.querySelectorAll('select[data-design-select]').forEach(enhance); }, close };
})();
