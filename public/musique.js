(function () {
  const SRC = '/Musique.mp3'; // doit être identique au nom du fichier dans public/ (majuscules comprises)
  const KEY = 'musique_active';

  const audio = new Audio(SRC);
  audio.loop = true;
  audio.volume = 0.4;
  audio.preload = 'auto';

  // Bouton flottant
  const btn = document.createElement('button');
  btn.id = 'btnMusique';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Activer ou couper la musique');
  btn.style.cssText =
    'position:fixed;right:16px;bottom:16px;z-index:99999;width:48px;height:48px;' +
    'border-radius:50%;border:none;cursor:pointer;font-size:22px;' +
    'background:#111;color:#fff;box-shadow:0 2px 10px rgba(0,0,0,.4)';
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(btn));

  const voulue = () => localStorage.getItem(KEY) !== 'non'; // activée par défaut
  const maj = () => { btn.textContent = audio.paused ? '🔇' : '🔊'; };

  audio.addEventListener('play', maj);
  audio.addEventListener('pause', maj);
  audio.addEventListener('error', () => console.error('Musique introuvable :', SRC));

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (audio.paused) {
      localStorage.setItem(KEY, 'oui');
      audio.play().catch((err) => console.error('Lecture refusée :', err));
    } else {
      localStorage.setItem(KEY, 'non');
      audio.pause();
    }
  });

  // Les navigateurs interdisent le son avant un premier clic : on démarre à la 1re interaction
  function demarrer() {
    if (voulue()) audio.play().catch(() => {});
    ['click', 'touchstart', 'keydown'].forEach((ev) => document.removeEventListener(ev, demarrer));
  }
  ['click', 'touchstart', 'keydown'].forEach((ev) => document.addEventListener(ev, demarrer));

  // Tentative de démarrage direct (marche si le navigateur l'autorise)
  if (voulue()) audio.play().catch(() => {});

  maj();
})();
