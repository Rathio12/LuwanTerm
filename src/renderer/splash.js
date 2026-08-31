'use strict';

/*
 * Element handles are const and deliberately not called `status` or `name`:
 * at global scope `var status` binds to window.status, a legacy string
 * property, which silently swallows every write to it.
 */
const fill = document.getElementById('fill');
const statusText = document.getElementById('status');
const detailText = document.getElementById('detail');

window.splash.onState(function (state) {
  if (typeof state.percent === 'number') fill.style.width = state.percent + '%';
  if (state.status) statusText.textContent = state.status;
  detailText.textContent = state.detail || '';
});
