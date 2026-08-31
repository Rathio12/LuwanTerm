'use strict';

const versions = document.getElementById('versions');
let answered = false;

function respond(accepted) {
  if (answered) return;
  answered = true;
  window.updatePrompt.respond(accepted);
}

document.getElementById('update').addEventListener('click', () => respond(true));
document.getElementById('later').addEventListener('click', () => respond(false));

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') respond(false);
  if (event.key === 'Enter') respond(true);
});

window.updatePrompt.onOffer((offer) => {
  versions.innerHTML = '';
  versions.append(
    document.createTextNode('You have '),
    Object.assign(document.createElement('b'), { textContent: offer.current }),
    document.createTextNode('. Latest is '),
    Object.assign(document.createElement('b'), { textContent: offer.version }),
    document.createTextNode('.')
  );
});
