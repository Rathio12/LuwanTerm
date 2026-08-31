'use strict';

const fill = document.getElementById('fill');
const statusText = document.getElementById('status');
const detailText = document.getElementById('detail');

window.splash.onState(function (state) {
  if (typeof state.percent === 'number') fill.style.width = state.percent + '%';
  if (state.status) statusText.textContent = state.status;
  detailText.textContent = state.detail || '';
});
