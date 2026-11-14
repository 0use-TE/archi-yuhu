const root = document.documentElement;
const canvas = document.querySelector('#draft-canvas');
const context = canvas.getContext('2d');
const languageButton = document.querySelector('#language');
const skipButton = document.querySelector('#skip-animation');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const contact = document.querySelector('.contact');
let language = 'zh-CN';
let tour;

const drawingGroups = [
  ['.topbar .brand, .topbar nav, .language', 'type'],
  ['.hero-role, #name, .hero-lead, .primary', 'type'],
  ['.model-image', 'frame'],
  ['.sheet-footer .explore', 'type'],
  ['.section-title, .about .intro, .about .intro + p, .focus-list article, .timeline article, .exchange li', 'type'],
  ['.contact-inner h2, .contact-inner a, .page-footer > *', 'type'],
];
const layers = drawingGroups.flatMap(([selector, kind]) => [...document.querySelectorAll(selector)].map(node => ({ node, kind })));
const colors = ['#4a4b87', '#b64025', '#2d6b64', '#735285'];
const reduce = (time, from, to) => Math.min(1, Math.max(0, (time - from) / (to - from)));
const ease = value => value * value * (3 - 2 * value);
const mix = (from, to, fraction) => from + (to - from) * fraction;
const move = (from, to, fraction) => from.map((value, index) => mix(value, to[index], fraction));
const viewport = () => ({ width: canvas.clientWidth, height: canvas.clientHeight });
const isHomepage = () => !location.hash || location.hash === '#top';

function setLanguage(next) {
  language = next === 'en' ? 'en' : 'zh-CN';
  root.lang = language;
  const copy = siteCopy[language];
  document.title = copy['site.title'];
  for (const node of document.querySelectorAll('[data-copy]')) node.textContent = copy[node.dataset.copy];
  for (const node of document.querySelectorAll('[data-aria]')) node.setAttribute('aria-label', copy[node.dataset.aria]);
  for (const node of document.querySelectorAll('[data-alt]')) node.alt = copy[node.dataset.alt];
  languageButton.textContent = language === 'en' ? '中文' : 'EN';
  languageButton.setAttribute('aria-label', language === 'en' ? '切换至中文' : 'Read in English');
  skipButton.textContent = `${copy.skipAnimation}  ↦`;
}

function resizeCanvas({ width, height }) {
  const scale = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  context.setTransform(scale, 0, 0, scale, 0, 0);
}

function measure() {
  const { width, height } = viewport();
  resizeCanvas({ width, height });
  const measured = layers.map(layer => ({ ...layer, ...documentBounds(layer.node) }));
  const initial = measured.filter(layer => layer.node.closest('.topbar, .hero'));
  const opening = initial.filter(layer => layer.y < height * .84 || layer.node.matches('.model-image') && layer.y < height * .91);
  const later = measured.filter(layer => !opening.includes(layer)).sort((a, b) => a.y - b.y || a.x - b.x);
  const scenes = [{ items: opening, view: 0 }];
  const limit = Math.max(0, root.scrollHeight - height);

  for (const layer of later) {
    const scene = scenes.at(-1);
    const desiredView = Math.min(limit, Math.max(scene.view, layer.y - height * .19));
    const sameView = desiredView === scene.view;
    const fits = layer.y < scene.view + height * .63 && layer.y + Math.min(layer.h, height * .5) < scene.view + height * .97;
    if (scene !== scenes[0] && (sameView || fits) && scene.items.length < 6) scene.items.push(layer);
    else scenes.push({ items: [layer], view: desiredView });
  }

  let view = 0;
  let elapsed = 0;
  let index = 0;
  for (const scene of scenes) {
    scene.items.sort((a, b) => a.y - b.y || a.x - b.x);
    scene.previousView = view;
    scene.start = elapsed;
    scene.travel = view === scene.view ? 0 : Math.min(910, 430 + (scene.view - view) * .42);
    scene.arrival = elapsed + scene.travel;
    scene.items.forEach((layer, order) => {
      const isOpening = scene === scenes[0];
      const first = isOpening ? 170 + order * 190 : 70 + order * 148;
      layer.start = scene.arrival + first;
      layer.end = layer.start + (layer.kind === 'frame' ? 1380 : layer.h > 120 ? 840 : 660);
      layer.color = colors[index++ % colors.length];
    });
    elapsed = Math.max(scene.arrival, ...scene.items.map(layer => layer.end)) + 100;
    scene.end = elapsed;
    view = scene.view;
  }

  const footer = documentBounds(document.querySelector('.page-footer'));
  const tail = Math.max(0, Math.min(limit, footer.y + footer.h - height) - view);
  const tailDuration = tail > 1 ? Math.min(760, 390 + tail * .5) : 0;
  return { width, height, scenes, measured, end: elapsed + tailDuration + 180, tail, tailDuration, elapsed, view };
}

function documentBounds(node) {
  let rect = node.getBoundingClientRect();
  if (node.matches('h1, .hero-role, .hero-lead, .section-title, .timeline article, .contact-inner h2')) {
    const range = document.createRange();
    range.selectNodeContents(node);
    rect = range.getBoundingClientRect();
  }
  return { x: rect.left, y: rect.top + scrollY, w: rect.width, h: rect.height };
}

function line(from, to, color, alpha, dashed = false) {
  context.save();
  context.globalAlpha = alpha;
  context.strokeStyle = color;
  context.lineWidth = 1;
  if (dashed) context.setLineDash([4, 4]);
  context.beginPath();
  context.moveTo(...from);
  context.lineTo(...to);
  context.stroke();
  context.restore();
}

function drawCursor(point, color, alpha) {
  context.save();
  context.globalAlpha = alpha;
  context.translate(...point);
  context.fillStyle = color;
  context.strokeStyle = '#fffbf1';
  context.lineWidth = 1.6;
  context.lineJoin = 'round';
  context.beginPath();
  context.moveTo(0, 0);
  context.lineTo(5.7, 20);
  context.lineTo(10, 12.7);
  context.lineTo(18.4, 10.5);
  context.closePath();
  context.fill();
  context.stroke();
  context.restore();
}

function contactOpacity(time) {
  const first = tour.measured.find(layer => layer.node.matches('.contact-inner h2'));
  contact.style.setProperty('--contact-reveal', ease(reduce(time, first.start - 300, first.start + 95)));
}

function drawLayer(layer, time, order, view) {
  const { x, y, w, h, start, end, color, node, kind } = layer;
  const raw = reduce(time, start, end);
  const alpha = reduce(time, start - 270, start) * (1 - reduce(time, end, end + 160));
  const top = y - view;
  const right = Math.min(tour.width - 21, x + w);
  if (layer.drawn !== 1 && raw > 0) {
    const amount = ease(raw);
    node.style.setProperty('--reveal', Math.min(1, raw * 6));
    node.style.setProperty('--hidden', `${(1 - amount) * 100}%`);
    layer.drawn = raw;
  }
  if (alpha <= 0) return;

  const begin = [x, top + Math.min(18, h * .67)];
  let tip;
  if (time < start) {
    const from = [tour.width * (.40 + (order % 4) * .061), tour.height * (.27 + (order % 3) * .082)];
    tip = move(from, kind === 'frame' ? [x, top] : begin, ease(reduce(time, start - 270, start)));
  } else if (kind === 'frame') {
    const edge = [right, top + h * ease(raw)];
    line([x, top], [right, top], color, alpha * .7);
    line([right, top], edge, color, alpha * .7);
    line([x, edge[1]], edge, color, alpha * .8);
    tip = edge;
  } else {
    tip = [mix(x, right, ease(raw)), begin[1]];
    if (w > 60) line([x, begin[1] + 4], [tip[0], begin[1] + 4], color, alpha * .43, true);
    if (h > 56 && raw > .23) line([x - 6, top], [x - 6, top + h * ease(raw)], color, alpha * .52, true);
  }
  drawCursor(tip, color, alpha);
}

function finish() {
  if (!tour) return;
  cancelAnimationFrame(tour.frame);
  context.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  tour = undefined;
  root.classList.remove('tour-running', 'intro-pending');
  for (const { node } of layers) {
    node.style.removeProperty('--reveal');
    node.style.removeProperty('--hidden');
  }
  contact.style.removeProperty('--contact-reveal');
  skipButton.hidden = true;
}

function drawFrame(timestamp) {
  tour.started ??= timestamp;
  const time = timestamp - tour.started;
  if (time >= tour.end) {
    scrollTo({ top: root.scrollHeight - canvas.clientHeight, behavior: 'instant' });
    finish();
    return;
  }
  const scene = tour.scenes.find(part => time < part.end);
  const nextView = scene
    ? scene.travel ? mix(scene.previousView, scene.view, ease(reduce(time, scene.start, scene.arrival))) : scene.view
    : tour.view + (tour.tailDuration ? tour.tail * ease(reduce(time, tour.elapsed, tour.elapsed + tour.tailDuration)) : 0);
  if (Math.abs(nextView - scrollY) > .8) scrollTo({ top: nextView, behavior: 'instant' });
  const view = scrollY;

  context.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  contactOpacity(time);
  if (scene && time < scene.arrival) {
    const p = ease(reduce(time, scene.start, scene.arrival));
    const destination = scene.items[0];
    const origin = [tour.width * .49, tour.height * .46];
    const target = [destination.x, Math.max(22, Math.min(tour.height - 34, destination.y - scene.view))];
    const tip = move(origin, target, p);
    line(move(origin, target, Math.max(0, p - .1)), tip, colors[2], .45, true);
    drawCursor(tip, colors[2], 1);
  }
  tour.measured.forEach((layer, order) => drawLayer(layer, time, order, view));
  tour.frame = requestAnimationFrame(drawFrame);
}

function start() {
  if (!context || tour) return;
  root.classList.add('tour-running');
  scrollTo({ top: 0, behavior: 'instant' });
  tour = measure();
  root.classList.remove('intro-pending');
  skipButton.hidden = false;
  tour.frame = requestAnimationFrame(drawFrame);
}

let shouldAutoplay = true;
function autoplay() {
  if (!shouldAutoplay || document.hidden) return;
  shouldAutoplay = false;
  if (isHomepage() && !reducedMotion.matches) start();
}

try { language = localStorage.getItem('tiger-yu-language') || language; } catch {}
setLanguage(language);
languageButton.addEventListener('click', () => {
  finish();
  setLanguage(language === 'en' ? 'zh-CN' : 'en');
  try { localStorage.setItem('tiger-yu-language', language); } catch {}
});

if (context) {
  for (const { node, kind } of layers) node.dataset.build = kind;
  skipButton.addEventListener('click', finish);
  document.addEventListener('focusin', event => {
    if (tour && event.target !== skipButton) finish();
  });
  window.addEventListener('keydown', event => {
    if (['Escape', 'PageUp', 'PageDown', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) finish();
  });
  for (const event of ['wheel', 'touchmove', 'hashchange', 'pagehide']) window.addEventListener(event, finish, { passive: true });
  window.addEventListener('resize', () => {
    if (!tour) return;
    const dimensions = viewport();
    if (dimensions.width === tour.width) resizeCanvas(dimensions);
    else finish();
  }, { passive: true });
  window.addEventListener('pageshow', event => {
    if (event.persisted) {
      shouldAutoplay = true;
      autoplay();
    }
  });
  reducedMotion.addEventListener('change', event => {
    if (event.matches) { shouldAutoplay = false; finish(); }
  });
  document.addEventListener('visibilitychange', () => {
    if (!tour) {
      autoplay();
    } else if (document.hidden) {
      cancelAnimationFrame(tour.frame);
      tour.pausedAt = performance.now();
    } else if (tour.pausedAt !== undefined) {
      if (tour.started !== undefined) tour.started += performance.now() - tour.pausedAt;
      tour.pausedAt = undefined;
      tour.frame = requestAnimationFrame(drawFrame);
    }
  });
  autoplay();
}
root.classList.remove('intro-pending');
