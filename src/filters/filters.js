// =============================================================================
// Live filtering: category pills (the bottom bar from the reference UI) plus a
// country filter, both updating the map as they change. A POI is shown when its
// category is enabled AND its country is enabled.
// =============================================================================

import { countriesOf, categoryName } from '../data/schema.js';
import { el } from '../ui/components.js';
import { t, getLang } from '../ui/i18n.js';

export function createFilters(dataset) {
  const allCountries = countriesOf(dataset.points);
  const state = {
    cats: new Set(dataset.categories.map((c) => c.id)),
    countries: new Set(allCountries),
    query: '',
  };
  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => fn());
  const onChange = (fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  };

  const catById = new Map(dataset.categories.map((c) => [c.id, c]));
  const allCountriesSelected = () => state.countries.size === allCountries.length;

  function filtered() {
    const q = state.query.trim().toLowerCase();
    const everyCountry = allCountriesSelected();
    return dataset.points.filter((p) => {
      if (!state.cats.has(p.categoryId)) return false;
      // "All countries" also includes untagged points; narrowing filters precisely.
      if (!everyCountry && !state.countries.has(p.country)) return false;
      if (q && !p.name.toLowerCase().includes(q) && !(p.note || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }

  // ---- Category pill bar (bottom) -------------------------------------------
  function buildCategoryBar() {
    const bar = el('div', { class: 'filterbar', role: 'group', 'aria-label': t('filters.categories') });
    for (const c of dataset.categories) {
      const pill = el(
        'button',
        {
          class: 'cat-pill chip',
          style: { background: c.color },
          'aria-pressed': state.cats.has(c.id) ? 'true' : 'false',
          onclick: () => {
            if (state.cats.has(c.id)) state.cats.delete(c.id);
            else state.cats.add(c.id);
            pill.setAttribute('aria-pressed', state.cats.has(c.id) ? 'true' : 'false');
            emit();
          },
        },
        [el('span', { class: 'cat-pill__emoji', text: c.emoji }), el('span', { text: categoryName(c, getLang()) })]
      );
      bar.append(pill);
    }
    return bar;
  }

  // ---- Filter panel (in the settings/filters drawer) ------------------------
  function buildFilterPanel() {
    const wrap = el('div', {});

    // Categories with select all / none
    const catSection = el('div', { class: 'section' });
    catSection.append(el('h3', { text: t('filters.categories') }));
    const catChecks = el('div', {});
    const renderCatChecks = () => {
      catChecks.replaceChildren(
        ...dataset.categories.map((c) =>
          el('label', { class: 'check' }, [
            el('input', {
              type: 'checkbox',
              checked: state.cats.has(c.id),
              onchange: (e) => {
                e.target.checked ? state.cats.add(c.id) : state.cats.delete(c.id);
                emit();
                syncBar();
              },
            }),
            el('span', { text: `${c.emoji} ${categoryName(c, getLang())}` }),
          ])
        )
      );
    };
    renderCatChecks();
    catSection.append(
      el('div', { class: 'row' }, [
        el('button', {
          class: 'btn btn--sm btn--ghost',
          text: t('common.selectAll'),
          onclick: () => {
            dataset.categories.forEach((c) => state.cats.add(c.id));
            renderCatChecks();
            emit();
            syncBar();
          },
        }),
        el('button', {
          class: 'btn btn--sm btn--ghost',
          text: t('common.selectNone'),
          onclick: () => {
            state.cats.clear();
            renderCatChecks();
            emit();
            syncBar();
          },
        }),
      ]),
      catChecks
    );

    // Countries with "all countries"
    const countrySection = el('div', { class: 'section' });
    countrySection.append(el('h3', { text: t('filters.countries') }));
    if (allCountries.length === 0) {
      countrySection.append(el('p', { class: 'muted', text: '—' }));
    } else {
      const allLabel = el('label', { class: 'check' }, [
        el('input', {
          type: 'checkbox',
          checked: allCountriesSelected(),
          onchange: (e) => {
            if (e.target.checked) allCountries.forEach((c) => state.countries.add(c));
            else state.countries.clear();
            renderCountryChecks();
            emit();
          },
        }),
        el('strong', { text: t('filters.allCountries') }),
      ]);
      const countryChecks = el('div', {});
      const renderCountryChecks = () => {
        allLabel.querySelector('input').checked = allCountriesSelected();
        countryChecks.replaceChildren(
          ...allCountries.map((country) =>
            el('label', { class: 'check' }, [
              el('input', {
                type: 'checkbox',
                checked: state.countries.has(country),
                onchange: (e) => {
                  e.target.checked ? state.countries.add(country) : state.countries.delete(country);
                  allLabel.querySelector('input').checked = allCountriesSelected();
                  emit();
                },
              }),
              el('span', { text: country }),
            ])
          )
        );
      };
      renderCountryChecks();
      countrySection.append(allLabel, countryChecks);
    }

    wrap.append(catSection, countrySection);
    return wrap;
  }

  // keep the bottom pill bar in sync when categories change from the panel
  let barEl = null;
  function syncBar() {
    if (!barEl) return;
    [...barEl.querySelectorAll('.cat-pill')].forEach((pill, i) => {
      const c = dataset.categories[i];
      pill.setAttribute('aria-pressed', state.cats.has(c.id) ? 'true' : 'false');
    });
  }

  return {
    state,
    filtered,
    onChange,
    setQuery: (q) => {
      state.query = q;
      emit();
    },
    buildCategoryBar: () => (barEl = buildCategoryBar()),
    buildFilterPanel,
    getCategory: (id) => catById.get(id),
  };
}
