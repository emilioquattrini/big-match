import type { Card, MindSnapshot } from './types.ts';

const NS = 'http://www.w3.org/2000/svg';
function svg<K extends keyof SVGElementTagNameMap>(name: K, attributes: Record<string, string | number>): SVGElementTagNameMap[K] {
  const element = document.createElementNS(NS, name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
  return element;
}

export function renderMind(snapshot: MindSnapshot, cards: readonly Card[], selected: readonly number[]): void {
  const canvas = document.querySelector<SVGSVGElement>('#mind')!;
  const status = document.getElementById('mind-status')!;
  const list = document.getElementById('mind-list')!;
  const pairsList = document.getElementById('pair-list')!;
  const byId = new Map(cards.map(card => [card.id, card]));
  const updated = new Date(snapshot.asOf);
  status.textContent = `${snapshot.total} recorded ${snapshot.total === 1 ? 'response' : 'responses'} · Updated ${Number.isNaN(updated.getTime()) ? 'recently' : updated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`;
  document.getElementById('mind-visual')!.hidden = false;
  document.getElementById('mind-details')!.hidden = false;
  canvas.replaceChildren(); list.replaceChildren(); pairsList.replaceChildren();
  const positions = new Map(cards.map((card, i) => {
    const angle = i * Math.PI * 2 / cards.length - Math.PI / 2;
    return [card.id, { x: 340 + Math.cos(angle) * 220, y: 275 + Math.sin(angle) * 205 }];
  }));
  const pairs = Object.entries(snapshot.pairCounts).map(([key, count]) => ({ ids: key.split('-').map(Number), count })).filter(pair => pair.count > 0 && pair.ids.length === 2 && pair.ids.every(id => byId.has(id))).sort((a, b) => b.count - a.count || a.ids[0] - b.ids[0] || a.ids[1] - b.ids[1]);
  const maxPair = Math.max(1, ...pairs.map(pair => pair.count));
  pairs.slice(0, 30).forEach(pair => {
    const a = positions.get(pair.ids[0])!, b = positions.get(pair.ids[1])!;
    const highlight = pair.ids.every(id => selected.includes(id));
    const line = svg('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: highlight ? '#be2f69' : '#62625e', 'stroke-opacity': highlight ? .7 : .13 + .2 * pair.count / maxPair, 'stroke-width': 1 + 5 * pair.count / maxPair });
    const title = svg('title', {}); title.textContent = `${byId.get(pair.ids[0])!.name} × ${byId.get(pair.ids[1])!.name}: ${pair.count} responses`; line.append(title); canvas.append(line);
  });
  const maxCount = Math.max(1, ...Object.values(snapshot.cardCounts));
  const palette = ['#68cddc', '#b8a5e7', '#e6da35', '#82c49c', '#f1aac7'];
  cards.forEach((card, i) => {
    const pos = positions.get(card.id)!;
    const count = snapshot.cardCounts[String(card.id)] || 0;
    const description = `${card.name}: selected in ${count} ${count === 1 ? 'response' : 'responses'}.`;
    const group = svg('g', { class: 'mind-node', role: 'button', tabindex: 0, 'aria-label': description });
    const radius = cards.length > 20 ? 9 + 7 * Math.sqrt(count / maxCount) : 17 + 17 * Math.sqrt(count / maxCount);
    const circle = svg('circle', { cx: pos.x, cy: pos.y, r: radius, fill: selected.includes(card.id) ? '#f15c9a' : palette[i % palette.length], 'stroke-width': selected.includes(card.id) ? 3 : 1.5 });
    const number = svg('text', { x: pos.x, y: pos.y + 5, 'text-anchor': 'middle', 'font-size': cards.length > 20 ? 10 : 14 }); number.textContent = String(count);
    group.append(circle, number);
    if (cards.length <= 20) { const name = svg('text', { x: pos.x, y: pos.y + radius + 18, 'text-anchor': 'middle', 'font-size': 12 }); name.textContent = card.name; group.append(name); }
    const activate = () => { status.textContent = description + ` ${snapshot.total} responses in the event.`; };
    group.addEventListener('click', activate);
    group.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(); } });
    canvas.append(group);
  });
  const center = svg('text', { x: 340, y: 270, 'text-anchor': 'middle', 'font-family': 'Outfit Variable, sans-serif', 'font-size': 34, 'font-weight': 600, fill: '#171717', stroke: '#f7f4ee', 'stroke-width': 10, 'paint-order': 'stroke' }); center.textContent = String(snapshot.total); canvas.append(center);
  const label = svg('text', { x: 340, y: 291, 'text-anchor': 'middle', 'font-family': 'Outfit Variable, sans-serif', 'font-size': 11, fill: '#171717', stroke: '#f7f4ee', 'stroke-width': 7, 'paint-order': 'stroke' }); label.textContent = 'RESPONSES'; canvas.append(label);
  [...cards].sort((a, b) => (snapshot.cardCounts[b.id] || 0) - (snapshot.cardCounts[a.id] || 0) || a.id - b.id).forEach(card => {
    const li = document.createElement('li'); const name = document.createElement('span'); name.textContent = card.name; const count = document.createElement('b'); count.textContent = String(snapshot.cardCounts[card.id] || 0); li.append(name, count); list.append(li);
  });
  pairs.slice(0, 10).forEach(pair => { const li = document.createElement('li'); li.textContent = `${byId.get(pair.ids[0])!.name} × ${byId.get(pair.ids[1])!.name} — ${pair.count}`; pairsList.append(li); });
  if (!pairs.length) { const li = document.createElement('li'); li.textContent = 'The first response will create the first connections.'; pairsList.append(li); }
}
