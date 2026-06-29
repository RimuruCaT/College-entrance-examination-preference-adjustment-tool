const state = {
  headers: [],
  rows: [],
  pinned: [],
  sortable: [],
  draggedId: null,
};

const fileInput = document.querySelector('#csvFile');
const pinnedList = document.querySelector('#pinnedList');
const sortableList = document.querySelector('#sortableList');
const summary = document.querySelector('#summary');
const resetBtn = document.querySelector('#resetBtn');
const exportBtn = document.querySelector('#exportBtn');
const safeWindow = document.querySelector('#safeWindow');
const safeWindowValue = document.querySelector('#safeWindowValue');
const template = document.querySelector('#cardTemplate');

fileInput.addEventListener('change', handleFile);
resetBtn.addEventListener('click', resetOrder);
exportBtn.addEventListener('click', exportCsv);
safeWindow.addEventListener('input', () => {
  safeWindowValue.textContent = `${safeWindow.value} 位`;
  render();
});

async function handleFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  loadCsv(text);
}

function loadCsv(text) {
  const table = parseCsv(text.trimStart().replace(/^\uFEFF/, ''));
  if (table.length < 2) {
    alert('CSV 至少需要表头和一条志愿记录。');
    return;
  }

  state.headers = table[0];
  state.rows = table.slice(1).filter(row => row.some(cell => cell.trim() !== '')).map((cells, index) => ({
    id: crypto.randomUUID(),
    originalIndex: index,
    cells: normalizeRow(cells, state.headers.length),
  }));
  state.pinned = state.rows.filter(isPinned);
  state.sortable = state.rows.filter(row => !isPinned(row));
  resetBtn.disabled = false;
  exportBtn.disabled = false;
  render();
}

function normalizeRow(row, length) {
  return Array.from({ length }, (_, index) => row[index] ?? '');
}

function isPinned(row) {
  const rankIndex = findHeaderIndex(['25年位次', '位次', '排序', '备注']);
  return rankIndex >= 0 && row.cells[rankIndex].trim() === '不参与排序';
}

function findHeaderIndex(candidates) {
  return state.headers.findIndex(header => candidates.includes(header.trim()));
}

function render() {
  renderSummary();
  renderList(pinnedList, state.pinned, false);
  renderList(sortableList, state.sortable, true);
}

function renderSummary() {
  if (!state.rows.length) {
    summary.innerHTML = '';
    return;
  }
  const maxMove = Math.max(0, ...state.sortable.map((row, index) => Math.abs(row.originalIndex - (state.pinned.length + index))));
  summary.innerHTML = [
    ['志愿总数', state.rows.length],
    ['固定置顶', state.pinned.length],
    ['可调整', state.sortable.length],
    ['当前最大移动', `${maxMove} 位`],
  ].map(([label, value]) => `<div class="stat"><span>${label}</span><strong>${value}</strong></div>`).join('');
}

function renderList(container, rows, sortable) {
  container.classList.toggle('empty', rows.length === 0);
  container.innerHTML = rows.length ? '' : (state.rows.length ? '暂无记录' : '请先上传 CSV');
  rows.forEach((row, index) => container.appendChild(createCard(row, index, sortable)));
}

function createCard(row, index, sortable) {
  const card = template.content.firstElementChild.cloneNode(true);
  const currentIndex = sortable ? state.pinned.length + index : index;
  const moved = currentIndex - row.originalIndex;
  const overWindow = Math.abs(moved) > Number(safeWindow.value);
  card.dataset.id = row.id;
  card.draggable = sortable;
  card.classList.toggle('warn', sortable && overWindow);
  card.querySelector('.card-title').textContent = `${currentIndex + 1}. ${cell(row, '院校名称')} · ${cell(row, '专业名称')}`;
  card.querySelector('.card-meta').textContent = `原序号：${cell(row, '序号') || row.originalIndex + 1}｜院校代码：${cell(row, '院校代码')}｜专业代码：${cell(row, '专业代码')}｜25年位次：${cell(row, '25年位次')}`;
  const note = card.querySelector('.move-note');
  note.textContent = moved === 0 ? '未改变相对位置' : `${moved > 0 ? '下移' : '上移'} ${Math.abs(moved)} 位`;
  note.classList.toggle('warn', sortable && overWindow);

  if (sortable) {
    card.addEventListener('dragstart', () => {
      state.draggedId = row.id;
      card.classList.add('dragging');
    });
    card.addEventListener('dragend', () => {
      state.draggedId = null;
      card.classList.remove('dragging');
    });
    card.addEventListener('dragover', event => event.preventDefault());
    card.addEventListener('drop', event => {
      event.preventDefault();
      moveDraggedBefore(row.id);
    });
    card.querySelector('.up').addEventListener('click', () => moveBy(index, -1));
    card.querySelector('.down').addEventListener('click', () => moveBy(index, 1));
  } else {
    card.querySelector('.card-actions').remove();
  }
  return card;
}

function cell(row, header) {
  const index = state.headers.indexOf(header);
  return index >= 0 ? row.cells[index] : '';
}

function moveBy(index, delta) {
  const target = index + delta;
  if (target < 0 || target >= state.sortable.length) return;
  const [item] = state.sortable.splice(index, 1);
  state.sortable.splice(target, 0, item);
  render();
}

function moveDraggedBefore(targetId) {
  if (!state.draggedId || state.draggedId === targetId) return;
  const from = state.sortable.findIndex(row => row.id === state.draggedId);
  const to = state.sortable.findIndex(row => row.id === targetId);
  if (from < 0 || to < 0) return;
  const [item] = state.sortable.splice(from, 1);
  state.sortable.splice(to, 0, item);
  render();
}

function resetOrder() {
  state.sortable = state.rows.filter(row => !isPinned(row));
  render();
}

function exportCsv() {
  const ordered = [...state.pinned, ...state.sortable].map((row, index) => {
    const cells = [...row.cells];
    const seqIndex = state.headers.indexOf('序号');
    if (seqIndex >= 0) cells[seqIndex] = String(index + 1);
    return cells;
  });
  const csv = [state.headers, ...ordered].map(formatCsvRow).join('\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = '调整后志愿表.csv';
  link.click();
  URL.revokeObjectURL(link.href);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cellText = '';
  let inQuotes = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && inQuotes && next === '"') {
      cellText += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      row.push(cellText);
      cellText = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cellText);
      rows.push(row);
      row = [];
      cellText = '';
    } else {
      cellText += char;
    }
  }
  row.push(cellText);
  rows.push(row);
  return rows;
}

function formatCsvRow(row) {
  return row.map(value => {
    const text = String(value ?? '');
    return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }).join(',');
}
