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
  ['.section', 'rule'],
  ['.topbar .brand, .language, .primary, .model-image', 'frame'],
  ['.topbar nav a, .hero-role, #name, .hero-lead, .sheet-footer .explore, .section-title h2, .about .section-content > p, .contact-inner h2, .contact-inner a, .page-footer > *', 'type'],
  ['.focus-list article:first-child, .timeline article:first-child, .exchange li:first-child', 'frame'],
  ['.focus-list article + article, .timeline article + article, .exchange li + li', 'copy'],
];
const layers = drawingGroups.flatMap(([selector, kind]) => [...document.querySelectorAll(selector)].map(node => ({ node, kind })));
const tools = { frame: '#af3f27', resize: '#215cb6', type: '#48498d', rule: '#216c5d', copy: '#884181' };
const durations = { frame: 1390, type: 740, rule: 550, copy: 960 };
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
  const measured = layers.map(layer => {
    const bounds = documentBounds(layer.node);
    return { ...layer, ...bounds, stops: layer.kind === 'type' ? typeStops(layer.node, bounds) : [] };
  });
  const measuredByNode = new Map(measured.map(layer => [layer.node, layer]));
  for (const layer of measured) {
    if (layer.kind === 'copy') layer.master = measuredByNode.get(layer.node.parentElement.firstElementChild);
  }
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
  for (const scene of scenes) {
    scene.items.sort((a, b) => a.y - b.y || a.x - b.x);
    scene.previousView = view;
    scene.start = elapsed;
    scene.travel = view === scene.view ? 0 : Math.min(910, 430 + (scene.view - view) * .42);
    scene.arrival = elapsed + scene.travel;
    scene.items.forEach((layer, order) => {
      const isOpening = scene === scenes[0];
      const first = isOpening ? 170 + order * 152 : 70 + order * 140;
      layer.start = scene.arrival + first;
      if (layer.master) layer.start = Math.max(layer.start, layer.master.end + 80);
      const duration = layer.kind === 'frame' && layer.node.matches('.model-image') ? 2110 : durations[layer.kind];
      layer.end = layer.start + duration;
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
  const rect = node.getBoundingClientRect();
  return { x: rect.left, y: rect.top + scrollY, w: rect.width, h: rect.height };
}

function typeStops(node, bounds) {
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  const points = [];
  for (let text = walker.nextNode(); text; text = walker.nextNode()) {
    if (!text.data.trim()) continue;
    let offset = 0;
    for (const character of text.data) {
      range.setStart(text, offset);
      offset += character.length;
      range.setEnd(text, offset);
      const rect = range.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      points.push({ x: rect.right - bounds.x, y: rect.top + scrollY - bounds.y, h: rect.height });
    }
  }
  return points;
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

function drawCursor(point, tool, alpha) {
  context.save();
  context.globalAlpha = alpha;
  context.translate(...point);
  context.fillStyle = tools[tool];
  context.strokeStyle = '#fffbf1';
  context.lineWidth = 1.5;
  context.lineJoin = 'round';
  const shapes = {
    frame: 'M-1 -13 H1 V-2 H13 V1 H1 V13 H-1 V1 H-13 V-2 H-1 Z',
    resize: 'M-12 -12 H-3 L-6 -9 L9 6 L12 3 V12 H3 L6 9 L-9 -6 L-12 -3 Z',
    type: 'M-6 -11 H6 V-8 H2 V8 H6 V11 H-6 V8 H-2 V-8 H-6 Z',
    rule: 'M0 0 L4 -14 L12 -18 L18 -12 L14 -4 Z M6 -7 L11 -12 L12 -11 L7 -6 Z',
    copy: 'M0 0 L5 19 L9 12 L17 10 Z M17 13 H20 V17 H24 V20 H20 V24 H17 V20 H13 V17 H17 Z',
  };
  const cursor = new Path2D(shapes[tool]);
  context.fill(cursor, 'evenodd');
  context.stroke(cursor);
  context.restore();
}

function selection(x, y, w, h, color, alpha, handles = false) {
  context.save();
  context.globalAlpha = alpha;
  context.strokeStyle = color;
  context.fillStyle = color;
  context.fillRect(x, y, w, h);
  context.globalAlpha = Math.min(1, alpha * 7);
  context.strokeRect(x, y, w, h);
  if (handles) {
    for (const [dx, dy] of [[0, 0], [w, 0], [0, h], [w, h]]) {
      context.fillStyle = '#fffbf1';
      context.fillRect(x + dx - 3, y + dy - 3, 6, 6);
      context.strokeRect(x + dx - 3, y + dy - 3, 6, 6);
    }
  }
  context.restore();
}

function dimensions(x, y, width, height) {
  const label = `${Math.round(width)} × ${Math.round(height)}`;
  context.save();
  context.font = '600 11px Consolas, monospace';
  const w = context.measureText(label).width + 12;
  const left = Math.min(x + 12, tour.width - w - 10);
  const top = Math.min(y + 13, canvas.clientHeight - 28);
  context.fillStyle = tools.resize;
  context.fillRect(left, top, w, 20);
  context.fillStyle = '#fff';
  context.fillText(label, left + 6, top + 14);
  context.restore();
}

function reveal(layer, amount) {
  layer.node.style.setProperty('--reveal', Math.min(1, amount * 6));
  layer.node.style.setProperty('--hidden', `${(1 - amount) * 100}%`);
}

function drawBox(layer, top, progress, alpha) {
  const { x, w, h, node } = layer;
  const isPhoto = node.matches('.model-image');
  const draft = reduce(progress, 0, .31);
  const stretch = reduce(progress, .35, .72);
  const fill = reduce(progress, .73, 1);
  const width = w * (.68 * ease(draft) + .32 * ease(stretch));
  const height = h * (.57 * ease(draft) + .43 * ease(stretch));
  const resizing = progress >= .35;
  const tool = resizing ? 'resize' : 'frame';
  const tip = [x + width, top + height];
  reveal(layer, ease(fill));
  const outline = alpha * (1 - fill);
  if (outline > 0) {
    selection(x, top, width, height, tools[tool], outline * .14, resizing);
    if (isPhoto && resizing) dimensions(...tip, width, height);
  }
  if (isPhoto && fill > 0) tip[1] = top + h * ease(fill);
  drawCursor(tip, tool, alpha);
}

function drawTyping(layer, top, progress, alpha) {
  const { x, stops, node } = layer;
  if (!stops.length) {
    reveal(layer, progress);
    return;
  }
  const count = Math.floor(progress * stops.length);
  const point = stops[Math.max(0, count - 1)];
  const edge = Math.max(0, point.x);
  const rowTop = Math.max(0, point.y);
  const rowBottom = rowTop + point.h;
  const firstLine = rowTop < 2;
  node.style.setProperty('--reveal', count > 0 ? 1 : 0);
  const clip = progress >= 1 ? 'none' : firstLine
    ? `polygon(0 0, ${edge}px 0, ${edge}px ${rowBottom}px, 0 ${rowBottom}px)`
    : `polygon(0 0, 100% 0, 100% ${rowTop}px, ${edge}px ${rowTop}px, ${edge}px ${rowBottom}px, 0 ${rowBottom}px)`;
  node.style.setProperty('--typing-clip', clip);
  const tip = [x + (count ? edge : 0), top + rowTop + point.h / 2];
  drawCursor(tip, 'type', alpha);
}

function drawRule(layer, top, progress, alpha) {
  const end = [layer.x + layer.w * ease(progress), top];
  layer.node.style.setProperty('--rule-length', `${100 * ease(progress)}%`);
  line([layer.x, top], end, tools.rule, alpha * .9);
  context.fillStyle = tools.rule;
  context.fillRect(layer.x - 2, top - 2, 4, 4);
  drawCursor(end, 'rule', alpha);
}

function drawCopy(layer, top, progress, alpha, view) {
  const { x, w, h, master } = layer;
  const travel = ease(reduce(progress, .06, .68));
  const masterTop = master ? Math.max(-h + 12, master.y - view) : top - 28;
  const origin = [master?.x ?? x, masterTop];
  const current = move(origin, [x, top], travel);
  const fill = reduce(progress, .68, 1);
  const ghostWidth = mix(master?.w ?? w, w, travel);
  const ghostHeight = mix(master?.h ?? h, h, travel);
  reveal(layer, ease(fill));
  const outline = alpha * (1 - fill);
  if (outline > 0) {
    line(origin, current, tools.copy, outline * .65, true);
    selection(...current, ghostWidth, ghostHeight, tools.copy, outline * .12, true);
  }
  drawCursor([current[0] + Math.min(ghostWidth * .52, 145), current[1] + 12], 'copy', alpha);
}

function contactOpacity(time) {
  const first = tour.measured.find(layer => layer.node.matches('.contact-inner h2'));
  contact.style.setProperty('--contact-reveal', ease(reduce(time, first.start - 300, first.start + 95)));
}

function drawLayer(layer, time, order, view) {
  const { x, y, h, start, end, kind } = layer;
  const raw = reduce(time, start, end);
  const alpha = reduce(time, start - 270, start) * (1 - reduce(time, end, end + 160));
  const top = y - view;
  if (raw >= 1 && layer.done) return;
  if (alpha <= 0 && raw < 1) return;
  if (time < start) {
    const from = [tour.width * (.38 + (order % 4) * .073), canvas.clientHeight * (.26 + (order % 3) * .084)];
    const target = kind === 'copy' && layer.master
      ? [layer.master.x + Math.min(layer.master.w * .52, 145), Math.max(-h + 12, layer.master.y - view) + 12]
      : [x, top + (kind === 'type' ? Math.min(18, h * .5) : 0)];
    drawCursor(move(from, target, ease(reduce(time, start - 270, start))), kind, alpha);
    return;
  }
  if (kind === 'frame') drawBox(layer, top, raw, alpha);
  if (kind === 'type') drawTyping(layer, top, raw, alpha);
  if (kind === 'rule') drawRule(layer, top, raw, alpha);
  if (kind === 'copy') drawCopy(layer, top, raw, alpha, view);
  layer.done = raw === 1 && alpha <= 0;
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
    node.style.removeProperty('--typing-clip');
    node.style.removeProperty('--rule-length');
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
    line(move(origin, target, Math.max(0, p - .1)), tip, tools.rule, .45, true);
    drawCursor(tip, 'rule', 1);
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
